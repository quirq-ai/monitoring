import { describe, expect, it } from "vitest";
import { listPerfMetrics, readPerfSeries } from "@/lib/sources/perf";
import { withFixtures } from "../helpers/fixtures";

describe("perf", () => {
  it("lists metrics and reads a series", async () => {
    await withFixtures();
    const metrics = await listPerfMetrics("innernet");
    expect(metrics.ok && metrics.value).toEqual(["build-size", "innernet-search"]);
    const series = await readPerfSeries("innernet", "build-size");
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.value.records.length).toBeGreaterThan(0);
    expect(series.value.records[0].schema).toBe("qq-perf-record/1");
    expect(series.value.skipped).toBe(0);
  });

  it("skips a bad line and says how many", async () => {
    await withFixtures([{ raw: "perf/perf-data/innernet/build-size.jsonl", body: '{"schema":"qq-perf-record/1","repo":"innernet","metric":"build-size","commit":"a","recorded_at":"2026-10-01T00:00:00Z","status":"ok"}\nnot json\n' }]);
    const series = await readPerfSeries("innernet", "build-size");
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.value.records.length).toBe(1);
    expect(series.value.skipped).toBe(1);
  });

  it("is unknown when a series is missing or a record has no status", async () => {
    await withFixtures([{ raw: "perf/perf-data/innernet/build-size.jsonl", status: 404, body: "" }]);
    expect((await readPerfSeries("innernet", "build-size")).ok).toBe(false);
    await withFixtures([{ raw: "perf/perf-data/innernet/build-size.jsonl", body: '{"schema":"qq-perf-record/1","repo":"innernet","metric":"build-size","commit":"a","recorded_at":"2026-10-01T00:00:00Z"}\n' }]);
    const noStatus = await readPerfSeries("innernet", "build-size");
    expect(noStatus.ok).toBe(false);
    if (!noStatus.ok) expect(noStatus.reason).toContain("1 line(s) skipped");
  });

  it("is unknown for a repo with no data and without a token", async () => {
    await withFixtures();
    const none = await listPerfMetrics("website");
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toBe("perf-data: no perf data for website");
    delete process.env.GITHUB_TOKEN;
    const noToken = await listPerfMetrics("innernet");
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe("perf-data: no token");
  });
});
