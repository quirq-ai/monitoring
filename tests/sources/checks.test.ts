import { describe, expect, it } from "vitest";
import { readBranchChecks, rollup } from "@/lib/sources/checks";
import { withFixtures } from "../helpers/fixtures";

describe("checks", () => {
  it("rolls up the captured monitoring check run", async () => {
    await withFixtures();
    const signal = await readBranchChecks("monitoring", "main");
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.state).toBe("green");
    expect(signal.value.headSha).toBe("dd0e680b761429093de688446802256c18bfc540");
    expect(signal.value.summary).toBe("1 check passed");
  });

  it("is red with the failed names, pending while running, unknown with none", async () => {
    await withFixtures();
    expect((await readBranchChecks("xo-space", "main")).ok && (await readBranchChecks("xo-space", "main"))).toMatchObject({ value: { state: "red", summary: "1 of 2 failed: presubmit" } });
    expect(await readBranchChecks("gate", "main")).toMatchObject({ value: { state: "pending" } });
    expect(await readBranchChecks("wiki", "main")).toMatchObject({ value: { state: "unknown", summary: "no check runs on the head commit" } });
  });

  it("names a missing branch", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/innernet/commits/nope/check-runs", status: 404, body: "{}" }]);
    const signal = await readBranchChecks("innernet", "nope");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("no branch nope");
  });

  it("rollup treats timed out and action required as red", () => {
    const base = { url: "", completedAt: null };
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "timed_out" }]).state).toBe("red");
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "action_required" }]).state).toBe("red");
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "success" }, { ...base, name: "b", status: "queued", conclusion: "" }]).state).toBe("pending");
  });
});
