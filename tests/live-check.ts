import { describe, it } from "vitest";
import { WRITERS } from "@/config/freshness";
import { hasToken, requestsThisHour } from "@/lib/github";
import { readLatestCanaryReport } from "@/lib/sources/canary-report";
import { readCanaryDays } from "@/lib/sources/canary-runs";
import { readChannelsConfig } from "@/lib/sources/channels-config";
import { readBranchChecks } from "@/lib/sources/checks";
import { readLatestDeployment } from "@/lib/sources/deployments";
import { readFailures } from "@/lib/sources/failures";
import { readIssues } from "@/lib/sources/issues";
import { readLedger } from "@/lib/sources/ledger";
import { listPerfMetrics, readPerfSeries } from "@/lib/sources/perf";
import { readPointer } from "@/lib/sources/pointers";
import { readMergedPulls, readOpenPulls, readReviewRequested } from "@/lib/sources/pulls";
import { readGateRepos, readOrgRepos, readProducts } from "@/lib/sources/registry";
import { readReleaseChannels } from "@/lib/sources/release-channels";
import { readScorecard } from "@/lib/sources/scorecard";
import { readTreeHistory } from "@/lib/sources/tree-history";
import { readTreeStatus } from "@/lib/sources/tree-status";
import { readWriterRuns } from "@/lib/sources/writer-runs";
import type { Signal } from "@/lib/signal";

// Runs every source once against the live branches and prints one line each: counts and states,
// never whole files. `pnpm live` (set GITHUB_TOKEN for the API sources). Nothing here asserts:
// a source that is down prints its reason, which is the point.

const rows: string[] = [];

function line<T>(name: string, signal: Signal<T>, summary: (value: T) => string): void {
  const state = signal.ok ? "ok     " : "unknown";
  const text = signal.ok ? summary(signal.value) : signal.reason;
  rows.push(`${state}  ${name.padEnd(34)} ${text}${signal.observedAt ? `  (as of ${signal.observedAt})` : ""}`);
}

describe("live sources", () => {
  it("raw sources", async () => {
    line("infra-config/repos", await readProducts(), (v) => `${v.length} products: ${v.map((p) => p.name).join(", ")}`);
    line("infra-config/channels", await readChannelsConfig(), (v) => `${v.channels.length} channels: ${v.channels.map((c) => c.name).join(", ")}`);
    line("gate/settings", await readGateRepos(), (v) => `${v.length} repos`);
    line("release/channels", await readReleaseChannels(), (v) => `${Object.keys(v).length} repos`);
    for (const repo of ["innernet", "xo-space"]) {
      line(`release/pointer/${repo}/lkgr`, await readPointer(repo, "lkgr"), (v) => `${v.commit.slice(0, 7)} gen ${v.generation}${v.pending ? " pending" : ""}`);
      line(`release/pointer/${repo}/canary`, await readPointer(repo, "channels/canary"), (v) => `${v.commit.slice(0, 7)} gen ${v.generation}`);
      const { listing, days } = await readCanaryDays(repo, 14);
      if (listing) line(`release/canary-listing/${repo}`, listing, (v) => `${v.length} run files`);
      const outcomes = days.map((d) => (d.run.ok ? (d.run.value?.outcome ?? "-") : "?"));
      rows.push(`ok       release/canary/${repo}`.padEnd(45) + outcomes.join(" "));
      line(`gardener/tree-status/${repo}`, await readTreeStatus(repo), (v) => `${v.state}: ${v.reason}`);
      line(`perf/metrics/${repo}`, await listPerfMetrics(repo), (v) => v.join(", "));
    }
    line("release/report", await readLatestCanaryReport(), (v) => `${v.date}, ${v.markdown.length} chars`);
    line("test-pipelines/scorecard", await readScorecard(), (v) => `${Object.keys(v.repos).length} repos, ${v.not_measured.length} not measured`);
    const perf = await readPerfSeries("innernet", "build-size");
    line("perf/innernet/build-size", perf, (v) => `${v.records.length} records, ${v.skipped} skipped`);
  });

  it("GitHub API sources", async () => {
    rows.push(`token: ${hasToken() ? "present" : "absent"}`);
    line("github/pulls/open", await readOpenPulls(), (v) => `${v.pulls.length} open`);
    line("github/pulls/merged", await readMergedPulls(), (v) => `${v.pulls.length} merged in 7 days`);
    line("github/pulls/review-requested", await readReviewRequested(), (v) => `${v.pulls.length} waiting`);
    line("github/issues/qq-failure", await readIssues("qq-failure"), (v) => `${v.length} open`);
    line("github/issues/canary-report", await readIssues("canary-report"), (v) => `${v.length} open`);
    line("github/org-repos", await readOrgRepos(), (v) => `${v.length} repos`);
    line("gardener/tree-history", await readTreeHistory(), (v) => `${v.length} commits, ${v.filter((c) => c.changed.length).length} changes`);
    line("gardener/ledger", await readLedger(), (v) => `${v.reverts} reverts, ${v.landed} landed`);
    line("test-pipelines/failures", await readFailures(), (v) => `${v.length} records, ${v.filter((f) => f.demo).length} demo`);
    for (const repo of ["monitoring", "innernet", "xo-space"]) {
      line(`github/checks/${repo}`, await readBranchChecks(repo, "main"), (v) => `${v.state}: ${v.summary}`);
      line(`github/deployments/${repo}`, await readLatestDeployment(repo), (v) => (v ? `${v.state} ${v.sha.slice(0, 7)} ${v.status}` : "none"));
    }
    for (const writer of WRITERS) {
      line(`writer/${writer.id}`, await readWriterRuns(writer), (v) => (v[0] ? `${v.length} runs, newest ${v[0].conclusion} at ${v[0].completedAt}` : "no completed runs"));
    }
    rows.push(`API requests this hour: ${requestsThisHour()}`);
    console.log("\n" + rows.join("\n") + "\n");
  });
});
