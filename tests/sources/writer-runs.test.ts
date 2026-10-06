import { describe, expect, it } from "vitest";
import { WRITERS } from "@/config/freshness";
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
