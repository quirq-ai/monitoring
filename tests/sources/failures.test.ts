import { describe, expect, it } from "vitest";
import { readFailure, readFailures } from "@/lib/sources/failures";
import { withFixtures } from "../helpers/fixtures";

describe("failures", () => {
  it("lists the records and marks the planted demo", async () => {
    await withFixtures();
    const signal = await readFailures();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.length).toBe(1);
    expect(signal.value[0].id).toBe("canary-held-aefebec4c11f668b");
    expect(signal.value[0].demo).toBe(true);
    expect(signal.value[0].subject).toBe("planted-canary-demo-v0");
  });

  it("is unknown when the directory is missing or a record is broken", async () => {
    await withFixtures([
      { path: "/repos/quirq-ai/test-pipelines/contents/failures", status: 404, body: '{"message":"Not Found"}' },
    ]);
    const missing = await readFailures();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("results: no failures directory yet");
  });

  it("is unknown when a listed record cannot be read, saying how many", async () => {
    await withFixtures([{ raw: "test-pipelines/results/failures/qq-failure-canary-held-aefebec4c11f668b/failure.json", status: 500, body: "" }]);
    const signal = await readFailures();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("1 of 1 records unreadable");
  });

  it("refuses a record with another schema", async () => {
    await withFixtures([
      { raw: "test-pipelines/results/failures/qq-failure-canary-held-aefebec4c11f668b/failure.json", body: '{"schema":"quirq-results/2","id":"x"}' },
    ]);
    const signal = await readFailure("qq-failure-canary-held-aefebec4c11f668b");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("quirq-results/2 is not quirq-results/1");
  });
});
