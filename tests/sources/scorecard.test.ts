import { describe, expect, it } from "vitest";
import { readScorecard } from "@/lib/sources/scorecard";
import { withFixtures } from "../helpers/fixtures";

describe("scorecard", () => {
  it("reads the captured scorecard with its not-measured list", async () => {
    await withFixtures();
    const signal = await readScorecard();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.observedAt).toBe(signal.value.generated_at);
    expect(Object.keys(signal.value.repos).length).toBeGreaterThan(0);
    expect(signal.value.not_measured.length).toBeGreaterThan(0);
  });

  it("is unknown on 404 and on a bad shape", async () => {
    await withFixtures([{ raw: "test-pipelines/results/scorecard.json", status: 404, body: "" }]);
    const missing = await readScorecard();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain("returned 404");
  });

  it("rejects a scorecard without repos", async () => {
    await withFixtures([{ raw: "test-pipelines/results/scorecard.json", body: '{"generated_at":"2026-10-06T00:00:00Z"}' }]);
    const signal = await readScorecard();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("repos");
  });
});
