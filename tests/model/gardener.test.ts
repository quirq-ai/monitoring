import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGardener, cadenceCell } from "@/lib/model/gardener";
import { HISTORY_COMMITS } from "@/lib/sources/tree-history";
import type { WorkflowRun } from "@/lib/sources/writer-runs";
import { FIXTURE_TOKEN, withFixtures } from "../helpers/fixtures";

const A = "1111111111111111111111111111111111111111";
const B = "2222222222222222222222222222222222222222";
const C = "3333333333333333333333333333333333333333";

// A closed tree with one red range of two suspects, the first red from a backfill (synthetic,
// in the shape of gardener src/qqgarden/model.py RedSpan at 1eb981e).
const closed = JSON.stringify({
  schema: "qq-tree-status/1",
  repo: "innernet",
  branch: "main",
  state: "closed",
  reason: "innernet-postsubmit is red",
  head: C,
  green: A,
  builders: { "innernet-postsubmit": { commit: C, state: "red", url: "https://github.com/quirq-ai/innernet/actions/runs/7" } },
  red: [
    {
      builder: "innernet-postsubmit",
      first_bad: C,
      latest_bad: C,
      last_good: A,
      suspects: [B, C],
      url: "https://github.com/quirq-ai/innernet/actions/runs/7",
      first_bad_attempt: 1,
      first_bad_backfill: true,
      first_bad_running: false,
      title: "a commit title that must never be shown",
    },
  ],
  // Coverage entries are "<sha> <builder>", as gardener postsubmit.py writes them.
  coverage: { commits: 12, since: A, missing: [`${B} innernet-postsubmit`], cancelled: [], pending: [], backfilling: [`${C} innernet-postsubmit`], retried: [] },
  notes: [],
});

function runs(minutesAgo: number[]): { ok: true; value: WorkflowRun[]; source: string; sourceUrl: string; fetchedAt: string; maxAge: number } {
  const now = Date.now();
  return {
    ok: true,
    source: "writer/gardener/tree-status",
    sourceUrl: "https://github.com/quirq-ai/gardener/actions/workflows/tree-status.yml",
    fetchedAt: new Date().toISOString(),
    maxAge: 300,
    value: minutesAgo.map((m, i) => ({ id: i, event: "workflow_dispatch", conclusion: "success", branch: "main", sha: A, url: `https://github.com/quirq-ai/gardener/actions/runs/${i}`, completedAt: new Date(now - m * 60_000).toISOString() })),
  };
}

describe("gardener page model", () => {
  it("covers the repos the gardener lists, from its own files, and leaks no token", async () => {
    const fixtures = await withFixtures();
    const view = await buildGardener();
    expect(view.repos.ok && view.repos.list.map((r) => r.name)).toEqual(["xo-space", "innernet"]);
    // website is a product, but the gardener does not watch it, so it is not on this page.
    expect(JSON.stringify(view)).not.toContain("website");
    const xo = view.repos.ok ? view.repos.list[0] : undefined;
    expect(xo?.tree.state).toBe("green");
    expect(xo?.coverage?.cell.state).toBe("green");
    expect(view.writer.state).toBe("green");
    // Every open/close in the commits read, not just the last day's, newest first.
    expect(view.history.ok && view.history.events.map((e) => `${e.repo} ${e.state}`).slice(0, 2)).toEqual(["innernet open", "innernet closed"]);
    expect(view.history.ok && view.history.events.length).toBe(4);
    expect(view.ledger).toMatchObject({ state: "none", text: expect.stringContaining("not started") });
    expect(JSON.stringify(view)).not.toContain(FIXTURE_TOKEN);
    expect(fixtures.log.nonGet).toBe(0);
    // index, two status files, pins and the pinned caps (raw); commits, runs and two ledger listings (API).
    expect(fixtures.log.requests).toBeLessThanOrEqual(10);
  });

  it("never calls the App or the ledger done", async () => {
    await withFixtures();
    const view = await buildGardener();
    const by = Object.fromEntries(view.readiness.map((r) => [r.label, r.cell.state]));
    expect(by).toEqual({ "quirq gardener App": "unknown", "ledger branch": "pending", auto_land_repos: "pending" });
    expect(view.policy.ok && view.policy.value.pin).toBe("bf3ad29834d85489c49aa6d41ec3c7e59474b746");
  });

  it("shows a closed tree's red range, holes and suspects by sha only", async () => {
    await withFixtures([{ raw: "gardener/tree-status/status/innernet.json", body: closed }]);
    const view = await buildGardener();
    const inn = view.repos.ok ? view.repos.list.find((r) => r.name === "innernet") : undefined;
    expect(inn?.tree.state).toBe("red");
    expect(inn?.coverage?.cell.state).toBe("red");
    expect(inn?.coverage?.missing).toEqual([{ sha: B, builder: "innernet-postsubmit" }]);
    expect(inn?.coverage?.backfilling).toEqual([{ sha: C, builder: "innernet-postsubmit" }]);
    expect(inn?.red).toEqual([
      {
        builder: "innernet-postsubmit",
        lastGood: A,
        firstBad: C,
        suspects: [B, C],
        rangeUrl: `https://github.com/quirq-ai/innernet/compare/${A}...${C}`,
        runUrl: "https://github.com/quirq-ai/innernet/actions/runs/7",
        backfill: true,
        rerunning: false,
        failure: expect.objectContaining({ state: "unknown", text: expect.stringContaining("no entry for this range yet") }),
        steps: [],
      },
    ]);
    expect(JSON.stringify(view)).not.toContain("a commit title");
  });

  it("drops a link that does not point at github.com and a sha that is not hex", async () => {
    const odd = JSON.parse(closed);
    odd.builders["innernet-postsubmit"].url = "javascript:alert(1)";
    odd.red[0].url = "https://evil.example/run";
    odd.red[0].suspects = ["not-a-sha", B];
    await withFixtures([{ raw: "gardener/tree-status/status/innernet.json", body: JSON.stringify(odd) }]);
    const view = await buildGardener();
    const inn = view.repos.ok ? view.repos.list.find((r) => r.name === "innernet") : undefined;
    expect(inn?.builders[0].cell.url).toMatch(/^https:\/\/github\.com\//);
    expect(inn?.red[0].runUrl).toMatch(/^https:\/\/github\.com\//);
    expect(inn?.red[0].suspects).toEqual([B]);
  });

  it("never shows an open tree as green while the gardener is stale", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", body: JSON.stringify({ total_count: 1, workflow_runs: [{ id: 1, event: "schedule", status: "completed", conclusion: "success", head_branch: "main", html_url: "https://github.com/quirq-ai/gardener/actions/runs/1", created_at: "{{now-3h}}", updated_at: "{{now-3h}}" }] }) }]);
    const view = await buildGardener();
    expect(view.writer.state).toBe("stale");
    for (const r of view.repos.ok ? view.repos.list : []) expect(r.tree.state).toBe("stale");
  });

  it("is unknown, never empty, when the index or the token is missing", async () => {
    await withFixtures([{ raw: "gardener/tree-status/status/README.md", status: 500, body: "boom" }]);
    const view = await buildGardener();
    expect(view.repos.ok).toBe(false);
    await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const noToken = await buildGardener();
    expect(noToken.api.state).toBe("no-token");
    expect(noToken.writer.state).toBe("unknown");
    expect(noToken.cadence.state).toBe("unknown");
    expect(noToken.history.ok).toBe(false);
    expect(noToken.ledger.state).toBe("unknown");
    // The raw files still show.
    expect(noToken.repos.ok && noToken.repos.list.length).toBe(2);
    expect(noToken.policy.ok).toBe(true);
  });
});

describe("failure type", () => {
  const RUN = "https://github.com/quirq-ai/innernet/actions/runs/7";
  const group = (over: object = {}) => ({ repo: "innernet", last_good: A, first_bad: C, builders: ["innernet-postsubmit"], runs: [RUN], kind: "build", failed_steps: ["innernet-postsubmit: build (node)"], ...over });
  const read = async (groups: object[] | null, schema = "qq-gardener-groups/1") => {
    const routes = [{ raw: "gardener/tree-status/status/innernet.json", body: closed }];
    if (groups) routes.push({ raw: "gardener/tree-status/groups/groups.json", body: JSON.stringify({ schema, groups }) });
    else routes.push({ raw: "gardener/tree-status/groups/groups.json", body: "404: Not Found", status: 404 } as never);
    await withFixtures(routes);
    const view = await buildGardener();
    return view.repos.ok ? view.repos.list.find((r) => r.name === "innernet")?.red[0] : undefined;
  };

  it("shows a build break's type and failed steps as a fact", async () => {
    const r = await read([group()]);
    expect(r?.failure).toMatchObject({ state: "none", text: expect.stringMatching(/^build: /) });
    expect(r?.steps).toEqual(["innernet-postsubmit: build (node)"]);
  });

  it("shows an infra failure, and an unknown type as unknown", async () => {
    expect((await read([group({ kind: "infra", failed_steps: ["innernet-postsubmit: fetch"] })]))?.failure.text).toMatch(/^infra: /);
    const unknown = await read([group({ kind: "unknown", failed_steps: [] })]);
    expect(unknown?.failure).toMatchObject({ state: "unknown", text: expect.stringContaining("could not tell the type") });
  });

  it("is unknown when the groups file is a run behind, missing or of another schema", async () => {
    // a stale file: the same range, but an older first red run; then another range entirely
    for (const stale of [group({ runs: [RUN.replace("/7", "/6")] }), group({ last_good: B }), group({ builders: ["lint-postsubmit"] }), group({ repo: "xo-space" })]) {
      const r = await read([stale]);
      expect(r?.failure.state, JSON.stringify(stale)).toBe("unknown");
      expect(r?.steps).toEqual([]);
    }
    expect((await read(null))?.failure).toMatchObject({ state: "unknown", text: "tree-status: groups/groups.json is not published yet" });
    expect((await read([group()], "qq-gardener-groups/2"))?.failure.state).toBe("unknown");
  });

  it("lists at most ten steps, cut to 200 characters, and counts the rest", async () => {
    const steps = Array.from({ length: 12 }, (_, i) => `innernet-postsubmit: test (${"x".repeat(i === 0 ? 300 : 3)}${i})`);
    const r = await read([group({ kind: "test", failed_steps: steps })]);
    expect(r?.steps).toHaveLength(10);
    expect(r?.steps[0]).toHaveLength(200);
    expect(r?.failure.text).toContain("2 more failed steps not shown");
  });
});

describe("coverage", () => {
  const status = (coverage: object) => JSON.stringify({ ...JSON.parse(closed), state: "open", red: [], builders: { "innernet-postsubmit": { commit: C, state: "green", url: "https://github.com/quirq-ai/innernet/actions/runs/8" } }, coverage });
  const read = async (coverage: object) => {
    await withFixtures([{ raw: "gardener/tree-status/status/innernet.json", body: status(coverage) }]);
    const view = await buildGardener();
    return view.repos.ok ? view.repos.list.find((r) => r.name === "innernet")?.coverage : undefined;
  };
  const empty = { commits: 6, since: A, missing: [], cancelled: [], pending: [], backfilling: [], retried: [] };

  it("is pending, with the commit and its builder, in the gardener's real file", async () => {
    // Captured from gardener tree-status at d78ccf3: one running commit.
    const real = readFileSync(new URL("../fixtures/captured/gardener-tree-status-d78ccf3-xo-space.json", import.meta.url), "utf8");
    await withFixtures([{ raw: "gardener/tree-status/status/xo-space.json", body: real }]);
    const view = await buildGardener();
    const xo = view.repos.ok ? view.repos.list.find((r) => r.name === "xo-space")?.coverage : undefined;
    expect(xo?.cell).toMatchObject({ state: "pending", text: "0 backfilling, 1 running; 25 commits checked" });
    expect(xo?.pending).toEqual([{ sha: "3bb8687307144ab604723e7c13f49753b22dc0e0", builder: "xo-space-postsubmit" }]);
  });

  it("is red for a missing or cancelled commit, and counts an entry it cannot read", async () => {
    const c = await read({ ...empty, missing: [`${A} innernet-postsubmit`], cancelled: [`${C} innernet-postsubmit`], pending: [`${B} innernet-postsubmit`] });
    expect(c?.cell).toMatchObject({ state: "red", text: expect.stringMatching(/^2 commits have no post-submit result/) });
    expect(c?.cancelled).toEqual([{ sha: C, builder: "innernet-postsubmit" }]);
    const odd = await read({ ...empty, missing: ["not a commit <b>"] });
    expect(odd?.cell).toMatchObject({ state: "red", text: expect.stringContaining("1 entry could not be read") });
    expect(odd?.missing).toEqual([]);
    expect(JSON.stringify(odd)).not.toContain("<b>");
  });

  it("is pending for a running entry it cannot read, and shows only a safe builder name", async () => {
    const odd = await read({ ...empty, pending: ["???"] });
    expect(odd?.cell).toMatchObject({ state: "pending", text: expect.stringContaining("1 entry could not be read") });
    const named = await read({ ...empty, pending: [`${A} <img src=x>`, `${B} innernet-postsubmit`] });
    expect(named?.pending).toEqual([{ sha: B, builder: "innernet-postsubmit" }]);
    expect(named?.unread).toBe(1);
  });

  it("is unknown, not green, when no commit was checked yet", async () => {
    expect((await read({ ...empty, commits: 0, since: "" }))?.cell.state).toBe("unknown");
    expect((await read(empty))?.cell).toMatchObject({ state: "green", text: "every commit has a result; 6 commits checked" });
  });

  it("is stale, not green, when the status file was read too long ago", async () => {
    await withFixtures([{ raw: "gardener/tree-status/status/innernet.json", body: status(empty), headers: { date: "{{now-2h}}" } }]);
    const view = await buildGardener();
    const inn = view.repos.ok ? view.repos.list.find((r) => r.name === "innernet") : undefined;
    expect(inn?.tree.state).toBe("stale");
    expect(inn?.builders[0].cell.state).toBe("stale");
    expect(inn?.coverage?.cell.state).toBe("stale");
  });
});

describe("history", () => {
  it("says older changes are not read when a full page came back", async () => {
    const commits = Array.from({ length: HISTORY_COMMITS }, (_, i) => ({
      sha: i.toString(16).padStart(40, "0"),
      html_url: `https://github.com/quirq-ai/gardener/commit/${i.toString(16).padStart(40, "0")}`,
      commit: { message: "tree-status: innernet open", author: { name: "quirq-gardener", date: "{{now-1h}}" }, committer: { name: "GitHub", date: "{{now-1h}}" } },
    }));
    await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", body: JSON.stringify(commits) }]);
    const view = await buildGardener();
    expect(view.history).toMatchObject({ ok: true, commits: HISTORY_COMMITS, full: true });
    // A history link that does not point at github.com falls back to the branch's commit list.
    const bad = commits.slice(0, 3).map((c, i) => ({ ...c, html_url: "javascript:alert(1)", commit: { ...c.commit, message: `tree-status: innernet ${i % 2 ? "closed" : "open"}` } }));
    await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", body: JSON.stringify(bad) }]);
    const odd = await buildGardener();
    expect(odd.history.ok && odd.history.events.length).toBeGreaterThanOrEqual(2);
    for (const e of odd.history.ok ? odd.history.events : []) expect(e.url).toMatch(/^https:\/\/github\.com\//);
    await withFixtures();
    const short = await buildGardener();
    expect(short.history.ok && short.history.full).toBe(false);
  });
});

describe("chain pace", () => {
  it("is green at about five minutes and stale when only the cron is left", () => {
    expect(cadenceCell(runs([1, 6, 11, 16, 21]))).toMatchObject({ state: "green", text: "about every 5 min over the last 5 runs" });
    expect(cadenceCell(runs([1, 31, 61, 91]))).toMatchObject({ state: "stale" });
  });

  it("is stale once no run has finished for longer than the writer's window", () => {
    expect(cadenceCell(runs([180, 185, 190, 195, 200]))).toMatchObject({ state: "stale", text: expect.stringContaining("the chain has stopped") });
  });

  it("cannot tell from fewer than three runs", () => {
    expect(cadenceCell(runs([1, 6])).state).toBe("unknown");
  });
});
