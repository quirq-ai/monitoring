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

  it("is unknown on a malformed response and without a token", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/innernet/commits/main/check-runs", body: '{"check_runs": "nope"}' }]);
    const bad = await readBranchChecks("innernet", "main");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("does not match schema");
    delete process.env.GITHUB_TOKEN;
    expect(await readBranchChecks("innernet", "main")).toMatchObject({ ok: false, reason: "no token" });
  });

  it("says so for a branch name it cannot put in a URL, instead of throwing", async () => {
    await withFixtures();
    const signal = await readBranchChecks("innernet", "main branch");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("not a usable branch name");
  });

  it("stays red when a failure is among the runs read, even with more runs unread", async () => {
    const body = { total_count: 80, check_runs: [{ name: "presubmit", status: "completed", conclusion: "failure", html_url: null, head_sha: "a".repeat(40), completed_at: "2026-10-06T10:00:00Z" }] };
    const path = "/repos/quirq-ai/innernet/commits/main/check-runs";
    // The later pages answer with no runs, so 79 stay unread.
    await withFixtures([{ path, query: { page: "*" }, body: JSON.stringify({ total_count: 80, check_runs: [] }) }, { path, body: JSON.stringify(body) }]);
    const signal = await readBranchChecks("innernet", "main");
    expect(signal.ok && signal.value).toMatchObject({ state: "red", summary: "1 of 1 failed: presubmit (1 of 80 read)" });
  });

  const run = (name: string, conclusion = "success") => ({ name, status: "completed", conclusion, html_url: null, head_sha: "b".repeat(40), completed_at: "2026-10-21T06:00:00Z", app: { slug: "github-actions" } });
  const tp = "/repos/quirq-ai/test-pipelines/commits/main/check-runs";

  it("leaves test-pipelines' per-repo compat runs out of its own rollup, and nothing else", async () => {
    const runs = [run("presubmit"), run("compat (galileo)", "failure"), run("compat (cli-console)", "failure")];
    await withFixtures([{ path: tp, body: JSON.stringify({ total_count: runs.length, check_runs: runs }) }]);
    const signal = await readBranchChecks("test-pipelines", "main");
    expect(signal.ok && signal.value).toMatchObject({ state: "green", summary: "1 check passed" });
    expect(signal.ok && signal.value.checks.map((c) => c.name)).toEqual(["presubmit"]);

    const own = [run("presubmit"), run("compat-publish", "failure"), run("compat", "failure")];
    await withFixtures([{ path: tp, body: JSON.stringify({ total_count: own.length, check_runs: own }) }]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "red", summary: "2 of 3 failed: compat-publish, compat" } });

    // The same names on another repo are that repo's own checks.
    await withFixtures([{ path: "/repos/quirq-ai/innernet/commits/main/check-runs", body: JSON.stringify({ total_count: 1, check_runs: [run("compat (galileo)", "failure")] }) }]);
    expect(await readBranchChecks("innernet", "main")).toMatchObject({ value: { state: "red" } });

    // Only GitHub Actions jobs are left out: the same name from another app is test-pipelines' own.
    const other = [run("presubmit"), { ...run("compat (galileo)", "failure"), app: { slug: "some-ci" } }, { ...run("compat (qq)", "failure"), app: null }];
    await withFixtures([{ path: tp, body: JSON.stringify({ total_count: other.length, check_runs: other }) }]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "red", summary: "2 of 3 failed: compat (galileo), compat (qq)" } });
  });

  it("reads every page of a head with more than 50 runs before it drops the compat ones", async () => {
    const compat = Array.from({ length: 50 }, (_, i) => run(`compat (repo-${i})`, i % 2 ? "failure" : "success"));
    const fixtures = await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 52, check_runs: [run("presubmit"), run("scorecard")] }) },
      { path: tp, body: JSON.stringify({ total_count: 52, check_runs: compat }) },
    ]);
    const signal = await readBranchChecks("test-pipelines", "main");
    expect(signal.ok && signal.value).toMatchObject({ state: "green", summary: "2 checks passed" });
    expect(fixtures.log.api).toBe(2);
  });

  it("is unknown when a later page cannot be read, and stops at four pages", async () => {
    await withFixtures([
      { path: tp, query: { page: "2" }, status: 502, body: "{}" },
      { path: tp, body: JSON.stringify({ total_count: 60, check_runs: Array.from({ length: 50 }, () => run("presubmit")) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown", summary: "60 check runs on the head commit; only 50 read" } });

    const page = Array.from({ length: 50 }, () => run("presubmit"));
    const fixtures = await withFixtures([{ path: tp, body: JSON.stringify({ total_count: 500, check_runs: page }) }]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown", summary: "500 check runs on the head commit; only 200 read" } });
    expect(fixtures.log.api).toBe(4);

    await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 60 }) },
      { path: tp, body: JSON.stringify({ total_count: 60, check_runs: Array.from({ length: 50 }, () => run("presubmit")) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown", summary: "60 check runs on the head commit; only 50 read" } });
  });

  // Each page is cached on its own and the path names the branch, so two pages can come from
  // different listings. Each case below summed to green before.
  const byId = (ids: number[], sha = "a".repeat(40), failed = -1) => ids.map((id) => ({ ...run(`job-${id}`, id === failed ? "failure" : "success"), id, head_sha: sha }));
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from - i);

  it("is never green when the pages come from different listings", async () => {
    // The listing grew between the reads: a failing run 99 is now first, so page 2 repeats run 2.
    await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 52, check_runs: byId([2, 1]) }) },
      { path: tp, body: JSON.stringify({ total_count: 51, check_runs: byId(range(51, 50)) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown", summary: "check runs on the head commit changed between pages; 52 read" } });

    // Page 1 is from the old head commit, page 2 from the new one.
    await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 60, check_runs: byId(range(210, 10), "c".repeat(40)) }) },
      { path: tp, body: JSON.stringify({ total_count: 60, check_runs: byId(range(160, 50)) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown", headSha: "a".repeat(40) } });

    // The same total and head, but a run read twice (so another one was not read at all).
    await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 60, check_runs: byId(range(11, 10)) }) },
      { path: tp, body: JSON.stringify({ total_count: 60, check_runs: byId(range(60, 50)) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "unknown" } });

    // A failure among the runs read is still red.
    await withFixtures([
      { path: tp, query: { page: "2" }, body: JSON.stringify({ total_count: 52, check_runs: byId([2, 1]) }) },
      { path: tp, body: JSON.stringify({ total_count: 51, check_runs: byId(range(51, 50), "a".repeat(40), 7) }) },
    ]);
    expect(await readBranchChecks("test-pipelines", "main")).toMatchObject({ value: { state: "red", summary: "1 of 52 failed: job-7 (read while the runs changed)" } });
  });

  it("rollup never calls skipped or neutral checks passed, and timed out or action required red", () => {
    const base = { url: "", completedAt: null };
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "skipped" }])).toMatchObject({ state: "unknown" });
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "success" }, { ...base, name: "b", status: "completed", conclusion: "neutral" }])).toMatchObject({ state: "green", summary: "1 check passed, 1 neutral" });
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "stale" }]).state).toBe("unknown");
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "timed_out" }]).state).toBe("red");
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "action_required" }]).state).toBe("red");
    expect(rollup([{ ...base, name: "a", status: "completed", conclusion: "success" }, { ...base, name: "b", status: "queued", conclusion: "" }]).state).toBe("pending");
  });
});
