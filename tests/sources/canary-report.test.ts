import { describe, expect, it } from "vitest";
import { readLatestCanaryReport } from "@/lib/sources/canary-report";
import { withFixtures } from "../helpers/fixtures";

describe("canary report", () => {
  it("finds the newest captured report", async () => {
    await withFixtures();
    // The fixtures also hold a `{{today}}.md` rendered for the real date, so `now` is pinned to a
    // day whose three-day window the real today can never enter again (it failed on 2026-10-07).
    const signal = await readLatestCanaryReport(3, new Date("2026-10-06T12:00:00Z"));
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.date).toBe("2026-10-06");
    expect(signal.value.markdown.length).toBeGreaterThan(50);
  });

  it("is unknown when no day has a report", async () => {
    await withFixtures();
    const signal = await readLatestCanaryReport(3, new Date("2026-09-10T12:00:00Z"));
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("release-state: no report in the last days");
  });
});
