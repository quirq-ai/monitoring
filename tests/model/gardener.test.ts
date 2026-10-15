import { describe, expect, it } from "vitest";
import { buildGardener, cadenceCell } from "@/lib/model/gardener";
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
  coverage: { commits: 12, since: A, missing: [B], cancelled: [], pending: [], backfilling: [C], retried: [] },
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
    expect(inn?.coverage?.missing).toEqual([B]);
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

describe("chain pace", () => {
  it("is green at about five minutes and stale when only the cron is left", () => {
    expect(cadenceCell(runs([1, 6, 11, 16, 21]))).toMatchObject({ state: "green", text: "about every 5 min over the last 5 runs" });
    expect(cadenceCell(runs([1, 31, 61, 91]))).toMatchObject({ state: "stale" });
  });

  it("cannot tell from fewer than three runs", () => {
    expect(cadenceCell(runs([1, 6])).state).toBe("unknown");
  });
});
