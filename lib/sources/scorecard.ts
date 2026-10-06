import { z } from "zod";
import { blobUrl, fetchRaw, parseJson } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// test-pipelines results scorecard.json: the weekly numbers per repo, plus what is not measured
// yet and why. It has no schema id, so only its shape is checked.

const SOURCE = "test-pipelines/scorecard";
const REPO = "test-pipelines";
const BRANCH = "results";
const PATH = "scorecard.json";
const REVALIDATE = 600;

const MetricSchema = z.object({
  name: z.string(),
  value: z.number().nullable(),
  unit: z.string().default(""),
  target: z.string().default(""),
  detail: z.string().default(""),
  waiting_on: z.string().default(""),
});

const CollectRepoSchema = z
  .object({
    repo: z.string(),
    finished: z.boolean().optional(),
    listed: z.boolean().optional(),
    reasons: z.array(z.string()).default([]),
  })
  .loose();

const ScorecardSchema = z.object({
  generated_at: z.string(),
  since: z.string().default(""),
  until: z.string().default(""),
  repos: z.record(z.string(), z.array(MetricSchema)),
  not_measured: z.array(MetricSchema).default([]),
  skipped: z.unknown().optional(),
  collect: z
    .object({
      complete: z.boolean().optional(),
      problems: z.array(z.unknown()).default([]),
      repos: z.array(CollectRepoSchema).default([]),
    })
    .loose()
    .optional(),
});

export type ScorecardMetric = z.infer<typeof MetricSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;

export async function readScorecard(): Promise<Signal<Scorecard>> {
  const sourceUrl = blobUrl(REPO, BRANCH, PATH);
  const raw = await fetchRaw(REPO, BRANCH, PATH, REVALIDATE);
  if (!raw.ok) return failSignal(SOURCE, sourceUrl, `results: ${raw.reason}`);
  const parsed = parseJson(ScorecardSchema, raw.text, "results: scorecard.json");
  if (!parsed.ok) return failSignal(SOURCE, sourceUrl, parsed.reason);
  return okSignal(SOURCE, sourceUrl, parsed.value, parsed.value.generated_at);
}
