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

  it("is unknown, not 'not measured', when the 404 says the perf-data branch is missing", async () => {
    const fixtures = await withFixtures([{ path: "/repos/quirq-ai/perf/contents/innernet", status: 404, body: JSON.stringify({ message: "No commit found for the ref perf-data", documentation_url: "https://docs.github.com/rest/repos/contents" }) }]);
    const gone = await listPerfMetrics("innernet");
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.reason).toBe("perf-data: GitHub API returned 404: No commit found for the ref perf-data");
    // The 404 is remembered for the listing's window, and the remembered one carries the same message.
    const again = await listPerfMetrics("innernet");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("perf-data: GitHub API returned 404: No commit found for the ref perf-data");
    expect(fixtures.log.requests, "the second call answers from memory").toBe(1);
  });

  it("lists nothing for a repo perf does not measure, and is unknown when the listing is refused or without a token", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/perf/contents/xo-space", status: 403, body: JSON.stringify({ message: "Resource not accessible by personal access token" }) }]);
    const none = await listPerfMetrics("website");
    expect(none.ok && none.value, "a 404 is not measured, not a failure").toEqual([]);
    const refused = await listPerfMetrics("xo-space");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("perf-data: GitHub API refused (403): Resource not accessible by personal access token");
    delete process.env.GITHUB_TOKEN;
    const noToken = await listPerfMetrics("innernet");
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe("perf-data: no token");
  });
});
