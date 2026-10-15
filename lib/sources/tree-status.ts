import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason } from "@/lib/fetch";
import { assertRepoName, isSafeName } from "@/lib/github";
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

// A red range, from gardener src/qqgarden/model.py RedSpan: the suspects are the commits after
// last_good up to first_bad, oldest first; `url` is the first red run.
const RedRangeSchema = z
  .object({
    builder: z.string().optional(),
    first_bad: z.string().optional(),
    latest_bad: z.string().optional(),
    last_good: z.string().optional(),
    suspects: z.array(z.string()).default([]),
    since: z.string().optional(),
    url: z.string().optional(),
    first_bad_backfill: z.boolean().optional(),
    first_bad_running: z.boolean().optional(),
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
      cancelled: z.array(z.string()).default([]),
      backfilling: z.array(z.string()).default([]),
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

/**
 * The repos the gardener watches, in the order its index lists them: the first column of
 * `status/README.md`, which the tree-status job writes next to the status files. A name that is
 * not a plain repo name is dropped, never fetched.
 */
export async function readTreeIndex(): Promise<Signal<string[]>> {
  const path = "status/README.md";
  const source = "gardener/tree-status/index";
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) {
    const why = raw.status === 404 ? "the tree-status branch has no status/README.md" : raw.reason;
    return failSignal(source, sourceUrl, `tree-status: ${why}`, raw);
  }
  const repos = parseIndex(raw.text);
  if (repos === null) return failSignal(source, sourceUrl, "tree-status: status/README.md has no repo table", raw);
  return okSignal(source, sourceUrl, repos, undefined, raw);
}

/** The table's first column, header and divider aside; null when there is no `| Repo |` table. */
export function parseIndex(text: string): string[] | null {
  const rows = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  const header = rows[0]?.split("|").map((c) => c.trim())[1];
  if (header !== "Repo") return null;
  const names: string[] = [];
  for (const row of rows.slice(1)) {
    const name = row.split("|")[1]?.trim() ?? "";
    if (/^-+$/.test(name) || !isSafeName(name, 100) || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}
