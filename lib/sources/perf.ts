import { z } from "zod";
import { blobUrl, fetchRaw, parseValue, treeUrl } from "@/lib/fetch";
import { assertRepoName, ghGet, isSafeName, repoPath } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// perf perf-data <repo>/<metric>.jsonl: one qq-perf-record/1 per line, write-once. Raw cannot
// list a directory, so the metric names come from the contents API (cached an hour).

const REPO = "perf";
const BRANCH = "perf-data";
const SCHEMA = "qq-perf-record/1";
const REVALIDATE_LIST = 3600;
const REVALIDATE_SERIES = 600;

const ValueSchema = z.object({ name: z.string(), unit: z.string().default(""), value: z.number() });

const RecordSchema = z
  .object({
    schema: z.string(),
    repo: z.string(),
    metric: z.string(),
    commit: z.string(),
    committed_at: z.string().optional(),
    recorded_at: z.string(),
    status: z.enum(["ok", "failed"]),
    target: z.string().optional(),
    run: z.object({ url: z.string().default("") }).loose().optional(),
    values: z.array(ValueSchema).default([]),
  })
  .loose();

export type PerfRecord = z.infer<typeof RecordSchema>;

const EntrySchema = z.object({ name: z.string(), type: z.string() }).loose();

export async function listPerfMetrics(repo: string): Promise<Signal<string[]>> {
  assertRepoName(repo);
  const source = `perf/metrics/${repo}`;
  const sourceUrl = treeUrl(REPO, BRANCH, repo);
  const api = await ghGet<unknown>(repoPath(REPO, `contents/${repo}`), {
    revalidate: REVALIDATE_LIST,
    params: { ref: BRANCH },
  });
  if (!api.ok) {
    const why = api.status === 404 ? `no perf data for ${repo}` : api.reason;
    return failSignal(source, sourceUrl, `perf-data: ${why}`, api);
  }
  const parsed = parseValue(z.array(EntrySchema), api.data, `perf-data: ${repo}/`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, api);
  const metrics = parsed.value
    .filter((e) => e.type === "file" && e.name.endsWith(".jsonl"))
    .map((e) => e.name.slice(0, -".jsonl".length))
    .filter((name) => isSafeName(name, 100));
  return okSignal(source, sourceUrl, metrics, undefined, api);
}

export type PerfSeries = { metric: string; records: PerfRecord[]; skipped: number };

export async function readPerfSeries(repo: string, metric: string): Promise<Signal<PerfSeries>> {
  assertRepoName(repo);
  if (!isSafeName(metric, 100)) throw new Error(`not a metric name: ${metric}`);
  const path = `${repo}/${metric}.jsonl`;
  const source = `perf/${repo}/${metric}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE_SERIES);
  if (!raw.ok) return failSignal(source, sourceUrl, `perf-data: ${raw.reason}`, raw);
  const records: PerfRecord[] = [];
  let skipped = 0;
  for (const line of raw.text.split("\n")) {
    if (!line.trim()) continue;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    const parsed = RecordSchema.safeParse(data);
    if (!parsed.success || parsed.data.schema !== SCHEMA) {
      skipped++;
      continue;
    }
    records.push(parsed.data);
  }
  if (records.length === 0) {
    return failSignal(source, sourceUrl, `perf-data: ${path} has no ${SCHEMA} records (${skipped} line(s) skipped)`, raw);
  }
  records.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return okSignal(source, sourceUrl, { metric, records, skipped }, records.at(-1)?.recorded_at, raw);
}
