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
};

export type Coverage = {
  cell: Cell;
  missing: string[];
  cancelled: string[];
  pending: string[];
  backfilling: string[];
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

  const [index, runs, history, ledger, policy] = await Promise.all([
    readTreeIndex().then(track),
    readWriterRuns(GARDENER_WRITER).then(track),
    readTreeHistory().then(track),
    readLedger().then(track),
    readRevertPolicy().then(track),
  ]);
  const statuses = index.ok ? await Promise.all(index.value.map((name) => readTreeStatus(name).then(track))) : [];

  const writer = judgeWriter(GARDENER_WRITER, runs, now);
  const repos: GardenerView["repos"] = index.ok
    ? { ok: true, url: index.sourceUrl, list: index.value.map((name, i) => repoTree(name, statuses[i], writer, now)) }
    : { ok: false, reason: index.reason, url: index.sourceUrl };

  return {
    generatedAt: now.toISOString(),
    api: apiState(sources),
    writer,
    cadence: cadenceCell(runs),
    repos,
    history: historyView(history),
    ledger: ledgerCell(ledger),
    policy: policy.ok ? { ok: true, value: policy.value, url: policy.sourceUrl } : { ok: false, reason: policy.reason, url: policy.sourceUrl },
    readiness: readiness(ledger, policy),
    sources,
  };
}

function repoTree(name: string, signal: Signal<TreeStatus>, writer: WriterHealth, now: Date): RepoTree {
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

function coverage(c: NonNullable<TreeStatus["coverage"]>, url: string, source: string, gate: (cell: Cell) => Cell): Coverage {
  const missing = c.missing.filter(isSha);
  const cancelled = c.cancelled.filter(isSha);
  const pending = c.pending.filter(isSha);
  const backfilling = c.backfilling.filter(isSha);
  const holes = missing.length + cancelled.length;
  const checked = c.commits !== undefined ? `${c.commits} commits checked` : "commits checked";
  let cell: Cell;
  if (holes) cell = { state: "red", text: `${holes} ${holes === 1 ? "commit has" : "commits have"} no post-submit result: a culprit can hide there`, url, source };
  else if (backfilling.length || pending.length) cell = { state: "pending", text: `${backfilling.length} backfilling, ${pending.length} running; ${checked}`, url, source };
  else cell = { state: "green", text: `every commit has a result; ${checked}`, url, source };
  return { cell: gate(cell), missing, cancelled, pending, backfilling };
}

/**
 * Does the 5-minute chain still run? Judged on the gaps between the newest completed runs
 * (cancelled ones are already dropped: the queue replaces them routinely). The writer's own
 * window says whether it ran at all; this says whether it runs as often as it should.
 */
export function cadenceCell(runs: Signal<WorkflowRun[]>): Cell {
  const url = runs.sourceUrl;
  const source = runs.source;
  if (!runs.ok) return { state: "unknown", text: runs.reason, url, source };
  const times = runs.value.map((r) => parseTime(r.completedAt)).filter((t): t is number => t !== null).sort((a, b) => b - a);
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
      if (state === "open" || state === "closed" || state === "unknown") events.push({ repo, state, at: change.at, url: change.url });
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
function githubUrl(value: string | undefined): string | undefined {
  return value && /^https:\/\/github\.com\//.test(value) ? value : undefined;
}
