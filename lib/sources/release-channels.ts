import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// release release-state channels.json: what each channel names right now, per repo.

const SOURCE = "release/channels";
const REPO = "release";
const BRANCH = "release-state";
const PATH = "channels.json";
const SCHEMA = "qq-channels/1";
const REVALIDATE = 120;

const EntrySchema = z.object({
  commit: z.string(),
  digest: z.string().default(""),
  generation: z.number().int(),
  op: z.string().default(""),
  updated_at: z.string(),
});

const FileSchema = z.object({
  schema: z.string(),
  repos: z.record(z.string(), z.record(z.string(), EntrySchema)),
});

export type ChannelEntry = z.infer<typeof EntrySchema>;
/** repo -> channel -> entry */
export type ReleaseChannels = Record<string, Record<string, ChannelEntry>>;

export async function readReleaseChannels(): Promise<Signal<ReleaseChannels>> {
  const sourceUrl = blobUrl(REPO, BRANCH, PATH);
  const raw = await fetchRaw(REPO, BRANCH, PATH, REVALIDATE);
  if (!raw.ok) return failSignal(SOURCE, sourceUrl, `release-state: ${raw.reason}`);
  const parsed = parseJson(FileSchema, raw.text, "release-state: channels.json");
  if (!parsed.ok) return failSignal(SOURCE, sourceUrl, parsed.reason);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(SOURCE, sourceUrl, schemaReason("release-state: channels.json", parsed.value.schema, SCHEMA));
  }
  const newest = Object.values(parsed.value.repos)
    .flatMap((channels) => Object.values(channels).map((entry) => entry.updated_at))
    .sort()
    .at(-1);
  return okSignal(SOURCE, sourceUrl, parsed.value.repos, newest);
}
