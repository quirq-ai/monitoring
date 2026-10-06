import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/model/build";
import { SnapshotSchema } from "@/lib/model/types";
import { FIXTURE_TOKEN, withFixtures } from "../helpers/fixtures";

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
    for (const item of today) expect(item.url, item.title).toMatch(/^https:\/\//);
    expect(today.map((t) => t.at)).toEqual([...today.map((t) => t.at)].sort().reverse());

    expect(waiting.map((w) => `${w.kind} ${w.repo} ${w.title}`).sort()).toEqual([
      "failure release #44 qq-failure: xo-space canary held at verify (" + new Date().toISOString().slice(0, 10) + ")",
      "held xo-space canary held at verify",
      "review innernet #118 Search: rank recent sources first",
      "stale-approval xo-space #77 Inbox: poll connections every 30 s",
    ]);
    expect(counts.waiting).toBe(waiting.length);
    expect(counts.waiting).toBe(4);
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
    const innernet = snapshot.board[0].repos.find((r) => r.name === "innernet");
    expect(innernet?.ci).toMatchObject({ state: "unknown", text: "no token" });
    expect(innernet?.tree?.state).toBe("green");
    expect(innernet?.lkgr?.state).toBe("green");
    expect(snapshot.release.repos.length).toBe(2);
  });
});
