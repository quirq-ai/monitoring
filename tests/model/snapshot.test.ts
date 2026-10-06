import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSnapshot, markSuperseded, short } from "@/lib/model/build";
import { SnapshotSchema } from "@/lib/model/types";
import { FIXTURE_TOKEN, withFixtures } from "../helpers/fixtures";

const fixture = (path: string) => readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
const today = () => new Date().toISOString().slice(0, 10);

/** The fixture repos.toml with its [[repo]] blocks in another order, or one renamed. */
function reposToml(edit: (blocks: string[]) => string[]): string {
  const [head, ...blocks] = fixture("raw/infra-config/main/config/repos.toml").split("\n[[repo]]\n");
  return [head, ...edit(blocks)].join("\n[[repo]]\n");
}

const lkgrMoved = JSON.stringify({
  schema: "qq-pointer/1",
  repo: "innernet",
  ref: "lkgr",
  commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  generation: 4,
  updated_at: "{{now-3h}}",
  history: [{ commit: "8f383a3d6c28f1e4495ff177efe70dca43d17604", generation: 3, updated_at: "2026-10-04T23:38:10Z" }],
});

describe("snapshot", () => {
  it("validates against its own schema and carries no token", async () => {
    await withFixtures();
    const snapshot = await buildSnapshot();
    const checked = SnapshotSchema.safeParse(snapshot);
    expect(checked.success, JSON.stringify(checked.success ? "" : checked.error.issues.slice(0, 3))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(FIXTURE_TOKEN);
    expect(JSON.stringify(snapshot)).not.toContain("Authorization");
  });

  it("shows a merged PR, an lkgr move, a held canary, a new failure and a tree close once each, with links", async () => {
    await withFixtures([{ raw: "release/release-state/pointers/innernet/lkgr.json", body: lkgrMoved }]);
    const { today, waiting, counts } = await buildSnapshot({ window: "24h" });
    const kinds = (kind: string) => today.filter((t) => t.kind === kind);
    expect(kinds("merged").map((t) => t.title)).toContain("merged #117 Fix: sources page scroll on phones");
    expect(kinds("merged").filter((t) => t.title.startsWith("merged #117")).length).toBe(1);
    expect(kinds("lkgr").filter((t) => `${t.repo} ${t.title}` === "innernet lkgr moved to aaaaaaa").length).toBe(1);
    expect(kinds("canary").filter((t) => t.state === "held").map((t) => t.repo)).toEqual(["xo-space"]);
    expect(kinds("issue").map((t) => t.title)).toEqual([expect.stringContaining("issue #44 qq-failure")]);
    expect(kinds("tree").map((t) => `${t.repo} ${t.title}`)).toEqual(["innernet tree open", "innernet tree closed"]);
    for (const item of today) expect(item.url, item.title).toMatch(/^(https:\/\/|\/health$)/);
    expect(today.map((t) => t.at)).toEqual([...today.map((t) => t.at)].sort().reverse());

    expect(waiting.map((w) => `${w.kind} ${w.repo} ${w.title}`).sort()).toEqual([
      "failure release #44 qq-failure: xo-space canary held at verify (" + new Date().toISOString().slice(0, 10) + ")",
      "held xo-space canary held at verify",
      "review innernet #118 Search: rank recent sources first",
      "stale-approval xo-space #77 Inbox: poll connections every 30 s",
    ]);
    expect(counts.waiting).toBe(waiting.length);
    expect(counts.waiting).toBe(4);
    expect(counts.waitingComplete).toBe(true);
    expect(counts.redOrHeld).toBe(3);
    expect(counts.redOrHeldComplete).toBe(true);
    expect(counts.todayComplete, "every source healthy, so the list is complete (website has no lkgr by design)").toBe(true);
  });

  it("keeps a cleared alarm out of what needs a look: the newest event per subject is the current one", async () => {
    await withFixtures();
    const { today } = await buildSnapshot({ window: "24h" });
    const trees = today.filter((t) => t.kind === "tree" && t.repo === "innernet");
    expect(trees.map((t) => `${t.title} ${t.superseded ? "superseded" : "current"}`)).toEqual(["tree open current", "tree closed superseded"]);
    expect(today.filter((t) => (t.state === "red" || t.state === "held") && !t.superseded).map((t) => t.kind)).not.toContain("tree");
    const marked = markSuperseded([
      { kind: "canary", repo: "x", title: "canary shipped", at: "2026-10-06T10:00:00Z", url: "https://a", state: "green" },
      { kind: "canary", repo: "x", title: "canary held", at: "2026-10-05T10:00:00Z", url: "https://b", state: "held" },
      { kind: "issue", repo: "x", title: "issue", at: "2026-10-04T10:00:00Z", url: "https://c", state: "red" },
    ]);
    expect(marked.map((m) => Boolean(m.superseded))).toEqual([false, true, false]);
  });

  it("puts a failed writer in what needs a look, linked to Health, and counts it in the third tile", async () => {
    await withFixtures();
    const { today, counts, health } = await buildSnapshot();
    const scorecard = health.writers.find((w) => w.id === "test-pipelines/scorecard");
    expect(scorecard?.state).toBe("red");
    const item = today.find((t) => t.kind === "writer");
    expect(item).toMatchObject({ repo: "test-pipelines", state: "red", url: "/health", at: scorecard?.lastRun?.at });
    expect(item?.title).toContain("scorecard writer failure");
    const unreadable = (await buildSnapshot()).sources.filter((s) => !s.ok).length;
    expect(counts.unknownOrStale).toBe(unreadable + health.writers.filter((w) => w.state === "red" || w.state === "stale").length);
  });

  it("marks a product outside the canary as such instead of reading a pointer it has no reason to have", async () => {
    const fixtures = await withFixtures();
    const { board, sources } = await buildSnapshot();
    const website = board[0].repos.find((r) => r.name === "website");
    expect(website?.lkgr).toMatchObject({ state: "none", text: "not in the canary yet" });
    expect(sources.some((s) => s.source === "release/pointer/website/lkgr")).toBe(false);
    expect(fixtures.log.misses.some((m) => m.includes("pointers/website"))).toBe(false);
  });

  it("turns one odd default-branch name into one unknown cell, not a 500 for every page", async () => {
    const org = JSON.parse(fixture("api/org_repos.json")) as { name: string; default_branch: string }[];
    const odd = org.map((r) => (r.name === "wiki" ? { ...r, default_branch: "main branch" } : r));
    await withFixtures([{ path: "/orgs/quirq-ai/repos", body: JSON.stringify(odd) }]);
    const { board } = await buildSnapshot();
    const wiki = board.flatMap((g) => g.repos).find((r) => r.name === "wiki");
    expect(wiki?.ci).toMatchObject({ state: "unknown", text: expect.stringContaining("not a usable branch name") });
    expect(board.flatMap((g) => g.repos).find((r) => r.name === "gate")?.ci.state).toBe("pending");
  });

  it("dates each page by its own sources and says when nothing was read", async () => {
    await withFixtures([{ path: "/orgs/quirq-ai/repos", file: "api/org_repos.json", headers: { date: "{{now-50m}}" } }]);
    const fresh = await buildSnapshot();
    for (const read of Object.values(fresh.reads)) {
      expect(read.asOf).toBeDefined();
      expect((Date.now() - new Date(read.asOf ?? 0).getTime()) / 60_000, "the hour-old org list does not date a page").toBeLessThan(5);
      expect(read.stale).toBe(false);
    }
    await withFixtures([{ raw: "**", status: 500, body: "boom" }, { path: "/**", status: 500, body: "{}" }]);
    const down = await buildSnapshot();
    expect(down.reads.today.asOf, "nothing read, so no 'just now'").toBeUndefined();
    expect(down.reads.waiting.asOf).toBeUndefined();
  });

  it("marks the tiles and lists stale when a read behind them is long past its window", async () => {
    await withFixtures([{ path: "/search/issues", query: { q: "org:quirq-ai is:pr is:open" }, file: "api/search_pulls_open.json", headers: { date: "{{now-1h}}" } }]);
    const { reads } = await buildSnapshot();
    expect(reads.waiting.stale).toBe(true);
    expect(reads.board.stale).toBe(true);
    expect(reads.today.stale, "the open-PR search does not feed Today").toBe(false);
  });

  it("marks a row quiet when its only unknowns are the API banner's cause, so the phone Board can fold it", async () => {
    await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const { board } = await buildSnapshot();
    const infra = board.find((g) => g.id === "infra")?.repos ?? [];
    expect(infra.length).toBeGreaterThan(5);
    for (const row of infra) expect(row.quiet, row.name).toBe(true);
    expect(infra[0].ci.because).toBe("api");
    const xo = board[0].repos.find((r) => r.name === "xo-space");
    expect(xo?.quiet, "a red CI and a held canary are not the banner's doing").toBe(false);
  });

  it("stops calling for a minute after a 5xx, and caps a far-off rate-limit reset at an hour", async () => {
    const fixtures = await withFixtures([{ path: "/**", status: 503, body: "{}" }]);
    const first = await buildSnapshot();
    const calls = fixtures.log.api;
    expect(calls).toBeGreaterThan(0);
    expect(first.health.api).toMatchObject({ state: "down", text: expect.stringContaining("503") });
    await buildSnapshot();
    expect(fixtures.log.api, "no call while backed off").toBe(calls);
    const far = String(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
    await withFixtures([{ path: "/search/issues", status: 403, body: "{}", headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": far } }]);
    const limited = await buildSnapshot();
    const until = new Date(limited.health.api.until ?? 0).getTime();
    expect(until - Date.now()).toBeLessThanOrEqual(60 * 60_000 + 5_000);
  });

  it("marks a count incomplete, never a green zero, when a source behind it is down", async () => {
    await withFixtures([
      { path: "/search/issues", status: 500, body: "{}" },
      { path: "/repos/quirq-ai/*/commits/main/check-runs", status: 500, body: "{}" },
    ]);
    const { counts, waiting } = await buildSnapshot();
    expect(counts.waitingComplete).toBe(false);
    expect(counts.redOrHeldComplete).toBe(false);
    expect(waiting.map((w) => w.kind)).toEqual(["held"]);
  });

  it("links a held item to the run file when the run has no url and no hold record", async () => {
    const held = JSON.parse(fixture("raw/release/release-state/canary/xo-space/runs/{{today}}.json"));
    held.run_url = "";
    await withFixtures([
      { raw: `release/release-state/canary/xo-space/runs/${today()}.json`, body: JSON.stringify(held) },
      { raw: `release/release-state/canary/xo-space/held/${held.commit}.json`, status: 404, body: "" },
    ]);
    const { waiting, release } = await buildSnapshot();
    const item = waiting.find((w) => w.kind === "held");
    expect(item?.title).toBe("canary held at verify");
    expect(item?.url).toBe(`https://github.com/quirq-ai/release/blob/release-state/canary/xo-space/runs/${today()}.json`);
    expect(release.repos.find((r) => r.repo === "xo-space")?.hold).toBeUndefined();
  });

  it("keeps each product's own hold when infra-config lists the products in another order", async () => {
    await withFixtures([{ raw: "infra-config/main/config/repos.toml", body: reposToml((b) => [b[1], b[0], b[2]]) }]);
    const { release } = await buildSnapshot();
    expect(release.repos.map((r) => `${r.repo} ${r.hold?.commit ?? "-"} ${r.latest?.outcome}`)).toEqual([
      "xo-space 14b21a41668bc8124b4cf5cf9cd59fb44dc7d419 held",
      "innernet - shipped",
    ]);
  });

  it("turns the registry unknown, not the page into a 500, when a product name is not a repo name", async () => {
    await withFixtures([{ raw: "infra-config/main/config/repos.toml", body: reposToml((b) => b.map((x) => x.replace('name = "website"', 'name = "web/site"'))) }]);
    const snapshot = await buildSnapshot();
    expect(snapshot.sources.find((s) => s.source === "infra-config/repos")?.reason).toContain("not a repo name");
    expect(snapshot.board.map((g) => g.id)).toContain("infra");
    expect(snapshot.board.find((g) => g.id === "products")).toBeUndefined();
  });

  it("shows the canary stale, never green, when no run file exists in the window", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/release/contents/canary/xo-space/runs", body: "[]" }]);
    const { board, release } = await buildSnapshot();
    const xo = board[0].repos.find((r) => r.name === "xo-space");
    expect(xo?.canary).toMatchObject({ state: "stale", text: "no run in 14 days, canary at 14b21a4" });
    expect(release.repos.find((r) => r.repo === "xo-space")?.latest).toBeUndefined();
  });

  it("shows the canary unknown with the reason when the run files cannot be read", async () => {
    await withFixtures([{ raw: "release/release-state/canary/xo-space/runs/*", status: 500, body: "boom" }]);
    const { board } = await buildSnapshot();
    const xo = board[0].repos.find((r) => r.name === "xo-space");
    expect(xo?.canary?.state).toBe("unknown");
    expect(xo?.canary?.text).toContain("500");
  });

  it("matches the channel cells to channels.json and the strip to the run files", async () => {
    await withFixtures();
    const { release } = await buildSnapshot();
    const channels = JSON.parse(fixture("raw/release/release-state/channels.json")) as Record<string, Record<string, { commit: string; generation: number }>>;
    for (const r of release.repos) {
      for (const [name, entry] of Object.entries(channels[r.repo] ?? {})) {
        expect(r.channels[name], `${r.repo} ${name}`).toMatchObject({ state: "green", text: `${short(entry.commit)} gen ${entry.generation}` });
      }
    }
    const xo = release.repos.find((r) => r.repo === "xo-space");
    const byDate = Object.fromEntries((xo?.days ?? []).map((d) => [d.date, d.outcome]));
    // The templated file for the request day wins over a captured file of the same date.
    const files = new Map([["2026-10-05", "2026-10-05"], ["2026-10-06", "2026-10-06"], [today(), "{{today}}"]]);
    for (const [date, file] of files) {
      const run = JSON.parse(fixture(`raw/release/release-state/canary/xo-space/runs/${file}.json`));
      expect(byDate[date], date).toBe(run.outcome === "later" ? "noop" : run.outcome);
    }
    expect(Object.values(byDate).filter((o) => o === "none").length, JSON.stringify(byDate)).toBe(14 - files.size);
    expect(release.report?.date).toBe(today());
  });

  it("names a public repo no registry knows", async () => {
    const org = JSON.parse(fixture("api/org_repos.json")) as Record<string, unknown>[];
    const extra = { ...org[0], name: "zz-not-registered", full_name: "quirq-ai/zz-not-registered", description: "synthetic", archived: false };
    await withFixtures([{ path: "/orgs/quirq-ai/repos", body: JSON.stringify([...org, extra]) }]);
    const { board, unregistered } = await buildSnapshot();
    expect(unregistered).toEqual(["zz-not-registered"]);
    expect(board.at(-1)?.id).toBe("unregistered");
    expect(board.at(-1)?.repos[0]).toMatchObject({ name: "zz-not-registered", registered: false });
  });

  it("makes at most 70 API requests for one cold render", async () => {
    const fixtures = await withFixtures();
    await buildSnapshot();
    expect(fixtures.log.api, `${fixtures.log.api} API requests`).toBeLessThanOrEqual(70);
    expect(fixtures.log.nonGet).toBe(0);
  });

  it("never counts the planted demo record", async () => {
    await withFixtures();
    const { today, waiting } = await buildSnapshot({ window: "7d" });
    expect(waiting.some((w) => w.title.includes("Planted"))).toBe(false);
    for (const item of today.filter((t) => t.kind === "failure")) expect(item.demo).toBe(true);
  });

  it("turns one source's part unknown and renders the rest when that source is down", async () => {
    await withFixtures([{ raw: "release/release-state/channels.json", status: 500, body: "boom" }]);
    const snapshot = await buildSnapshot();
    const innernet = snapshot.board.find((g) => g.id === "products")?.repos.find((r) => r.name === "innernet");
    expect(innernet?.canary?.state).toBe("unknown");
    expect(innernet?.canary?.text).toContain("channels.json returned 500");
    expect(innernet?.ci.state).toBe("green");
    expect(snapshot.release.repos[0].channels.canary.state).toBe("unknown");
    expect(snapshot.sources.find((s) => s.source === "release/channels")?.ok).toBe(false);
    expect(snapshot.counts.unknownOrStale).toBeGreaterThan(0);
  });

  it("lists every repo from the three registries once and flags the rest", async () => {
    await withFixtures();
    const { board, unregistered } = await buildSnapshot();
    const names = board.flatMap((g) => g.repos.map((r) => r.name));
    expect(new Set(names).size).toBe(names.length);
    for (const repo of ["innernet", "xo-space", "website", "gate", "release", "gardener", "monitoring", "wiki", "euler"]) expect(names).toContain(repo);
    expect(board.map((g) => g.id)).toEqual(["products", "infra", "apps", "knowledge", "other"]);
    expect(unregistered).toEqual([]);
    const xo = board[0].repos.find((r) => r.name === "xo-space");
    expect(xo?.ci.state).toBe("red");
    expect(xo?.tree?.state).toBe("green");
    expect(xo?.canary?.state).toBe("held");
    expect(board[0].repos.find((r) => r.name === "website")?.deploy?.state).toBe("red");
    expect(xo?.deploy, "xo-space deploys through the installer channel, not Vercel").toBeUndefined();
    expect(board[0].repos.find((r) => r.name === "website")?.canary).toMatchObject({ state: "none", text: "no channels configured" });
    expect(board[0].repos.map((r) => r.name), "the repos that need a look come first").toEqual(["xo-space", "website", "innernet"]);
    expect(board[0].repos.find((r) => r.name === "innernet")?.lastMerge.state).toBe("none");
    expect(board.find((g) => g.id === "infra")?.repos[0].name, "the pending gate CI sorts above green rows").toBe("gate");
  });

  it("judges writers: fresh, failed inside the window, and stale", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/perf/actions/workflows/perf.yml/runs", file: "api/runs_stale.json" }]);
    const { health } = await buildSnapshot();
    const by = (id: string) => health.writers.find((w) => w.id === id);
    expect(by("gardener/tree-status")?.state).toBe("green");
    expect(by("test-pipelines/scorecard")?.state).toBe("red");
    expect(by("test-pipelines/scorecard")?.reason).toContain("the data may still be current");
    expect(by("perf/perf")?.state).toBe("stale");
    expect(health.ledger.state).toBe("unknown");
    expect(health.ledger.text).toBe("ledger not started");
    expect(health.tokenPresent).toBe(true);
  });

  it("without a token every API cell says so and the raw cells still render", async () => {
    await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const snapshot = await buildSnapshot();
    expect(snapshot.health.tokenPresent).toBe(false);
    expect(snapshot.health.api.state).toBe("no-token");
    const innernet = snapshot.board[0].repos.find((r) => r.name === "innernet");
    expect(innernet?.ci).toMatchObject({ state: "unknown", text: "no token" });
    // The files still read, but their writers' runs cannot, so the cells are unknown, never green.
    expect(innernet?.tree).toMatchObject({ state: "unknown", text: expect.stringContaining("every post-submit builder") });
    expect(innernet?.lkgr?.state).toBe("unknown");
    expect(snapshot.release.repos.length).toBe(2);
    expect(snapshot.counts.waitingComplete).toBe(false);
    expect(snapshot.counts.todayComplete).toBe(false);
  });

  it("never shows a file-backed cell green while its writer is stale, red or unknown", async () => {
    await withFixtures([
      { path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", file: "api/runs_stale.json" },
      { path: "/repos/quirq-ai/release/actions/workflows/canary.yml/runs", file: "api/runs_test-pipelines_scorecard.json" },
    ]);
    const { board, health } = await buildSnapshot();
    expect(health.writers.find((w) => w.id === "gardener/tree-status")?.state).toBe("stale");
    expect(health.writers.find((w) => w.id === "release/canary")?.state).toBe("red");
    const innernet = board[0].repos.find((r) => r.name === "innernet");
    expect(innernet?.tree).toMatchObject({ state: "stale", text: expect.stringContaining("gardener stale") });
    expect(innernet?.canary?.state).toBe("stale");
    expect(innernet?.lkgr?.state).toBe("green");
    for (const row of board[0].repos) for (const cell of [row.tree, row.canary]) expect(cell?.state).not.toBe("green");
  });

  it("dates a read by the response, and marks a cell stale when its cache window is long past", async () => {
    await withFixtures([{ raw: "release/release-state/channels.json", file: "raw/release/release-state/channels.json", headers: { date: "{{now-1h}}" } }]);
    const snapshot = await buildSnapshot();
    const channels = snapshot.sources.find((s) => s.source === "release/channels");
    const age = (Date.now() - new Date(channels?.fetchedAt ?? 0).getTime()) / 60_000;
    expect(age, "fetchedAt comes from the Date header").toBeGreaterThan(55);
    expect(channels?.maxAge).toBe(120);
    expect(snapshot.release.repos[0].channels.canary).toMatchObject({ state: "stale", text: expect.stringContaining("not refreshed yet") });
    expect(new Date(snapshot.reads.today.asOf ?? 0).getTime()).toBeLessThanOrEqual(new Date(channels?.fetchedAt ?? 0).getTime());
    expect(snapshot.reads.today.stale).toBe(true);
  });

  it("explains a rate limit once, in the API state, and stops calling until it resets", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    const limit = { status: 403, body: "{}", headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } };
    const fixtures = await withFixtures([{ path: "/search/issues", ...limit }, { path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", ...limit }]);
    const first = await buildSnapshot();
    expect(first.health.api.state).toBe("rate-limited");
    expect(first.health.api.until).toBeDefined();
    expect(first.board[0].repos[0].ci).toMatchObject({ state: "unknown", text: "rate limited" });
    const innernet = first.board[0].repos.find((r) => r.name === "innernet");
    expect(innernet?.tree?.text, "a gated cell says 'rate limited', not the ISO reset time").not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(innernet?.tree?.text).toContain("rate limited");
    const calls = fixtures.log.api;
    await buildSnapshot();
    expect(fixtures.log.api, "no API call while the limit is in force").toBe(calls);
  });

  it("names a rejected token in the API state", async () => {
    await withFixtures([{ path: "/*", status: 401, body: "{}" }, { path: "/*/*", status: 401, body: "{}" }]);
    const { health } = await buildSnapshot();
    expect(health.api.state).toBe("token-rejected");
  });

  it("remembers a 404 for the cache window instead of asking again", async () => {
    const fixtures = await withFixtures();
    await buildSnapshot();
    const calls = fixtures.log.api;
    const misses = fixtures.log.misses.length;
    await buildSnapshot();
    expect(fixtures.log.misses.length, "no repeated 404s").toBe(misses);
    expect(fixtures.log.api).toBeGreaterThanOrEqual(calls);
  });

  it("says when an open-PR count or a check rollup is cut at the page size", async () => {
    const search = JSON.parse(fixture("api/search_pulls_merged.json")) as { total_count: number };
    const open = { ...search, total_count: 250 };
    await withFixtures([
      { path: "/search/issues", query: { q: "org:quirq-ai is:pr is:open" }, body: JSON.stringify(open) },
      { path: "/repos/quirq-ai/monitoring/commits/main/check-runs", body: JSON.stringify({ ...JSON.parse(fixture("api/monitoring_check-runs.json")), total_count: 80 }) },
    ]);
    const { board } = await buildSnapshot();
    const monitoring = board.flatMap((g) => g.repos).find((r) => r.name === "monitoring");
    expect(monitoring?.openPullsLowerBound).toBe(true);
    expect(monitoring?.ci).toMatchObject({ state: "unknown", text: expect.stringContaining("more than 50 check runs") });
  });

  it("says why the product list is empty when infra-config cannot be read", async () => {
    await withFixtures([{ raw: "infra-config/main/config/repos.toml", status: 502, body: "bad gateway" }]);
    const { release } = await buildSnapshot();
    expect(release.repos).toEqual([]);
    expect(release.reposReason).toContain("502");
  });
});
