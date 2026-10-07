import { describe, expect, it } from "vitest";
import { WRITERS } from "@/config/freshness";
import { isApiOutageReason } from "@/lib/github";
import { readWriterRuns } from "@/lib/sources/writer-runs";
import { withFixtures } from "../helpers/fixtures";

const treeStatus = WRITERS.find((w) => w.id === "gardener/tree-status")!;

describe("writer runs", () => {
  it("reads the completed runs and drops cancelled ones", async () => {
    await withFixtures();
    const signal = await readWriterRuns(treeStatus);
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.length).toBe(2);
    expect(signal.value.every((r) => r.conclusion !== "cancelled")).toBe(true);
    expect(signal.value[0].completedAt >= signal.value[1].completedAt).toBe(true);
    expect(signal.observedAt).toBe(signal.value[0].completedAt);
  });

  it("every writer in the table has a workflow the fixtures answer", async () => {
    await withFixtures();
    for (const writer of WRITERS) {
      const signal = await readWriterRuns(writer);
      expect(signal.ok, writer.id).toBe(true);
    }
  });

  it("is stale with no run inside the window, and says so with no completed run at all", async () => {
    await withFixtures([
      { path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", file: "api/runs_stale.json" },
      { path: "/repos/quirq-ai/release/actions/workflows/lkgr.yml/runs", file: "api/runs_empty.json" },
    ]);
    const stale = await readWriterRuns(treeStatus);
    expect(stale.ok && stale.value.map((r) => r.completedAt)).toEqual(["2026-10-05T18:53:00Z"]);
    const empty = await readWriterRuns(WRITERS.find((w) => w.id === "release/lkgr")!);
    expect(empty.ok && empty.value).toEqual([]);
    expect(empty.observedAt).toBeUndefined();
  });

  it("asks for the default branch and drops a run from another branch", async () => {
    const fixtures = await withFixtures([
      { path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", body: JSON.stringify({ total_count: 1, workflow_runs: [{ id: 1, event: "pull_request", status: "completed", conclusion: "success", head_branch: "feature", head_sha: "a", html_url: "https://github.com/x", created_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z" }] }) },
    ]);
    const signal = await readWriterRuns(treeStatus);
    expect(signal.ok && signal.value).toEqual([]);
    expect(fixtures.log.requests).toBe(1);
  });

  it("is unknown on a malformed response", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", body: '{"workflow_runs": 5}' }]);
    const signal = await readWriterRuns(treeStatus);
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("does not match schema");
  });

  it("carries GitHub's own message when the token is refused", async () => {
    const message = "Resource not accessible by personal access token";
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", status: 403, body: JSON.stringify({ message, documentation_url: "https://docs.github.com/rest" }) }]);
    const refused = await readWriterRuns(treeStatus);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe(`GitHub API refused (403): ${message}`);
    expect(isApiOutageReason(refused.ok ? "" : refused.reason), "a refused token is the row's own reason, not an outage").toBe(false);
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", status: 403, body: "not json" }]);
    const bare = await readWriterRuns(treeStatus);
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.reason).toBe("GitHub API refused (403)");
    const long = "x".repeat(300);
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", status: 403, body: JSON.stringify({ message: `${long}\n\nsecond line` }) }]);
    const cut = await readWriterRuns(treeStatus);
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.reason.length).toBeLessThanOrEqual("GitHub API refused (403): ".length + 120);
  });

  it("is unknown when the workflow is missing or the token is", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/actions/workflows/tree-status.yml/runs", status: 404, body: "{}" }]);
    const missing = await readWriterRuns(treeStatus);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("tree-status.yml not found in gardener");
    delete process.env.GITHUB_TOKEN;
    const noToken = await readWriterRuns(treeStatus);
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe("no token");
  });
});
