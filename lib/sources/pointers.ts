import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason } from "@/lib/fetch";
import { assertRepoName } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// release release-state pointers/<repo>/lkgr.json and pointers/<repo>/channels/<name>.json:
// where a pointer is, where it was, and whether it is pending, mirrored or rolled back.

const REPO = "release";
const BRANCH = "release-state";
const SCHEMA = "qq-pointer/1";
const REVALIDATE = 120;

const HistorySchema = z.object({
  commit: z.string(),
  digest: z.string().default(""),
  generation: z.number().int(),
  op: z.string().default(""),
  updated_at: z.string(),
});

const PointerSchema = z.object({
  schema: z.string(),
  repo: z.string(),
  ref: z.string(),
  commit: z.string(),
  digest: z.string().default(""),
  generation: z.number().int(),
  updated_at: z.string(),
  op: z.string().default(""),
  pending: z.string().default(""),
  mirrored: z.boolean().default(false),
  rolled_back: z.array(z.unknown()).default([]),
  history: z.array(HistorySchema).default([]),
});

export type Pointer = z.infer<typeof PointerSchema>;
export type PointerRef = "lkgr" | `channels/${string}`;

function pointerPath(repo: string, ref: PointerRef): string {
  return `pointers/${repo}/${ref}.json`;
}

export async function readPointer(repo: string, ref: PointerRef): Promise<Signal<Pointer>> {
  assertRepoName(repo);
  if (!/^(lkgr|channels\/[A-Za-z0-9_-]{1,50})$/.test(ref)) throw new Error(`not a pointer ref: ${ref}`);
  const path = pointerPath(repo, ref);
  const source = `release/pointer/${repo}/${ref}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) {
    const why = raw.status === 404 ? `no ${ref} pointer for ${repo} yet` : raw.reason;
    return failSignal(source, sourceUrl, `release-state: ${why}`, raw);
  }
  const parsed = parseJson(PointerSchema, raw.text, `release-state: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, schemaReason(`release-state: ${path}`, parsed.value.schema, SCHEMA), raw);
  }
  return okSignal(source, sourceUrl, parsed.value, parsed.value.updated_at, raw);
}
