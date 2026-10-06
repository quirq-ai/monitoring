// Writers that keep state on a branch, and how long the dashboard waits before calling one stale.
// Each window is about two intervals plus slack. If a schedule changes in its repo, update this
// table and AGENTS.md in one PR.

export type Writer = {
  /** Stable id, e.g. "gardener/tree-status". */
  id: string;
  repo: string;
  /** The workflow file in `.github/workflows/`. */
  workflow: string;
  /** Plain words for the schedule, shown on the Health page. */
  interval: string;
  /** Stale after this many minutes without a completed run. */
  windowMinutes: number;
  /** What the writer publishes, in plain words. */
  writes: string;
};

export const WRITERS: readonly Writer[] = [
  {
    id: "gardener/tree-status",
    repo: "gardener",
    workflow: "tree-status.yml",
    interval: "every 5 min",
    windowMinutes: 20,
    writes: "tree status per product on the tree-status branch",
  },
  {
    id: "release/lkgr",
    repo: "release",
    workflow: "lkgr.yml",
    interval: "every 10 min",
    windowMinutes: 30,
    writes: "the lkgr pointer per repo on release-state",
  },
  {
    id: "perf/perf",
    repo: "perf",
    workflow: "perf.yml",
    interval: "twice an hour, at :17 and :47",
    windowMinutes: 90,
    writes: "perf records on perf-data",
  },
  {
    id: "test-pipelines/scorecard",
    repo: "test-pipelines",
    workflow: "scorecard.yml",
    interval: "every 6 h",
    windowMinutes: 13 * 60,
    writes: "scorecard.json on results",
  },
  {
    id: "release/canary",
    repo: "release",
    workflow: "canary.yml",
    interval: "daily, at the hour channels.toml schedules",
    windowMinutes: 26 * 60,
    writes: "canary runs, channel pointers and the daily report on release-state",
  },
  {
    id: "release/canary-watchdog",
    repo: "release",
    workflow: "canary-watchdog.yml",
    interval: "daily at 09:43 and 13:43 UTC",
    windowMinutes: 26 * 60,
    writes: "a re-run of the canary when the scheduled one was dropped",
  },
  {
    id: "rollers/roll-toolchains",
    repo: "rollers",
    workflow: "roll-toolchains.yml",
    interval: "weekly, Monday 06:23 UTC",
    windowMinutes: 8 * 24 * 60,
    writes: "toolchain roll PRs",
  },
  {
    id: "depot/e2e-sync",
    repo: "depot",
    workflow: "e2e-sync.yml",
    interval: "daily at 06:17 UTC",
    windowMinutes: 26 * 60,
    writes: "the end-to-end sync check",
  },
  {
    id: "installer/live-manifest",
    repo: "installer",
    workflow: "live-manifest.yml",
    interval: "every 6 h at :17",
    windowMinutes: 13 * 60,
    writes: "the live install manifest check",
  },
];
