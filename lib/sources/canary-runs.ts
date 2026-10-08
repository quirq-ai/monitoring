import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason, treeUrl } from "@/lib/fetch";
import { assertRepoName, ghGet, hasToken, isPlainNotFound, repoPath } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// release release-state canary/<repo>/runs/<date>.json: one outcome per repo per day. A day with
// no file is a day the canary did not run for that repo, which is itself worth showing.

const REPO = "release";
const BRANCH = "release-state";
const SCHEMA = "qq-canary-run/1";
const REVALIDATE = 300;

export const canaryOutcomes = ["shipped", "held", "noop", "error", "later"] as const;
export type CanaryOutcome = (typeof canaryOutcomes)[number];

const StageSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  ran: z.boolean().optional(),
  detail: z.string().default(""),
  seconds: z.number().optional(),
});

const RunCore = z.object({
  schema: z.string(),
  repo: z.string(),
  date: z.string(),
  commit: z.string().default(""),
  digest: z.string().default(""),
  outcome: z.enum(canaryOutcomes),
  reason: z.string().default(""),
  previous: z.string().default(""),
  operation: z.string().default(""),
  run_url: z.string().default(""),
  started_at: z.string().default(""),
  finished_at: z.string().default(""),
  stages: z.array(StageSchema).default([]),
});

const RunSchema = RunCore.extend({ earlier: z.array(RunCore).default([]) });

export type CanaryStage = z.infer<typeof StageSchema>;
export type CanaryRun = z.infer<typeof RunSchema>;

/** The run file for one day, or `null` when the day has no file. */
export async function readCanaryRun(repo: string, date: string): Promise<Signal<CanaryRun | null>> {
  assertRepoName(repo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`not a date: ${date}`);
  const path = `canary/${repo}/runs/${date}.json`;
  const source = `release/canary/${repo}/${date}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) {
    if (raw.status === 404) return okSignal(source, treeUrl(REPO, BRANCH, `canary/${repo}/runs`), null, undefined, raw);
    return failSignal(source, sourceUrl, `release-state: ${raw.reason}`, raw);
  }
  const parsed = parseJson(RunSchema, raw.text, `release-state: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, schemaReason(`release-state: ${path}`, parsed.value.schema, SCHEMA), raw);
  }
  return okSignal(source, sourceUrl, parsed.value, parsed.value.finished_at || undefined, raw);
}

/** The last `days` UTC dates ending today, oldest first. */
export function recentDates(days: number, now = new Date()): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export type CanaryDay = { date: string; run: Signal<CanaryRun | null> };

/** The days read, and the directory listing they came from (`null` without a token: each day was probed). */
export type CanaryDays = { listing: Signal<string[]> | null; days: CanaryDay[] };

const ListingSchema = z.array(z.object({ name: z.string(), type: z.string() }).loose());

/**
 * Which days have a run file, from one contents listing (cached 5 min). Raw answers 404 for a
 * missing day and Next never caches a 404, so probing every day would cost 14 reads per render.
 * A directory that does not exist yet is an empty list, not a failure; a refused or malformed
 * listing is `ok: false` with the reason, so Health can show it, and the caller probes each day.
 */
export async function listCanaryRunDates(repo: string): Promise<Signal<string[]>> {
  assertRepoName(repo);
  const source = `release/canary-listing/${repo}`;
  const sourceUrl = treeUrl(REPO, BRANCH, `canary/${repo}/runs`);
  const api = await ghGet<unknown>(repoPath(REPO, `contents/canary/${repo}/runs`), { revalidate: REVALIDATE, params: { ref: BRANCH } });
  if (!api.ok) {
    // A missing directory is no runs yet; a 404 that says the ref is missing is the branch gone.
    if (api.status === 404 && isPlainNotFound(api.message)) return okSignal(source, sourceUrl, [], undefined, api);
    return failSignal(source, sourceUrl, `release-state: canary/${repo}/runs listing: ${api.reason}; days read one by one`, api);
  }
  const parsed = ListingSchema.safeParse(api.data);
  if (!parsed.success) return failSignal(source, sourceUrl, `release-state: canary/${repo}/runs listing does not match schema; days read one by one`, api);
  return okSignal(source, sourceUrl, parsed.data.filter((e) => e.type === "file").map((e) => e.name.replace(/\.json$/, "")), undefined, api);
}

export async function readCanaryDays(repo: string, days = 14, now = new Date()): Promise<CanaryDays> {
  assertRepoName(repo);
  const dates = recentDates(days, now);
  const listing = hasToken() ? await listCanaryRunDates(repo) : null;
  // A day the listing has no file for is "no run", dated by the listing's own read.
  const known = listing?.ok ? { dates: new Set(listing.value), read: listing } : null;
  const runs = await Promise.all(
    dates.map((date) =>
      known && !known.dates.has(date)
        ? Promise.resolve(okSignal<CanaryRun | null>(`release/canary/${repo}/${date}`, treeUrl(REPO, BRANCH, `canary/${repo}/runs`), null, undefined, known.read))
        : readCanaryRun(repo, date),
    ),
  );
  return { listing, days: dates.map((date, i) => ({ date, run: runs[i] })) };
}
