import { describe, expect, it } from "vitest";
import { readMergedPulls, readOpenPulls, readReviewRequested, readReviewStatus, readReviewedByOwner } from "@/lib/sources/pulls";
import { withFixtures } from "../helpers/fixtures";

describe("pulls", () => {
  it("reads the open PRs of the org with their repo", async () => {
    await withFixtures();
    const signal = await readOpenPulls();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.pulls.length).toBe(5);
    expect(signal.value.pulls.map((p) => p.repo)).toContain("xo-space");
    expect(signal.value.pulls.find((p) => p.number === 118)?.assignees).toEqual(["sharmasuraj0123"]);
    expect(signal.value.pulls.filter((p) => p.draft).length).toBe(2);
  });

  it("reads merged PRs with their merge time", async () => {
    await withFixtures();
    const signal = await readMergedPulls(new Date("2026-10-07T00:00:00Z"));
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.pulls.find((p) => p.repo === "monitoring")?.mergedAt).toBe("2026-10-06T17:16:30Z");
  });

  it("reads the owner's queue", async () => {
    await withFixtures();
    const requested = await readReviewRequested();
    expect(requested.ok && requested.value.pulls.map((p) => p.number)).toEqual([118]);
    const reviewed = await readReviewedByOwner();
    expect(reviewed.ok && reviewed.value.pulls.map((p) => p.number)).toEqual([77]);
  });

  it("notices an approval on an older head", async () => {
    await withFixtures();
    const signal = await readReviewStatus("xo-space", 77);
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.latestState).toBe("APPROVED");
    expect(signal.value.approvalStale).toBe(true);
    expect(signal.value.headSha).not.toBe(signal.value.reviewedSha);
  });

  it("is unknown without a token and on a rate limit", async () => {
    await withFixtures([{ path: "/search/issues", query: { q: "org:quirq-ai is:pr is:open" }, status: 403, body: '{"message":"rate limited"}' }]);
    const limited = await readOpenPulls();
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.reason).toContain("refused (403)");
    delete process.env.GITHUB_TOKEN;
    const noToken = await readOpenPulls();
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe("no token");
  });

  it("is unknown on a malformed search answer", async () => {
    await withFixtures([{ path: "/search/issues", body: '{"total_count":1,"items":[{"number":"x"}]}' }]);
    const signal = await readOpenPulls();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("does not match schema");
  });

  it("refuses a bad login or PR number before any request", async () => {
    await withFixtures();
    expect(() => readReviewRequested("a b")).toThrow("not a GitHub login");
    await expect(readReviewStatus("xo-space", -1)).rejects.toThrow("not a PR number");
  });
});
