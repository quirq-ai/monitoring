import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason, treeUrl } from "@/lib/fetch";
import { assertRepoName } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// release release-state canary/<repo>/runs/<date>.json: one outcome per repo per day. A day with
// no file is a day the canary did not run for that repo, which is itself worth showing.

const REPO = "release";
const BRANCH = "release-state";
const SCHEMA = "qq-canary-run/1";
const REVALIDATE = 300;

export const canaryOutcomes = ["shipped", "held", "noop", "error"] as const;
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
    if (raw.status === 404) return okSignal(source, treeUrl(REPO, BRANCH, `canary/${repo}/runs`), null);
    return failSignal(source, sourceUrl, `release-state: ${raw.reason}`);
  }
  const parsed = parseJson(RunSchema, raw.text, `release-state: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, schemaReason(`release-state: ${path}`, parsed.value.schema, SCHEMA));
  }
  return okSignal(source, sourceUrl, parsed.value, parsed.value.finished_at || undefined);
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

export async function readCanaryDays(repo: string, days = 14, now = new Date()): Promise<CanaryDay[]> {
  const dates = recentDates(days, now);
  const runs = await Promise.all(dates.map((date) => readCanaryRun(repo, date)));
  return dates.map((date, i) => ({ date, run: runs[i] }));
}
