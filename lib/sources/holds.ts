import { z } from "zod";
import { blobUrl, fetchRaw, parseJson } from "@/lib/fetch";
import { assertRepoName } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// release release-state canary/<repo>/held/<commit>.json: why a canary commit is held, and
// whether the hold was released. Written by release src/qqrelease/canary.py (_hold_record).

const REPO = "release";
const BRANCH = "release-state";
const REVALIDATE = 300;

const ReleaseSchema = z.object({
  operation: z.string().default(""),
  at: z.string().default(""),
  actor: z.string().default(""),
  requested_by: z.string().default(""),
  reason: z.string().default(""),
});

const HoldSchema = z.object({
  repo: z.string(),
  commit: z.string(),
  date: z.string().default(""),
  stage: z.string().default(""),
  state: z.string().default("held"),
  digest: z.string().default(""),
  run_url: z.string().default(""),
  reason: z.string().optional(),
  failure: z.string().optional(),
  releases: z.array(ReleaseSchema).default([]),
});

export type Hold = z.infer<typeof HoldSchema>;

/** `null` when there is no hold record for the commit. */
export async function readHold(repo: string, commit: string): Promise<Signal<Hold | null>> {
  assertRepoName(repo);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a commit id: ${commit}`);
  const path = `canary/${repo}/held/${commit}.json`;
  const source = `release/hold/${repo}/${commit.slice(0, 12)}`;
  const sourceUrl = blobUrl(REPO, BRANCH, path);
  const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
  if (!raw.ok) {
    if (raw.status === 404) return okSignal(source, sourceUrl, null);
    return failSignal(source, sourceUrl, `release-state: ${raw.reason}`);
  }
  const parsed = parseJson(HoldSchema, raw.text, `release-state: ${path}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  return okSignal(source, sourceUrl, parsed.value);
}
