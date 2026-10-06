import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { blobUrl, fetchRaw, parseValue } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// infra-config config/channels.toml: the channel order, cadence and the canary schedule.
// Read, never restated: the Release page shows channels in this file's order.

const SOURCE = "infra-config/channels";
const REPO = "infra-config";
const PATH = "config/channels.toml";
const REVALIDATE = 600;

const ChannelSchema = z.object({
  name: z.string().min(1),
  audience: z.array(z.string()).default([]),
  from: z.string().default(""),
  cadence: z.string().default(""),
  schedule: z.string().optional(),
  unattended: z.boolean().optional(),
});

const FileSchema = z.object({
  source: z.object({ ref: z.string().default("lkgr") }).default({ ref: "lkgr" }),
  channel: z.array(ChannelSchema).min(1),
});

export type ChannelConfig = z.infer<typeof ChannelSchema>;
export type ChannelsConfig = { sourceRef: string; channels: ChannelConfig[] };

export async function readChannelsConfig(): Promise<Signal<ChannelsConfig>> {
  const sourceUrl = blobUrl(REPO, "main", PATH);
  const raw = await fetchRaw(REPO, "main", PATH, REVALIDATE);
  if (!raw.ok) return failSignal(SOURCE, sourceUrl, `infra-config: ${raw.reason}`);
  let data: unknown;
  try {
    data = parseToml(raw.text);
  } catch (error) {
    return failSignal(SOURCE, sourceUrl, `infra-config: channels.toml is not TOML (${String(error)})`);
  }
  const parsed = parseValue(FileSchema, data, "infra-config: channels.toml");
  if (!parsed.ok) return failSignal(SOURCE, sourceUrl, parsed.reason);
  return okSignal(SOURCE, sourceUrl, {
    sourceRef: parsed.value.source.ref,
    channels: parsed.value.channel,
  });
}

/** The UTC hour and minute a daily cron like "17 6 * * *" fires, or undefined for anything else. */
export function dailyCronTime(schedule: string | undefined): { hour: number; minute: number } | undefined {
  if (!schedule) return undefined;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return undefined;
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return undefined;
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return undefined;
  return { hour: h, minute: m };
}
