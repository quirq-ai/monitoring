import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, parseValue, treeUrl } from "@/lib/fetch";
import { ghGet, isSafeName, repoPath } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";
import { isDemoSubject } from "@/config/demo";

// test-pipelines results failures/<id>/failure.json: one record per failure the pipeline opened.
// Raw cannot list a directory, so the ids come from the contents API (cached 5 min).

const REPO = "test-pipelines";
const BRANCH = "results";
const SCHEMA = "quirq-results/1";
const REVALIDATE = 300;

const FailureSchema = z
  .object({
    schema: z.string(),
    id: z.string(),
    kind: z.string().default(""),
    repo: z.string().default(""),
    subject: z.string().default(""),
    summary: z.string().default(""),
    opened_at: z.string().default(""),
    stage: z.string().default(""),
    signal: z.string().default(""),
    channel: z.string().default(""),
    culprit: z.string().default(""),
    fix: z.string().default(""),
    postmortem: z.string().default(""),
    security: z.boolean().default(false),
    run_id: z.string().default(""),
  })
  .loose();

export type FailureRecord = z.infer<typeof FailureSchema> & { demo: boolean; url: string };

const EntrySchema = z.object({ name: z.string(), type: z.string() }).loose();

export async function readFailures(): Promise<Signal<FailureRecord[]>> {
  const source = "test-pipelines/failures";
  const sourceUrl = treeUrl(REPO, BRANCH, "failures");
  const api = await ghGet<unknown>(repoPath(REPO, "contents/failures"), {
    revalidate: REVALIDATE,
    params: { ref: BRANCH },
  });
  if (!api.ok) {
    const why = api.status === 404 ? "no failures directory yet" : api.reason;
    return failSignal(source, sourceUrl, `results: ${why}`);
  }
  const parsed = parseValue(z.array(EntrySchema), api.data, "results: failures/");
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  const names = parsed.value.filter((e) => e.type === "dir" && !e.name.startsWith(".")).map((e) => e.name);
  const bad: string[] = names.filter((n) => !isSafeName(n, 120)).map((n) => `${n}: not a failure id`);
  const ids = names.filter((n) => isSafeName(n, 120));
  const records = await Promise.all(ids.map((id) => readFailure(id)));
  const good: FailureRecord[] = [];
  records.forEach((r, i) => (r.ok ? good.push(r.value) : bad.push(`${ids[i]}: ${r.reason}`)));
  if (bad.length) return failSignal(source, sourceUrl, `results: ${bad.length} of ${names.length} records unreadable: ${bad[0]}`);
  good.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  return okSignal(source, sourceUrl, good, good[0]?.opened_at || undefined);
}

export async function readFailure(id: string): Promise<Signal<FailureRecord>> {
  if (!isSafeName(id, 120)) throw new Error(`not a failure id: ${id}`);
  const path = `failures/${id}/failure.json`;
  const source = `test-pipelines/failure/${id}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) return failSignal(source, sourceUrl, `results: ${raw.reason}`);
  const parsed = parseJson(FailureSchema, raw.text, `results: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, `results: ${path}: schema ${parsed.value.schema} is not ${SCHEMA}; the dashboard needs updating for it`);
  }
  return okSignal(source, sourceUrl, {
    ...parsed.value,
    demo: isDemoSubject(parsed.value.subject),
    url: treeUrl(REPO, BRANCH, `failures/${id}`),
  });
}
