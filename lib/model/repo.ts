import { buildSnapshot, isRegisteredRepo } from "@/lib/model/build";
import { isSafeName } from "@/lib/github";
import type { BoardRow, ReleaseRepo, Snapshot } from "@/lib/model/types";
import type { Signal } from "@/lib/signal";
import { readBranchChecks, type BranchChecks } from "@/lib/sources/checks";
import { listPerfMetrics, readPerfSeries, type PerfRecord } from "@/lib/sources/perf";
import { readOpenPulls, type PullRequest } from "@/lib/sources/pulls";
import { readTreeStatus, type TreeStatus } from "@/lib/sources/tree-status";

// The repo page: the board row plus what only one repo needs. The name is checked against the
// registries before anything is read for it; an unknown name is null, so the page is a 404.

export type PerfMetric = { metric: string; latest: PerfRecord | null; count: number; url: string; reason?: string };

export type RepoView = {
  row: BoardRow;
  snapshot: Snapshot;
  release?: ReleaseRepo;
  pulls: Signal<PullRequest[]>;
  checks: Signal<BranchChecks>;
  tree?: Signal<TreeStatus>;
  perf: PerfMetric[];
  perfReason?: string;
};

export function isRepoName(name: string): boolean {
  return isSafeName(name, 100);
}

/** `null` is a 404: no registry names the repo. `unavailable` is not: the registries could not be read. */
export type RepoLookup = RepoView | null | { unavailable: string };

export async function buildRepoView(name: string): Promise<RepoLookup> {
  if (!isRepoName(name)) return null;
  // The registries are three raw files, cached and read without a token; an unknown name stops
  // here, before the snapshot's API calls (rule 7).
  const known = await isRegisteredRepo(name);
  if (known !== true) return known;
  const snapshot = await buildSnapshot();
  const row = snapshot.board.flatMap((g) => g.repos).find((r) => r.name === name && r.registered);
  if (!row) return null;
  const [pulls, checks, tree, perf] = await Promise.all([
    readOpenPulls(),
    readBranchChecks(row.name, row.defaultBranch),
    row.product ? readTreeStatus(row.name) : Promise.resolve(undefined),
    row.product ? perfMetrics(row.name) : Promise.resolve({ metrics: [] as PerfMetric[], reason: undefined as string | undefined }),
  ]);
  const own: Signal<PullRequest[]> = pulls.ok ? { ...pulls, value: pulls.value.pulls.filter((p) => p.repo === row.name) } : pulls;
  return {
    row,
    snapshot,
    release: snapshot.release.repos.find((r) => r.repo === row.name),
    pulls: own,
    checks,
    tree,
    perf: perf.metrics,
    perfReason: perf.reason,
  };
}

async function perfMetrics(repo: string): Promise<{ metrics: PerfMetric[]; reason?: string }> {
  const list = await listPerfMetrics(repo);
  if (!list.ok) return { metrics: [], reason: list.reason };
  const metrics = await Promise.all(
    list.value.map(async (metric): Promise<PerfMetric> => {
      const series = await readPerfSeries(repo, metric);
      if (!series.ok) return { metric, latest: null, count: 0, url: series.sourceUrl, reason: series.reason };
      const sorted = [...series.value.records].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      return { metric, latest: sorted.at(-1) ?? null, count: sorted.length, url: series.sourceUrl };
    }),
  );
  return { metrics };
}
