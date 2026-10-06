import { WRITERS } from "@/config/freshness";
import { OWNER } from "@/config/owner";
import { ORG, blobUrl, treeUrl } from "@/lib/fetch";
import { hasToken, requestsThisHour, web } from "@/lib/github";
import type { Signal } from "@/lib/signal";
import { judgeWriter } from "@/lib/model/freshness";
import { ago, WINDOWS, within, type Window } from "@/lib/model/time";
import {
  SNAPSHOT_SCHEMA,
  type BoardGroup,
  type BoardRow,
  type CanaryDay,
  type Cell,
  type ReleaseRepo,
  type Snapshot,
  type SourceStatus,
  type TodayItem,
  type WaitingItem,
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
    observedAt: signal.observedAt,
    ok: signal.ok,
    reason: signal.ok ? undefined : signal.reason,
  };
}

function unknownCell(signal: Signal<unknown>, text?: string): Cell {
  return { state: "unknown", text: text ?? (signal.ok ? "no data" : signal.reason), url: signal.sourceUrl, source: signal.source };
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

  // Phase 2: per product and per board repo.
  const productList: Product[] = products.ok ? products.value : [];
  const rows = boardRows(productList, gateRepos, orgRepos);
  const [perProduct, checks, staleApprovals] = await Promise.all([
    Promise.all(
      productList.map(async (p) => {
        const [lkgr, tree, days, deploy] = await Promise.all([
          readPointer(p.name, "lkgr").then(track),
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
    const lastMerge: Cell = mergedPulls.ok
      ? newest
        ? { state: "green", text: `#${newest.number} ${newest.title}`, url: newest.url, at: newest.mergedAt ?? undefined, source: mergedPulls.source }
        : { state: "unknown", text: "nothing merged in 7 days", url: web.pulls(row.name), source: mergedPulls.source }
      : unknownCell(mergedPulls);
    const base: BoardRow = {
      ...row,
      ci,
      openPulls: openPulls.ok ? pulls.filter((p) => p.repo === row.name).length : -1,
      lastMerge,
    };
    const p = productIndex.get(row.name);
    if (!p) return base;
    const tree: Cell = p.tree.ok
      ? { state: p.tree.value.state === "open" ? "green" : p.tree.value.state === "closed" ? "red" : "unknown", text: p.tree.value.reason || p.tree.value.state, url: p.tree.sourceUrl, source: p.tree.source }
      : unknownCell(p.tree);
    const lkgr: Cell = p.lkgr.ok
      ? { state: p.lkgr.value.pending ? "pending" : "green", text: `${short(p.lkgr.value.commit)}${p.lkgr.value.pending ? ` pending ${short(p.lkgr.value.pending)}` : ""}`, url: web.commit(row.name, p.lkgr.value.commit), at: p.lkgr.value.updated_at, source: p.lkgr.source }
      : unknownCell(p.lkgr);
    const latest = latestRun(p.days);
    const unreadable = newestUnreadable(p.days);
    const runsDown = unreadable !== undefined && (!latest || unreadable.date > latest.date);
    const canaryEntry = channelMap[row.name]?.canary;
    const runsUrl = treeUrl("release", "release-state", `canary/${row.name}/runs`);
    // The cell is how the last canary run went; the channel pointer is what it shipped. No run
    // inside the strip's window is stale, never green, whatever channels.json says (rule 3).
    const canary: Cell = p.product.channels.length === 0
      ? { state: "unknown", text: "no channels configured", url: products.sourceUrl, source: products.source }
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
                ? { state: "unknown", text: `${latest.outcome}, nothing promoted yet`, url: releaseChannels.sourceUrl, source: releaseChannels.source }
                : unknownCell(releaseChannels);
    const deploy: Cell | undefined = !p.deploy
      ? undefined
      : p.deploy.ok
        ? p.deploy.value
          ? { state: p.deploy.value.state, text: `${p.deploy.value.status} ${short(p.deploy.value.sha)}`, url: p.deploy.value.url, at: p.deploy.value.createdAt, source: p.deploy.source }
          : { state: "unknown", text: "no deployments", url: p.deploy.sourceUrl, source: p.deploy.source }
        : unknownCell(p.deploy);
    return { ...base, tree, lkgr, canary, deploy };
  });
  const board = groupRows(boardRowsFull);
  const unregistered = boardRowsFull.filter((r) => !r.registered).map((r) => r.name);

  // --- today -------------------------------------------------------------------------------
  const today: TodayItem[] = [];
  for (const pr of merged) {
    if (within(pr.mergedAt, hours, now)) today.push({ kind: "merged", repo: pr.repo, title: `merged #${pr.number} ${pr.title}`, at: pr.mergedAt ?? pr.updatedAt, url: pr.url, state: "green" });
  }
  for (const p of perProduct) {
    if (p.lkgr.ok) {
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
  today.sort((a, b) => b.at.localeCompare(a.at));

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
            ? { state: "unknown", text: "nothing promoted yet", url: releaseChannels.sourceUrl, source: releaseChannels.source }
            : unknownCell(releaseChannels);
      }
      const days = p.days.map(toCanaryDay);
      const latest = [...days].reverse().find((d) => d.outcome !== "none");
      return { repo: p.product.name, lkgr: row?.lkgr ?? unknownCell(p.lkgr), channels, days, latest, hold: holds[perProduct.indexOf(p)] };
    });

  // --- health --------------------------------------------------------------------------------
  const writers = WRITERS.map((w, i) => judgeWriter(w, writerRuns[i], now));
  const ledgerCell: Cell = ledger.ok
    ? { state: ledger.value.reverts === 0 ? "green" : "pending", text: `${ledger.value.reverts} reverts, ${ledger.value.landed} landed`, url: ledger.sourceUrl, source: ledger.source }
    : unknownCell(ledger);

  // A count is `complete` only when every source feeding it was read; a 0 with a source down is
  // not "nothing", and the tile says so (rule 3). The counts are of what their tiles link to:
  // board cells for red or held, so a failed writer run is on Health, not in a count. A product
  // the gardener does not watch yet has no tree-status file by design, so the tree cell is not
  // in the completeness check; the API-backed cells and the run files are.
  const runsRead = perProduct.every((p) => p.days.every((d) => d.run.ok));
  const counts = {
    waiting: waiting.length,
    waitingComplete: reviewRequested.ok && openPulls.ok && reviewedBy.ok && failureIssues.ok && staleApprovals.every((s) => s.review.ok) && runsRead,
    redOrHeld: boardRowsFull.reduce((n, r) => n + [r.ci, r.tree, r.canary, r.deploy].filter((c) => c && (c.state === "red" || c.state === "held")).length, 0),
    redOrHeldComplete: checks.every((c) => c.ok) && perProduct.every((p) => p.deploy?.ok ?? true) && releaseChannels.ok && runsRead,
    unknownOrStale: sources.filter((s) => !s.ok).length + writers.filter((w) => w.state === "stale").length,
  };

  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: now.toISOString(),
    org: ORG,
    owner: OWNER,
    window,
    counts,
    today,
    waiting,
    board,
    unregistered,
    release: {
      channels: channelsConfig.ok ? channelsConfig.value.channels.map((c) => ({ name: c.name, cadence: c.cadence, audience: c.audience })) : [],
      repos: releaseRepos,
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
    },
    sources,
  };
}

// --- helpers -----------------------------------------------------------------------------------

/** Reads the three registries (raw files, no token) and says whether a name is one of their repos. */
export async function isRegisteredRepo(name: string): Promise<boolean> {
  const [products, gate] = await Promise.all([readProducts(), readGateRepos()]);
  if (products.ok && products.value.some((p) => p.name === name)) return true;
  if (gate.ok && gate.value.some((r) => r.name === name)) return true;
  return localGroups().some((g) => Object.hasOwn(g.repos, name));
}

type RowSeed = Omit<BoardRow, "ci" | "openPulls" | "lastMerge">;

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

function groupRows(rows: BoardRow[]): BoardGroup[] {
  const order = ["products", "infra", ...localGroups().map((g) => g.id), "unregistered"];
  return order
    .map((id) => ({ id, title: GROUP_TITLES[id] ?? id, repos: rows.filter((r) => r.group === id) }))
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

export function outcomeState(outcome: string): Cell["state"] {
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
