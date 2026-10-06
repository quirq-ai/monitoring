import { describe, expect, it } from "vitest";
import { readIssues } from "@/lib/sources/issues";
import { withFixtures } from "../helpers/fixtures";

describe("issues", () => {
  it("reads open qq-failure and canary-report issues", async () => {
    await withFixtures();
    const failures = await readIssues("qq-failure");
    expect(failures.ok).toBe(true);
    if (!failures.ok) return;
    expect(failures.value.length).toBe(1);
    expect(failures.value[0].repo).toBe("release");
    expect(failures.value[0].open).toBe(true);
    const reports = await readIssues("canary-report");
    expect(reports.ok && reports.value[0].title).toContain("Canary report");
  });

  it("is unknown on a bad response shape", async () => {
    await withFixtures([{ path: "/search/issues", body: '{"items": "nope"}' }]);
    const signal = await readIssues("qq-failure");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("does not match schema");
  });
});
