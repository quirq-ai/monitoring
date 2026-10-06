import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason } from "@/lib/fetch";
import { assertRepoName } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// gardener tree-status status/<repo>.json: open, closed or unknown, with the builders' newest
// verdicts and the red ranges. The file carries no timestamp; its writer's run says if it is alive.

const REPO = "gardener";
const BRANCH = "tree-status";
const SCHEMA = "qq-tree-status/1";
const REVALIDATE = 120;

const BuilderSchema = z.object({
  commit: z.string().default(""),
  state: z.string(),
  url: z.string().default(""),
});

const RedRangeSchema = z
  .object({
    builder: z.string().optional(),
    first_bad: z.string().optional(),
    last_good: z.string().optional(),
    since: z.string().optional(),
    url: z.string().optional(),
  })
  .loose();

const TreeStatusSchema = z.object({
  schema: z.string(),
  repo: z.string(),
  branch: z.string().default("main"),
  state: z.enum(["open", "closed", "unknown"]),
  reason: z.string().default(""),
  head: z.string().default(""),
  green: z.string().default(""),
  builders: z.record(z.string(), BuilderSchema).default({}),
  red: z.array(RedRangeSchema).default([]),
  notes: z.array(z.string()).default([]),
  coverage: z
    .object({
      commits: z.number().optional(),
      since: z.string().optional(),
      missing: z.array(z.string()).default([]),
      pending: z.array(z.string()).default([]),
    })
    .loose()
    .optional(),
});

export type TreeStatus = z.infer<typeof TreeStatusSchema>;

export async function readTreeStatus(repo: string): Promise<Signal<TreeStatus>> {
  assertRepoName(repo);
  const path = `status/${repo}.json`;
  const source = `gardener/tree-status/${repo}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) {
    const why = raw.status === 404 ? `the gardener does not watch ${repo}` : raw.reason;
    return failSignal(source, sourceUrl, `tree-status: ${why}`, raw);
  }
  const parsed = parseJson(TreeStatusSchema, raw.text, `tree-status: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, schemaReason(`tree-status: ${path}`, parsed.value.schema, SCHEMA), raw);
  }
  return okSignal(source, sourceUrl, parsed.value, undefined, raw);
}
