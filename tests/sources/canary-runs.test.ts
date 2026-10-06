import { describe, expect, it } from "vitest";
import { readCanaryDays, readCanaryRun, recentDates } from "@/lib/sources/canary-runs";
import { withFixtures } from "../helpers/fixtures";

describe("canary runs", () => {
  it("reads a captured shipped run", async () => {
    await withFixtures();
    const signal = await readCanaryRun("innernet", "2026-10-05");
    expect(signal.ok && signal.value?.outcome).toBe("shipped");
    if (!signal.ok || !signal.value) return;
    expect(signal.value.stages.map((s) => s.name)).toEqual(["build", "verify", "fuzz-smoke", "deploy-probe", "promote"]);
    expect(signal.value.stages.every((s) => s.ok)).toBe(true);
  });

  it("reads the synthetic held run for today", async () => {
    await withFixtures();
    const today = new Date().toISOString().slice(0, 10);
    const signal = await readCanaryRun("xo-space", today);
    expect(signal.ok && signal.value?.outcome).toBe("held");
    if (!signal.ok || !signal.value) return;
    expect(signal.value.date).toBe(today);
    expect(signal.value.stages.find((s) => s.name === "verify")?.ok).toBe(false);
  });

  it("is a null value, not a failure, on a day with no file", async () => {
    await withFixtures();
    const signal = await readCanaryRun("innernet", "2026-09-01");
    expect(signal.ok).toBe(true);
    if (signal.ok) expect(signal.value).toBeNull();
  });

  it("is unknown on a bad file or schema", async () => {
    await withFixtures([
      { raw: "release/release-state/canary/innernet/runs/2026-10-01.json", body: "nope" },
      { raw: "release/release-state/canary/innernet/runs/2026-10-02.json", body: '{"schema":"qq-canary-run/2","repo":"innernet","date":"2026-10-02","outcome":"shipped"}' },
      { raw: "release/release-state/canary/innernet/runs/2026-10-03.json", status: 500, body: "boom" },
    ]);
    const notJson = await readCanaryRun("innernet", "2026-10-01");
    expect(notJson.ok).toBe(false);
    const wrongSchema = await readCanaryRun("innernet", "2026-10-02");
    expect(wrongSchema.ok).toBe(false);
    if (!wrongSchema.ok) expect(wrongSchema.reason).toContain("qq-canary-run/2 is not qq-canary-run/1");
    const serverError = await readCanaryRun("innernet", "2026-10-03");
    expect(serverError.ok).toBe(false);
    if (!serverError.ok) expect(serverError.reason).toContain("returned 500");
  });

  it("lists the last days newest last", () => {
    const dates = recentDates(3, new Date("2026-10-06T12:00:00Z"));
    expect(dates).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
  });

  it("reads a window of days from one listing, reading only the days that exist", async () => {
    const fixtures = await withFixtures();
    const days = await readCanaryDays("innernet", 3, new Date("2026-10-06T12:00:00Z"));
    expect(days.map((d) => d.date)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(days[0].run.ok && days[0].run.value).toBeNull();
    expect(days[1].run.ok && days[1].run.value?.outcome).toBe("shipped");
    expect(fixtures.log.misses.filter((m) => m.includes("2026-10-04"))).toEqual([]);
    expect(fixtures.log.requests).toBe(3);
  });

  it("probes each day when there is no token to list the directory", async () => {
    const fixtures = await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const days = await readCanaryDays("innernet", 3, new Date("2026-10-06T12:00:00Z"));
    expect(days[0].run.ok && days[0].run.value).toBeNull();
    expect(days[1].run.ok && days[1].run.value?.outcome).toBe("shipped");
    expect(fixtures.log.requests).toBe(3);
  });

  it("accepts the later outcome the writer uses for reruns", async () => {
    await withFixtures([{ raw: "release/release-state/canary/innernet/runs/2026-10-01.json", body: '{"schema":"qq-canary-run/1","repo":"innernet","date":"2026-10-01","outcome":"later"}' }]);
    const signal = await readCanaryRun("innernet", "2026-10-01");
    expect(signal.ok && signal.value?.outcome).toBe("later");
  });

  it("rejects a date that is not a date", async () => {
    await withFixtures();
    await expect(readCanaryRun("innernet", "../x")).rejects.toThrow("not a date");
  });
});
