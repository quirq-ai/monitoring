import { WRITERS } from "@/config/freshness";
import { OWNER } from "@/config/owner";
import { ORG, blobUrl, treeUrl } from "@/lib/fetch";
import { hasToken, isApiOutageReason, RATE_LIMIT_REASON, rateLimitedUntil, requestsThisHour, web } from "@/lib/github";
import type { Signal, State } from "@/lib/signal";
import { judgeWriter } from "@/lib/model/freshness";
import { ago, WINDOWS, within, type Window } from "@/lib/model/time";
import {
  SNAPSHOT_SCHEMA,
  type BoardGroup,
  type BoardRow,
  type CanaryDay,
  type Cell,
  type ReleaseRepo,
  type SectionRead,
  type Snapshot,
  type SourceStatus,
  type TodayItem,
  type WaitingItem,
  type WriterHealth,
} from "@/lib/model/types";
import { readLatestCanaryReport } from "@/lib/sources/canary-report";
import { readCanaryDays, type CanaryRun } from "@/lib/sources/canary-runs";
import { readChannelsConfig } from "@/lib/sources/channels-config";
import { readBranchChecks } from "@/lib/sources/checks";
import { readLatestDeployment } from "@/lib/sources/deployments";
import { readFailures } from "@/lib/sources/failures";
import { readIssues } from "@/lib/sources/issues";
import { readLedger } from "@/lib/sources/ledger";
import { readPointer } from "@/lib/sources/pointers";
import { readMergedPulls, readOpenPulls, readReviewRequested, readReviewStatus, readReviewedByOwner, type PullRequest } from "@/lib/sources/pulls";
import { localGroups, readGateRepos, readOrgRepos, readProducts, type Product } from "@/lib/sources/registry";
import { readReleaseChannels } from "@/lib/sources/release-channels";
import { readScorecard } from "@/lib/sources/scorecard";
import { readTreeHistory } from "@/lib/sources/tree-history";
import { readTreeStatus } from "@/lib/sources/tree-status";
import { readWriterRuns } from "@/lib/sources/writer-runs";
import { readHold } from "@/lib/sources/holds";

// Joins every Signal into the one model the pages render. A source that is down turns its own
// cells `unknown` with its reason and nothing else; the rest of the page renders.

export const CANARY_DAYS = 14;
const STALE_APPROVAL_LIMIT = 5;

export function short(sha: string): string {
  return sha.slice(0, 7);
}

/** A reason without the digest the canary writes into it, so a line fits a phone. */
export function tidy(reason: string): string {
  return reason.replace(/\s*sha256:[0-9a-f]{8,}/g, "").replace(/\s+/g, " ").trim();
}

function status<T>(signal: Signal<T>): SourceStatus {
  return {
    source: signal.source,
    sourceUrl: signal.sourceUrl,
    fetchedAt: signal.fetchedAt,
    maxAge: signal.maxAge,
    observedAt: signal.observedAt,
    ok: signal.ok,
    reason: signal.ok ? undefined : signal.reason,
  };
}

/** The reasons the API banner explains, so a cell can say them in two words. */
export function shortReason(reason: string): string {
  if (reason === "no token") return "no token";
  if (reason.startsWith(RATE_LIMIT_REASON)) return "rate limited";
  if (reason === "token rejected") return "token rejected";
  return reason;
}

/** The sources that need the GitHub API, so a cell can say its unknown is the banner's cause. */
function isApiSource(source: string): boolean {
  return source.startsWith("github/") || source.startsWith("writer/");
}

function unknownCell(signal: Signal<unknown>, text?: string): Cell {
  const cell: Cell = { state: "unknown", text: text ?? (signal.ok ? "no data" : shortReason(signal.reason)), url: signal.sourceUrl, source: signal.source };
  // Only an outage is the banner's doing; a 404, a bad body or a refused name is the row's own.
  return !signal.ok && isApiSource(signal.source) && isApiOutageReason(signal.reason) ? { ...cell, because: "api" } : cell;
}

/** A known fact with no health in it: shown as plain text, never counted. */
function noneCell(text: string, url: string, source: string, at?: string): Cell {
  return { state: "none", text, url, source, at };
}

const WRITER_WORDS: Record<string, string> = { "gardener/tree-status": "gardener", "release/lkgr": "the lkgr job", "release/canary": "the canary job" };

/**
 * A cell built from a state file is only as current as the job that writes the file. When that
 * writer is not green, a green or pending cell becomes stale (the writer missed its window) or
 * unknown (the writer's state could not be read); red and held stay, since the file's alarm is
 * real whatever happened since (rule 3). Tree-status files carry no timestamp, so this is the only
 * freshness signal they have.
 */
export function gateByWriter(cell: Cell, writer: WriterHealth | undefined): Cell {
  if (!writer || writer.state === "green") return cell;
  if (cell.state === "red" || cell.state === "held" || cell.state === "none") return cell;
  const who = WRITER_WORDS[writer.id] ?? writer.id;
  const state: Cell["state"] = writer.state === "stale" || writer.state === "red" ? "stale" : "unknown";
  const text = cell.state === "unknown" ? cell.text : `${cell.text} as of the last run; ${who} ${writer.state}, ${shortReason(writer.reason)}`;
  // A writer is unknown when its runs could not be read; that is the banner's doing only in an outage.
  return state === "unknown" && isApiOutageReason(writer.reason) ? { ...cell, state, text, because: "api" } : { ...cell, state, text };
}

/**
 * The data cache serves an expired entry once while it refreshes, so after an idle night the
 * first render shows last night's data. A cell whose source was read more than twice its cache
 * window ago is marked stale rather than shown as current.
 */
export function gateByAge(cell: Cell, source: SourceStatus | undefined, now: Date): Cell {
  if (!source || !source.maxAge || !source.ok) return cell;
  if (cell.state !== "green" && cell.state !== "pending") return cell;
  const ageSeconds = (now.getTime() - new Date(source.fetchedAt).getTime()) / 1000;
  if (!(ageSeconds > 2 * source.maxAge)) return cell;
  return { ...cell, state: "stale", text: `${cell.text}; read ${ago(source.fetchedAt, now)}, not refreshed yet` };
}

const WORST_ORDER: State[] = ["red", "held", "stale", "unknown", "pending", "green"];

/** The worst state among a row's health cells; a `none` cell carries no state. */
export function worstOf(cells: (Cell | undefined)[]): State {
  const present = cells.filter((c): c is Cell => Boolean(c) && c!.state !== "none").map((c) => c.state as State);
  for (const state of WORST_ORDER) if (present.includes(state)) return state;
  return "green";
}

/** Nothing to look at beyond the API banner: every cell is green, a fact, or unknown because the API did not answer. */
export function isQuiet(cells: (Cell | undefined)[]): boolean {
  return cells.every((c) => !c || c.state === "green" || c.state === "none" || (c.state === "unknown" && c.because === "api"));
}

/**
 * When a page's data was read: the oldest read among the sources that answered (none when nothing
 * was), and whether any of them was read more than twice its window ago and not refreshed yet.
 */
export function sectionRead(signals: Signal<unknown>[], now: Date): SectionRead {
  const ok = signals.filter((s) => s.ok);
  const asOf = ok.map((s) => s.fetchedAt).sort()[0];
  const stale = ok.some((s) => s.maxAge !== undefined && (now.getTime() - new Date(s.fetchedAt).getTime()) / 1000 > 2 * s.maxAge);
  return { asOf, stale };
}

const SUPERSEDED_KINDS = new Set<TodayItem["kind"]>(["tree", "canary", "deploy"]);

/**
 * The newest event per subject (a repo's tree, canary or deploy) is the current one; older ones
 * are history, not alarms. An older alarm is `cleared` only when the newest event is green: a
 * failure followed by another failure was replaced, not cleared.
 */
export function markSuperseded(items: TodayItem[]): TodayItem[] {
  const newest = new Map<string, TodayItem>();
  return items.map((item) => {
    if (!SUPERSEDED_KINDS.has(item.kind)) return item;
    const subject = `${item.kind}:${item.repo}`;
    const current = newest.get(subject);
    if (!current) {
      newest.set(subject, item);
      return item;
    }
    return { ...item, superseded: true, cleared: current.state === "green" };
  });
}

export type BuildOptions = { window?: Window; now?: Date };

export async function buildSnapshot(options: BuildOptions = {}): Promise<Snapshot> {
  const now = options.now ?? new Date();
  const window = options.window ?? "24h";
  const hours = WINDOWS[window];
  const sources: SourceStatus[] = [];
  const track = <T,>(signal: Signal<T>): Signal<T> => {
    sources.push(status(signal));
    return signal;
  };

  // Phase 1: everything that needs no other source.
  const [
    products,
    gateRepos,
    orgRepos,
    channelsConfig,
    releaseChannels,
    treeHistory,
    failures,
    scorecard,
    ledger,
    report,
    openPulls,
    mergedPulls,
    reviewRequested,
    reviewedBy,
    failureIssues,
    writerRuns,
  ] = await Promise.all([
    readProducts().then(track),
    readGateRepos().then(track),
    readOrgRepos().then(track),
    readChannelsConfig().then(track),
    readReleaseChannels().then(track),
    readTreeHistory().then(track),
    readFailures().then(track),
    readScorecard().then(track),
    readLedger().then(track),
    readLatestCanaryReport(3, now).then(track),
    readOpenPulls().then(track),
    readMergedPulls(now).then(track),
    readReviewRequested().then(track),
    readReviewedByOwner().then(track),
    readIssues("qq-failure").then(track),
    Promise.all(WRITERS.map((w) => readWriterRuns(w).then(track))),
  ]);

  const writers = WRITERS.map((w, i) => judgeWriter(w, writerRuns[i], now));
  const writerById = new Map(writers.map((w) => [w.id, w]));

  // Phase 2: per product and per board repo.
  const productList: Product[] = products.ok ? products.value : [];
  const rows = boardRows(productList, gateRepos, orgRepos);
  const [perProduct, checks, staleApprovals] = await Promise.all([
    Promise.all(
      productList.map(async (p) => {
        // A product outside the canary (no channels) has no lkgr pointer by design, so none is read.
        const [lkgr, tree, days, deploy] = await Promise.all([
          p.channels.length > 0 ? readPointer(p.name, "lkgr").then(track) : Promise.resolve(undefined),
          readTreeStatus(p.name).then(track),
          readCanaryDays(p.name, CANARY_DAYS, now),
          p.deployTarget === "vercel" ? readLatestDeployment(p.name).then(track) : Promise.resolve(undefined),
        ]);
        for (const d of days) if (!d.run.ok) track(d.run);
        return { product: p, lkgr, tree, days, deploy };
      }),
    ),
    Promise.all(rows.map((r) => readBranchChecks(r.name, r.defaultBranch).then(track))),
    Promise.all(
      (reviewedBy.ok ? reviewedBy.value.pulls : []).slice(0, STALE_APPROVAL_LIMIT).map(async (pr) => ({
        pr,
        review: track(await readReviewStatus(pr.repo, pr.number)),
      })),
    ),
  ]);

  // Phase 3: hold records for the products whose latest canary is held.
  const holds = await Promise.all(
    perProduct.map(async (p) => {
      const latest = latestRun(p.days);
      if (!latest || latest.outcome !== "held" || !/^[0-9a-f]{40}$/.test(latest.commit)) return undefined;
      const hold = track(await readHold(p.product.name, latest.commit));
      return hold.ok && hold.value
        ? { commit: hold.value.commit, stage: hold.value.stage, date: hold.value.date, runUrl: hold.value.run_url, url: hold.sourceUrl }
        : undefined;
    }),
  );

  // --- board ---------------------------------------------------------------------------------
  const pulls = openPulls.ok ? openPulls.value.pulls : [];
  const merged = mergedPulls.ok ? mergedPulls.value.pulls : [];
  const productIndex = new Map(perProduct.map((p) => [p.product.name, p]));
  const channelMap = releaseChannels.ok ? releaseChannels.value : {};
  const boardRowsFull: BoardRow[] = rows.map((row, i) => {
    const check = checks[i];
    const ci: Cell = check.ok
      ? { state: check.value.state, text: check.value.summary, url: check.sourceUrl, at: check.observedAt, source: check.source }
      : unknownCell(check);
    const newest = merged.filter((p) => p.repo === row.name).sort((a, b) => (b.mergedAt ?? "").localeCompare(a.mergedAt ?? ""))[0];
    // A merge is a fact, not a health state: plain text, no badge.
    const lastMerge: Cell = mergedPulls.ok
      ? newest
        ? noneCell(`#${newest.number} ${newest.title}`, newest.url, mergedPulls.source, newest.mergedAt ?? undefined)
        : noneCell(mergedPulls.value.incomplete ? "none among the newest merges" : "nothing merged in 7 days", web.pulls(row.name), mergedPulls.source)
      : unknownCell(mergedPulls);
    const base: BoardRow = {
      ...row,
      ci,
      openPulls: openPulls.ok ? pulls.filter((p) => p.repo === row.name).length : -1,
      openPullsLowerBound: openPulls.ok && openPulls.value.incomplete,
      lastMerge,
      worst: worstOf([ci]),
      quiet: isQuiet([ci, lastMerge]),
    };
    const p = productIndex.get(row.name);
    if (!p) return base;
    const tree: Cell = gateByWriter(
      p.tree.ok
        ? { state: p.tree.value.state === "open" ? "green" : p.tree.value.state === "closed" ? "red" : "unknown", text: p.tree.value.reason || p.tree.value.state, url: p.tree.sourceUrl, source: p.tree.source }
        : unknownCell(p.tree),
      writerById.get("gardener/tree-status"),
    );
    const lkgr: Cell = !p.lkgr
      ? noneCell("not in the canary yet", products.sourceUrl, products.source)
      : gateByWriter(
          p.lkgr.ok
            ? { state: p.lkgr.value.pending ? "pending" : "green", text: `${short(p.lkgr.value.commit)}${p.lkgr.value.pending ? ` pending ${short(p.lkgr.value.pending)}` : ""}`, url: web.commit(row.name, p.lkgr.value.commit), at: p.lkgr.value.updated_at, source: p.lkgr.source }
            : unknownCell(p.lkgr),
          writerById.get("release/lkgr"),
        );
    const latest = latestRun(p.days);
    const unreadable = newestUnreadable(p.days);
    const runsDown = unreadable !== undefined && (!latest || unreadable.date > latest.date);
    const canaryEntry = channelMap[row.name]?.canary;
    const runsUrl = treeUrl("release", "release-state", `canary/${row.name}/runs`);
    // The cell is how the last canary run went; the channel pointer is what it shipped. No run
    // inside the strip's window is stale, never green, whatever channels.json says (rule 3).
    const canary: Cell = gateByWriter(p.product.channels.length === 0
      ? noneCell("no channels configured", products.sourceUrl, products.source)
      : runsDown
      ? unknownCell(unreadable.run)
      : latest && latest.outcome === "held"
        ? { state: "held", text: `held: ${tidy(latest.reason)}`, url: latest.run_url || runsUrl, at: latest.finished_at || undefined, source: `release/canary/${row.name}` }
        : latest && latest.outcome === "error"
          ? { state: "red", text: `error: ${tidy(latest.reason) || "see the run"}`, url: latest.run_url || runsUrl, at: latest.finished_at || undefined, source: `release/canary/${row.name}` }
          : !latest
            ? { state: "stale", text: `no run in ${CANARY_DAYS} days${canaryEntry ? `, canary at ${short(canaryEntry.commit)}` : ""}`, url: runsUrl, at: canaryEntry?.updated_at, source: `release/canary/${row.name}` }
            : canaryEntry
              ? { state: "green", text: `${latest.outcome}, canary at ${short(canaryEntry.commit)}`, url: web.commit(row.name, canaryEntry.commit), at: canaryEntry.updated_at, source: releaseChannels.source }
              : releaseChannels.ok
                ? { state: "green", text: `${latest.outcome}, nothing promoted yet`, url: releaseChannels.sourceUrl, source: releaseChannels.source }
                : unknownCell(releaseChannels), writerById.get("release/canary"));
    const deploy: Cell | undefined = !p.deploy
      ? undefined
      : p.deploy.ok
        ? p.deploy.value
          ? { state: p.deploy.value.state, text: `${p.deploy.value.status} ${short(p.deploy.value.sha)}`, url: p.deploy.value.url, at: p.deploy.value.createdAt, source: p.deploy.source }
          : noneCell("no deployments", p.deploy.sourceUrl, p.deploy.source)
        : unknownCell(p.deploy);
    return { ...base, tree, lkgr, canary, deploy, worst: worstOf([ci, tree, lkgr, canary, deploy]), quiet: isQuiet([ci, lastMerge, tree, lkgr, canary, deploy]) };
  });
  const sourceById = new Map(sources.map((s) => [s.source, s]));
  for (const row of boardRowsFull) {
    row.ci = gateByAge(row.ci, sourceById.get(row.ci.source), now);
    if (row.tree) row.tree = gateByAge(row.tree, sourceById.get(row.tree.source), now);
    if (row.lkgr) row.lkgr = gateByAge(row.lkgr, sourceById.get(row.lkgr.source), now);
    if (row.canary) row.canary = gateByAge(row.canary, sourceById.get(row.canary.source), now);
    if (row.deploy) row.deploy = gateByAge(row.deploy, sourceById.get(row.deploy.source), now);
    row.worst = worstOf([row.ci, row.tree, row.lkgr, row.canary, row.deploy]);
    row.quiet = isQuiet([row.ci, row.lastMerge, row.tree, row.lkgr, row.canary, row.deploy]);
  }
  const board = groupRows(boardRowsFull);
  const unregistered = boardRowsFull.filter((r) => !r.registered).map((r) => r.name);

  // --- today -------------------------------------------------------------------------------
  const today: TodayItem[] = [];
  for (const pr of merged) {
    if (within(pr.mergedAt, hours, now)) today.push({ kind: "merged", repo: pr.repo, title: `merged #${pr.number} ${pr.title}`, at: pr.mergedAt ?? pr.updatedAt, url: pr.url, state: "green" });
  }
  for (const p of perProduct) {
    if (p.lkgr?.ok) {
      const seen = new Set<string>();
      for (const h of [{ commit: p.lkgr.value.commit, updated_at: p.lkgr.value.updated_at }, ...p.lkgr.value.history]) {
        if (seen.has(h.updated_at) || !within(h.updated_at, hours, now)) continue;
        seen.add(h.updated_at);
        today.push({ kind: "lkgr", repo: p.product.name, title: `lkgr moved to ${short(h.commit)}`, at: h.updated_at, url: web.commit(p.product.name, h.commit), state: "green" });
      }
    }
    for (const d of p.days) {
      if (!d.run.ok || !d.run.value) continue;
      const run = d.run.value;
      const at = run.finished_at || run.started_at || `${d.date}T00:00:00Z`;
      if (!within(at, hours, now)) continue;
      today.push({ kind: "canary", repo: p.product.name, title: `canary ${run.outcome}${run.reason ? `: ${tidy(run.reason)}` : ""}`, at, url: run.run_url || d.run.sourceUrl, state: outcomeState(run.outcome) });
    }
    if (p.deploy?.ok && p.deploy.value && within(p.deploy.value.createdAt, hours, now)) {
      today.push({ kind: "deploy", repo: p.product.name, title: `deploy ${p.deploy.value.status} ${short(p.deploy.value.sha)}`, at: p.deploy.value.createdAt, url: p.deploy.value.url, state: p.deploy.value.state });
    }
  }
  for (const [repo, channels] of Object.entries(channelMap)) {
    for (const [name, entry] of Object.entries(channels)) {
      if (within(entry.updated_at, hours, now)) today.push({ kind: "channel", repo, title: `${name} moved to ${short(entry.commit)}`, at: entry.updated_at, url: web.commit(repo, entry.commit), state: "green" });
    }
  }
  if (treeHistory.ok) {
    for (const change of treeHistory.value) {
      if (!within(change.at, hours, now)) continue;
      for (const repo of change.changed) {
        const state = change.states[repo];
        today.push({ kind: "tree", repo, title: `tree ${state}`, at: change.at, url: change.url, state: state === "open" ? "green" : state === "closed" ? "red" : "unknown" });
      }
    }
  }
  if (failures.ok) {
    for (const f of failures.value) {
      if (within(f.opened_at, hours, now)) today.push({ kind: "failure", repo: f.repo.replace(`${ORG}/`, ""), title: `failure record ${f.kind ? `(${f.kind}) ` : ""}${f.summary}`, at: f.opened_at, url: f.url, state: f.demo ? "unknown" : "red", demo: f.demo });
    }
  }
  if (failureIssues.ok) {
    for (const issue of failureIssues.value) {
      if (within(issue.createdAt, hours, now)) today.push({ kind: "issue", repo: issue.repo, title: `issue #${issue.number} ${issue.title}`, at: issue.createdAt, url: issue.url, state: "red" });
    }
  }
  // A writer whose last run failed is current news whatever the window: it is red only while that
  // run is inside its window. The item opens Health, where the writer's row is.
  for (const w of writers) {
    if (w.state !== "red" || !w.lastRun) continue;
    today.push({ kind: "writer", repo: w.repo, title: `${w.workflow.replace(/\.ya?ml$/, "")} writer ${w.lastRun.conclusion}; its data may still be current`, at: w.lastRun.at, url: "/health", state: "red" });
  }
  today.sort((a, b) => b.at.localeCompare(a.at));
  const todayItems = markSuperseded(today);

  // --- waiting on you ------------------------------------------------------------------------
  const waiting: WaitingItem[] = [];
  const listed = new Set<string>();
  const key = (pr: PullRequest) => `${pr.repo}#${pr.number}`;
  if (reviewRequested.ok) {
    for (const pr of reviewRequested.value.pulls) {
      listed.add(key(pr));
      waiting.push({ kind: "review", repo: pr.repo, title: `#${pr.number} ${pr.title}`, detail: `review requested, by ${pr.author}`, since: pr.updatedAt, url: pr.url, state: "pending" });
    }
  }
  for (const pr of pulls) {
    if (listed.has(key(pr)) || !pr.assignees.includes(OWNER)) continue;
    listed.add(key(pr));
    waiting.push({ kind: "assigned", repo: pr.repo, title: `#${pr.number} ${pr.title}`, detail: `assigned to you, by ${pr.author}`, since: pr.updatedAt, url: pr.url, state: "pending" });
  }
  for (const { pr, review } of staleApprovals) {
    if (!review.ok || !review.value.approvalStale || listed.has(key(pr))) continue;
    listed.add(key(pr));
    waiting.push({ kind: "stale-approval", repo: pr.repo, title: `#${pr.number} ${pr.title}`, detail: `your approval is on ${short(review.value.reviewedSha ?? "")}, the head is now ${short(review.value.headSha)}`, since: pr.updatedAt, url: pr.url, state: "pending" });
  }
  perProduct.forEach((p, i) => {
    const latest = latestRun(p.days);
    if (!latest || latest.outcome !== "held") return;
    const hold = holds[i];
    const stage = hold?.stage || latest.stages.find((s) => !s.ok)?.name || "a stage";
    const runFile = blobUrl("release", "release-state", `canary/${p.product.name}/runs/${latest.date}.json`);
    waiting.push({ kind: "held", repo: p.product.name, title: `canary held at ${stage}`, detail: tidy(latest.reason) || `commit ${short(latest.commit)}`, since: latest.finished_at || `${latest.date}T00:00:00Z`, url: hold?.url || latest.run_url || runFile, state: "held" });
  });
  if (failureIssues.ok) {
    for (const issue of failureIssues.value) {
      waiting.push({ kind: "failure", repo: issue.repo, title: `#${issue.number} ${issue.title}`, detail: "open qq-failure issue", since: issue.createdAt, url: issue.url, state: "red" });
    }
  }
  waiting.sort((a, b) => b.since.localeCompare(a.since));

  // --- release -------------------------------------------------------------------------------
  const channelNames = channelsConfig.ok ? channelsConfig.value.channels.map((c) => c.name) : Object.keys(channelMap[productList[0]?.name ?? ""] ?? {});
  const releaseRepos: ReleaseRepo[] = perProduct
    .filter((p) => p.product.channels.length > 0)
    .map((p) => {
      const row = boardRowsFull.find((r) => r.name === p.product.name);
      const channels: Record<string, Cell> = {};
      for (const name of channelNames) {
        const entry = channelMap[p.product.name]?.[name];
        channels[name] = entry
          ? { state: "green", text: `${short(entry.commit)} gen ${entry.generation}`, url: web.commit(p.product.name, entry.commit), at: entry.updated_at, source: releaseChannels.source }
          : releaseChannels.ok
            ? noneCell("nothing promoted yet", releaseChannels.sourceUrl, releaseChannels.source)
            : unknownCell(releaseChannels);
        channels[name] = gateByAge(channels[name], sourceById.get(channels[name].source), now);
      }
      const days = p.days.map(toCanaryDay);
      const latest = [...days].reverse().find((d) => d.outcome !== "none");
      return { repo: p.product.name, lkgr: row?.lkgr ?? (p.lkgr ? unknownCell(p.lkgr) : noneCell("not in the canary yet", products.sourceUrl, products.source)), channels, days, latest, hold: holds[perProduct.indexOf(p)] };
    });

  // --- health --------------------------------------------------------------------------------
  const ledgerCell: Cell = ledger.ok
    ? { state: ledger.value.reverts === 0 ? "green" : "pending", text: `${ledger.value.reverts} reverts, ${ledger.value.landed} landed`, url: ledger.sourceUrl, source: ledger.source }
    : unknownCell(ledger);

  // A count is `complete` only when every source feeding it was read; a 0 with a source down is
  // not "nothing", and the tile says so (rule 3). The counts are of what their tiles link to:
  // board cells for red or held (the Board has no writer rows), and sources, stale writers and
  // failed writers for the third tile, which opens Health. A product the gardener does not watch
  // yet has no tree-status file by design, so the tree cell is not in the completeness check; the
  // API-backed cells, the run files and (where a product is in the canary) the lkgr pointer are.
  const runsRead = perProduct.every((p) => p.days.every((d) => d.run.ok));
  const counts = {
    waiting: waiting.length,
    waitingComplete: reviewRequested.ok && openPulls.ok && reviewedBy.ok && failureIssues.ok && staleApprovals.every((s) => s.review.ok) && runsRead,
    redOrHeld: boardRowsFull.reduce((n, r) => n + [r.ci, r.tree, r.canary, r.deploy].filter((c) => c && (c.state === "red" || c.state === "held")).length, 0),
    redOrHeldComplete: checks.every((c) => c.ok) && perProduct.every((p) => p.deploy?.ok ?? true) && releaseChannels.ok && runsRead,
    unknownOrStale: sources.filter((s) => !s.ok).length + writers.filter((w) => w.state === "stale" || w.state === "red").length,
    todayComplete: mergedPulls.ok && treeHistory.ok && failures.ok && failureIssues.ok && releaseChannels.ok && writerRuns.every((r) => r.ok) && perProduct.every((p) => (p.lkgr?.ok ?? true) && (p.deploy?.ok ?? true)) && runsRead,
  };
  // When each page's data was read, from that page's own sources: the registries (the org list is
  // cached an hour) say nothing about how fresh the PRs or the files are, so they are left out.
  const runSignals = perProduct.flatMap((p) => p.days.map((d) => d.run));
  const productSignals: Signal<unknown>[] = perProduct.flatMap((p) => [p.lkgr, p.tree, p.deploy].filter((s) => s !== undefined));
  const reads = {
    today: sectionRead([mergedPulls, releaseChannels, treeHistory, failures, failureIssues, ...writerRuns, ...productSignals, ...runSignals], now),
    waiting: sectionRead([reviewRequested, openPulls, reviewedBy, failureIssues, ...staleApprovals.map((s) => s.review), ...runSignals], now),
    board: sectionRead([...checks, mergedPulls, openPulls, releaseChannels, ...writerRuns, ...productSignals, ...runSignals], now),
  };
  const api = apiState(sources);

  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: now.toISOString(),
    org: ORG,
    owner: OWNER,
    window,
    counts,
    reads,
    today: todayItems,
    waiting,
    board,
    unregistered,
    release: {
      channels: channelsConfig.ok ? channelsConfig.value.channels.map((c) => ({ name: c.name, cadence: c.cadence, audience: c.audience })) : [],
      repos: releaseRepos,
      reposReason: products.ok ? undefined : products.reason,
      report: report.ok ? { date: report.value.date, markdown: report.value.markdown, url: report.sourceUrl } : undefined,
      reportReason: report.ok ? undefined : report.reason,
    },
    health: {
      writers,
      scorecard: scorecard.ok
        ? {
            generatedAt: scorecard.value.generated_at,
            repos: Object.entries(scorecard.value.repos).map(([repo, metrics]) => ({ repo, metrics: metrics.map((m) => ({ name: m.name, value: m.value, unit: m.unit, target: m.target, detail: m.detail })) })),
            notMeasured: scorecard.value.not_measured.map((m) => ({ name: m.name, waitingOn: m.waiting_on, detail: m.detail })),
            url: scorecard.sourceUrl,
          }
        : undefined,
      scorecardReason: scorecard.ok ? undefined : scorecard.reason,
      ledger: ledgerCell,
      tokenPresent: hasToken(),
      apiRequestsThisHour: requestsThisHour(),
      api,
    },
    sources,
  };
}

/** The GitHub API as a whole, from the first reason that explains every API cell at once. */
export function apiState(sources: SourceStatus[]): Snapshot["health"]["api"] {
  if (!hasToken()) return { state: "no-token", text: "PRs, CI, deploys, issues and writer health are hidden until one is set; the state-branch files still show" };
  const reasons = sources.filter((s) => !s.ok && s.source.startsWith("github/")).map((s) => s.reason ?? "");
  const limited = rateLimitedUntil() ?? reasons.find((r) => r.startsWith(RATE_LIMIT_REASON))?.slice(RATE_LIMIT_REASON.length + 1);
  if (limited) return { state: "rate-limited", text: `the API cells are unknown until it resets at ${limited.slice(11, 16)} UTC`, until: limited };
  if (reasons.includes("token rejected")) return { state: "token-rejected", text: "expired or revoked, so PRs, CI, deploys, issues and writer health are hidden until it is replaced" };
  const apiSources = sources.filter((s) => isApiSource(s.source));
  if (apiSources.length && apiSources.every((s) => !s.ok)) return { state: "down", text: reasons[0] ?? "no reason given" };
  return { state: "ok", text: "" };
}

// --- helpers -----------------------------------------------------------------------------------

/**
 * Reads the three registries (raw files, no token) and says whether a name is one of their repos:
 * `true`, `null` when none names it, or the reason when a registry could not be read and the
 * answer is therefore not known.
 */
export async function isRegisteredRepo(name: string): Promise<true | null | { unavailable: string }> {
  const [products, gate] = await Promise.all([readProducts(), readGateRepos()]);
  if (products.ok && products.value.some((p) => p.name === name)) return true;
  if (gate.ok && gate.value.some((r) => r.name === name)) return true;
  if (localGroups().some((g) => Object.hasOwn(g.repos, name))) return true;
  if (!products.ok) return { unavailable: products.reason };
  if (!gate.ok) return { unavailable: gate.reason };
  return null;
}

type RowSeed = Omit<BoardRow, "ci" | "openPulls" | "openPullsLowerBound" | "lastMerge" | "worst" | "quiet">;

/** Every repo once: products, then the gate's infra repos, then this repo's own groups, then any public repo none of them names. */
export function boardRows(
  products: Product[],
  gateRepos: Signal<{ name: string; kind: string }[]>,
  orgRepos: Signal<{ name: string; url: string; defaultBranch: string; description: string; archived: boolean }[]>,
): RowSeed[] {
  const rows: RowSeed[] = [];
  const seen = new Set<string>();
  const org = new Map((orgRepos.ok ? orgRepos.value : []).map((r) => [r.name, r]));
  const add = (name: string, group: string, extra: Partial<RowSeed> = {}) => {
    if (seen.has(name)) return;
    seen.add(name);
    const o = org.get(name);
    rows.push({
      name,
      url: web.repo(name),
      description: extra.description || o?.description || "",
      group,
      product: group === "products",
      defaultBranch: extra.defaultBranch || o?.defaultBranch || "main",
      registered: extra.registered ?? true,
    });
  };
  for (const p of products) add(p.name, "products", { description: p.description, defaultBranch: p.defaultBranch });
  if (gateRepos.ok) for (const r of gateRepos.value) if (r.kind !== "product") add(r.name, "infra");
  for (const g of localGroups()) for (const [name, description] of Object.entries(g.repos)) add(name, g.id, { description });
  for (const r of org.values()) if (!r.archived) add(r.name, "unregistered", { registered: false });
  return rows;
}

const GROUP_TITLES: Record<string, string> = {
  products: "Products",
  infra: "qq infra",
  apps: "Apps in progress",
  knowledge: "Knowledge",
  other: "Other",
  unregistered: "Not in any registry",
};

/** Groups in registry order; inside a group, the repos that need a look come first (stable otherwise). */
function groupRows(rows: BoardRow[]): BoardGroup[] {
  const order = ["products", "infra", ...localGroups().map((g) => g.id), "unregistered"];
  const rank = (r: BoardRow) => WORST_ORDER.indexOf(r.worst);
  return order
    .map((id) => ({ id, title: GROUP_TITLES[id] ?? id, repos: rows.filter((r) => r.group === id).sort((a, b) => rank(a) - rank(b)) }))
    .filter((g) => g.repos.length > 0);
}

/** The newest day whose run file could not be read: newer than the last readable run, it hides the real state. */
function newestUnreadable(days: { date: string; run: Signal<CanaryRun | null> }[]): { date: string; run: Signal<CanaryRun | null> } | undefined {
  for (let i = days.length - 1; i >= 0; i -= 1) if (!days[i].run.ok) return days[i];
  return undefined;
}

function latestRun(days: { date: string; run: Signal<CanaryRun | null> }[]): CanaryRun | undefined {
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const r = days[i].run;
    if (r.ok && r.value) return r.value;
  }
  return undefined;
}

export function outcomeState(outcome: string): State {
  switch (outcome) {
    case "shipped":
      return "green";
    case "held":
      return "held";
    case "error":
      return "red";
    default:
      return "unknown";
  }
}

function toCanaryDay(day: { date: string; run: Signal<CanaryRun | null> }): CanaryDay {
  const base = { date: day.date, url: day.run.sourceUrl };
  if (!day.run.ok) return { ...base, outcome: "unknown", reason: day.run.reason };
  if (!day.run.value) return { ...base, outcome: "none", reason: "no run that day" };
  const run = day.run.value;
  return { ...base, outcome: run.outcome === "later" ? "noop" : run.outcome, reason: tidy(run.reason), url: run.run_url || blobUrl("release", "release-state", `canary/${run.repo}/runs/${day.date}.json`) };
}

/** Plain words for a cell's age, for the pages. */
export function cellAge(cell: Cell, now: Date): string {
  return cell.at ? ago(cell.at, now) : "";
}
