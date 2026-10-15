import { WRITERS } from "@/config/freshness";
import { web } from "@/lib/github";
import { apiState, gateByAge, gateByWriter, short, sourceStatus } from "@/lib/model/build";
import { judgeWriter } from "@/lib/model/freshness";
import { parseTime } from "@/lib/model/time";
import type { Cell, Snapshot, SourceStatus, WriterHealth } from "@/lib/model/types";
import type { Signal } from "@/lib/signal";
import { readLedger, type LedgerSummary } from "@/lib/sources/ledger";
import { readRevertPolicy, type RevertPolicy } from "@/lib/sources/revert-policy";
import { HISTORY_COMMITS, readTreeHistory, type TreeChange } from "@/lib/sources/tree-history";
import { readTreeGroups, type TreeGroup } from "@/lib/sources/tree-groups";
import { readTreeIndex, readTreeStatus, type TreeStatus } from "@/lib/sources/tree-status";
import type { WorkflowRun } from "@/lib/sources/writer-runs";
import { readWriterRuns } from "@/lib/sources/writer-runs";

// The Gardener page's model: is main green in the repos the gardener watches, and is the gardener
// working? Everything comes from the gardener's own published files, its workflow's runs and the
// caps it pins. Read-only, like every page; a culprit or suspect is shown by its sha only, never
// its commit title.

export const GARDENER_WRITER = WRITERS.find((w) => w.id === "gardener/tree-status")!;
const README_V0 = "https://github.com/quirq-ai/gardener#v0-status";
/** The chain dispatches the next run about 5 minutes after the last one started. */
const CHAIN_MINUTES = 5;
/** Slower than this between runs means the chain stopped and only the best-effort cron is left. */
const CHAIN_SLOW_MINUTES = 10;

export type Builder = { name: string; cell: Cell };

export type RedRange = {
  builder: string;
  lastGood: string;
  firstBad: string;
  suspects: string[];
  rangeUrl: string;
  runUrl: string;
  /** The first red came from a backfill, which runs main's newer workflow on the older commit. */
  backfill: boolean;
  /** The first red run is being re-run now. */
  rerunning: boolean;
  /** Why it broke, from the gardener's groups file: build, test or infra as a fact, else unknown. */
  failure: Cell;
  /** "<builder>: <step>", as the gardener names them; text only, at most MAX_STEPS. */
  steps: string[];
};

/** A range lists at most this many failed steps; the rest are counted in the failure text. */
const MAX_STEPS = 10;
const KIND_TEXT: Record<"infra" | "build" | "test", string> = {
  // The gardener's own reading (src/qqgarden/groups.py classify).
  infra: "infra: a fetch or a step outside build and test failed, so the commit's code is not blamed",
  build: "build: a build step failed, so the tests after it did not run",
  test: "test: a test step failed",
};

/** One coverage entry: the gardener writes each as "<sha> <builder>" (postsubmit.py). */
export type CoverageEntry = { sha: string; builder: string };

export type Coverage = {
  cell: Cell;
  missing: CoverageEntry[];
  cancelled: CoverageEntry[];
  pending: CoverageEntry[];
  backfilling: CoverageEntry[];
  /** Entries that are not "<sha> <builder>": still counted in the cell, never shown. */
  unread: number;
};

export type RepoTree = {
  name: string;
  statusUrl: string;
  tree: Cell;
  head?: string;
  green?: string;
  builders: Builder[];
  coverage?: Coverage;
  red: RedRange[];
};

export type TreeEvent = { repo: string; state: "open" | "closed" | "unknown"; at: string; url: string };

export type ReadinessItem = { label: string; cell: Cell };

export type GardenerView = {
  generatedAt: string;
  api: Snapshot["health"]["api"];
  writer: WriterHealth;
  cadence: Cell;
  repos: { ok: true; list: RepoTree[]; url: string } | { ok: false; reason: string; url: string };
  history:
    | { ok: true; events: TreeEvent[]; commits: number; since?: string; full: boolean; url: string }
    | { ok: false; reason: string; url: string };
  ledger: Cell;
  policy: { ok: true; value: RevertPolicy; url: string } | { ok: false; reason: string; url: string };
  readiness: ReadinessItem[];
  sources: SourceStatus[];
};

export async function buildGardener(options: { now?: Date } = {}): Promise<GardenerView> {
  const now = options.now ?? new Date();
  const sources: SourceStatus[] = [];
  const track = <T,>(signal: Signal<T>): Signal<T> => {
    sources.push(sourceStatus(signal));
    return signal;
  };

  const [index, runs, history, ledger, policy, groups] = await Promise.all([
    readTreeIndex().then(track),
    readWriterRuns(GARDENER_WRITER).then(track),
    readTreeHistory().then(track),
    readLedger().then(track),
    readRevertPolicy().then(track),
    readTreeGroups().then(track),
  ]);
  const statuses = index.ok ? await Promise.all(index.value.map((name) => readTreeStatus(name).then(track))) : [];

  const writer = judgeWriter(GARDENER_WRITER, runs, now);
  const repos: GardenerView["repos"] = index.ok
    ? { ok: true, url: index.sourceUrl, list: index.value.map((name, i) => repoTree(name, statuses[i], groups, writer, now)) }
    : { ok: false, reason: index.reason, url: index.sourceUrl };

  return {
    generatedAt: now.toISOString(),
    api: apiState(sources),
    writer,
    cadence: cadenceCell(runs, now),
    repos,
    history: historyView(history),
    ledger: ledgerCell(ledger),
    policy: policy.ok ? { ok: true, value: policy.value, url: policy.sourceUrl } : { ok: false, reason: policy.reason, url: policy.sourceUrl },
    readiness: readiness(ledger, policy),
    sources,
  };
}

function repoTree(name: string, signal: Signal<TreeStatus>, groups: Signal<TreeGroup[]>, writer: WriterHealth, now: Date): RepoTree {
  const statusUrl = signal.sourceUrl;
  const gate = (cell: Cell) => gateByAge(gateByWriter(cell, writer), sourceStatus(signal), now);
  if (!signal.ok) {
    return { name, statusUrl, tree: { state: "unknown", text: signal.reason, url: statusUrl, source: signal.source }, builders: [], red: [] };
  }
  const s = signal.value;
  const treeState: Cell["state"] = s.state === "open" ? "green" : s.state === "closed" ? "red" : "unknown";
  const tree = gate({ state: treeState, text: `${s.state}: ${s.reason || "no reason given"}`, url: statusUrl, source: signal.source });
  const builders = Object.entries(s.builders).map(([builder, b]) => ({
    name: builder,
    cell: gate({
      state: builderState(b.state),
      text: isSha(b.commit) ? `${b.state} on ${short(b.commit)}` : b.state,
      url: githubUrl(b.url) ?? statusUrl,
      source: signal.source,
    }),
  }));
  const red = s.red.map((r) => {
    const lastGood = isSha(r.last_good) ? r.last_good : "";
    const firstBad = isSha(r.first_bad) ? r.first_bad : "";
    return {
      builder: r.builder ?? "",
      lastGood,
      firstBad,
      suspects: r.suspects.filter(isSha),
      rangeUrl: lastGood && firstBad ? `${web.repo(name)}/compare/${lastGood}...${firstBad}` : firstBad ? web.commit(name, firstBad) : statusUrl,
      runUrl: githubUrl(r.url) ?? statusUrl,
      backfill: r.first_bad_backfill === true,
      rerunning: r.first_bad_running === true,
      ...failureOf(name, r, groups),
    };
  });
  return {
    name,
    statusUrl,
    tree,
    head: isSha(s.head) ? s.head : undefined,
    green: isSha(s.green) ? s.green : undefined,
    builders,
    coverage: s.coverage ? coverage(s.coverage, statusUrl, signal.source, gate) : undefined,
    red,
  };
}

/**
 * The groups file's entry for one red range: the same repo, last green and first red, with this
 * range's builder and first red run among its own. The file is written after the status files and
 * can be a run behind, so no match (or no file) is unknown, never a guess.
 */
export function failureOf(repo: string, r: TreeStatus["red"][number], groups: Signal<TreeGroup[]>): { failure: Cell; steps: string[] } {
  const url = groups.sourceUrl;
  const source = groups.source;
  if (!groups.ok) return { failure: { state: "unknown", text: groups.reason, url, source }, steps: [] };
  const entry = groups.value.find(
    (g) => g.repo === repo && g.last_good === (r.last_good ?? "") && g.first_bad === (r.first_bad ?? "") && g.builders.includes(r.builder ?? "") && g.runs.includes(r.url ?? ""),
  );
  if (!entry) return { failure: { state: "unknown", text: "the groups file has no entry for this range yet; it is written after the status, so it can be a run behind", url, source }, steps: [] };
  const steps = entry.failed_steps.map((step) => (step.length > 200 ? `${step.slice(0, 199)}…` : step));
  const more = steps.length > MAX_STEPS ? `; ${steps.length - MAX_STEPS} more failed steps not shown` : "";
  if (entry.kind === "unknown") {
    return { failure: { state: "unknown", text: `the gardener could not tell the type: no completed attempt of the first red run shows a failed step${more}`, url, source }, steps: steps.slice(0, MAX_STEPS) };
  }
  return { failure: { state: "none", text: `${KIND_TEXT[entry.kind]}${more}`, url, source }, steps: steps.slice(0, MAX_STEPS) };
}

function coverage(c: NonNullable<TreeStatus["coverage"]>, url: string, source: string, gate: (cell: Cell) => Cell): Coverage {
  const missing = c.missing.map(coverageEntry);
  const cancelled = c.cancelled.map(coverageEntry);
  const pending = c.pending.map(coverageEntry);
  const backfilling = c.backfilling.map(coverageEntry);
  const all = [...missing, ...cancelled, ...pending, ...backfilling];
  const unread = all.filter((e) => e === null).length;
  // Counted from the file's own lists, so an entry that does not parse still counts (fail closed).
  const holes = c.missing.length + c.cancelled.length;
  const waiting = c.pending.length + c.backfilling.length;
  const checked = `${c.commits} ${c.commits === 1 ? "commit" : "commits"} checked`;
  const unreadNote = unread ? `; ${unread} ${unread === 1 ? "entry" : "entries"} could not be read` : "";
  let cell: Cell;
  if (holes) cell = { state: "red", text: `${holes} ${holes === 1 ? "commit has" : "commits have"} no post-submit result: a culprit can hide there${unreadNote}`, url, source };
  else if (waiting) cell = { state: "pending", text: `${c.backfilling.length} backfilling, ${c.pending.length} running${c.commits ? `; ${checked}` : ""}${unreadNote}`, url, source };
  else if (!c.commits) cell = { state: "unknown", text: "no commit checked yet: no push-triggered post-submit run is in view, as for a repo not onboarded yet", url, source };
  else cell = { state: "green", text: `every commit has a result; ${checked}`, url, source };
  const shown = (list: (CoverageEntry | null)[]) => list.filter((e): e is CoverageEntry => e !== null);
  return { cell: gate(cell), missing: shown(missing), cancelled: shown(cancelled), pending: shown(pending), backfilling: shown(backfilling), unread };
}

/** "<sha> <builder>", as the gardener writes it; a bare sha has no builder. Anything else is null. */
function coverageEntry(value: string): CoverageEntry | null {
  const m = /^([0-9a-f]{7,40})(?: ([A-Za-z0-9][A-Za-z0-9._-]{0,99}))?$/.exec(value);
  return m ? { sha: m[1], builder: m[2] ?? "" } : null;
}

/**
 * Does the 5-minute chain still run? Judged on the gaps between the newest completed runs
 * (cancelled ones are already dropped: the queue replaces them routinely). The writer's own
 * window says whether it ran at all; this says whether it runs as often as it should.
 */
export function cadenceCell(runs: Signal<WorkflowRun[]>, now: Date = new Date()): Cell {
  const url = runs.sourceUrl;
  const source = runs.source;
  if (!runs.ok) return { state: "unknown", text: runs.reason, url, source };
  const times = runs.value.map((r) => parseTime(r.completedAt)).filter((t): t is number => t !== null).sort((a, b) => b - a);
  // The time since the newest run is a gap too: a stopped chain has no new gaps to measure.
  const quiet = (now.getTime() - (times[0] ?? 0)) / 60_000;
  if (times.length && quiet > GARDENER_WRITER.windowMinutes) {
    return { state: "stale", text: `no run has finished in ${Math.round(quiet)} min, longer than the ${GARDENER_WRITER.windowMinutes}-minute window: the chain has stopped`, url, source };
  }
  if (times.length < 3) return { state: "unknown", text: `${times.length} completed ${times.length === 1 ? "run" : "runs"}: too few to tell the pace`, url, source };
  const gaps = times.slice(1).map((t, i) => (times[i] - t) / 60_000).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  const every = Math.max(1, Math.round(median));
  if (median > CHAIN_SLOW_MINUTES) {
    return { state: "stale", text: `about every ${every} min over the last ${times.length} runs, slower than the ${CHAIN_MINUTES}-minute chain: it may have stopped and only the cron is left`, url, source };
  }
  return { state: "green", text: `about every ${every} min over the last ${times.length} runs`, url, source };
}

function historyView(signal: Signal<TreeChange[]>): GardenerView["history"] {
  if (!signal.ok) return { ok: false, reason: signal.reason, url: signal.sourceUrl };
  const events: TreeEvent[] = [];
  for (const change of signal.value) {
    for (const repo of change.changed) {
      const state = change.states[repo];
      if (state === "open" || state === "closed" || state === "unknown") events.push({ repo, state, at: change.at, url: githubUrl(change.url) ?? signal.sourceUrl });
    }
  }
  return {
    ok: true,
    events,
    commits: signal.value.length,
    since: signal.value.at(-1)?.at || undefined,
    // A full page means older commits exist that were not read.
    full: signal.value.length >= HISTORY_COMMITS,
    url: signal.sourceUrl,
  };
}

function ledgerCell(signal: Signal<LedgerSummary>): Cell {
  if (signal.ok) {
    const { reverts, landed } = signal.value;
    return { state: "none", text: `${reverts} ${reverts === 1 ? "revert" : "reverts"} recorded, ${landed} landed`, url: signal.sourceUrl, source: signal.source };
  }
  if (signal.reason === "ledger not started") {
    return { state: "none", text: "not started: there is no ledger branch yet, so no revert has been reserved or counted", url: signal.sourceUrl, source: signal.source };
  }
  return { state: "unknown", text: signal.reason, url: signal.sourceUrl, source: signal.source };
}

/** What live reverts still wait on. Each item is done (green), waiting (pending) or unknown; none is assumed done. */
function readiness(ledger: Signal<LedgerSummary>, policy: Signal<RevertPolicy>): ReadinessItem[] {
  const app: Cell = {
    state: "unknown",
    text: "public data cannot show whether the quirq gardener App exists; the gardener README's v0 status says it does not yet",
    url: README_V0,
    source: "gardener/readme",
  };
  const ledgerItem: Cell = ledger.ok
    ? { state: "green", text: "started", url: ledger.sourceUrl, source: ledger.source }
    : ledger.reason === "ledger not started"
      ? { state: "pending", text: "not started: one manual run of the tree-status workflow with bootstrap-ledger starts it, once the App exists", url: README_V0, source: ledger.source }
      : { state: "unknown", text: ledger.reason, url: ledger.sourceUrl, source: ledger.source };
  const land: Cell = !policy.ok
    ? { state: "unknown", text: policy.reason, url: policy.sourceUrl, source: policy.source }
    : policy.value.autoLandRepos.length
      ? { state: "green", text: `reverts may land on their own in ${policy.value.autoLandRepos.join(", ")}`, url: policy.sourceUrl, source: policy.source }
      : { state: "pending", text: "empty: every revert is proposed, and you merge it", url: policy.sourceUrl, source: policy.source };
  return [
    { label: "quirq gardener App", cell: app },
    { label: "ledger branch", cell: ledgerItem },
    { label: "auto_land_repos", cell: land },
  ];
}

function builderState(state: string): Cell["state"] {
  if (state === "green" || state === "red" || state === "pending") return state;
  return "unknown";
}

function isSha(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/.test(value);
}

/** A link from a fetched file is kept only when it points at github.com. */
export function githubUrl(value: string | undefined): string | undefined {
  return value && /^https:\/\/github\.com\//.test(value) ? value : undefined;
}
