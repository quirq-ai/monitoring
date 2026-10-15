import { parse } from "smol-toml";
import { z } from "zod";
import { blobUrl, fetchRaw, fetchRawAtCommit, isCommitId, parseValue } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// The revert caps the gardener runs with: infra-config `config/auto_revert.toml` at the commit
// the gardener pins in its `pins.toml`, never at infra-config main (the gardener reads the pin,
// so main may say something the gardener does not do yet). Two raw reads, no token.

const GARDENER = "gardener";
const INFRA_CONFIG = "infra-config";
const PATH = "config/auto_revert.toml";
const REVALIDATE_PINS = 300;
const REVALIDATE_FILE = 3600;

const PinsSchema = z.object({ "infra-config": z.object({ commit: z.string() }).loose() }).loose();

const LimitSchema = z
  .object({
    create_daily_limit: z.number().int().nonnegative(),
    submit_daily_limit: z.number().int().nonnegative(),
    max_culprit_age_hours: z.number().nonnegative(),
  })
  .loose();

const AutoRevertSchema = z
  .object({
    policy: z
      .object({
        daily_cap: z.number().int().nonnegative(),
        window_hours: z.number().positive(),
        require_culprit_verification: z.boolean(),
        auto_land_repos: z.array(z.string()),
      })
      .loose(),
    build_failure: LimitSchema,
    test_failure: LimitSchema,
  })
  .loose();

export type Limit = { create: number; submit: number; maxCulpritAgeHours: number };

export type RevertPolicy = {
  /** The infra-config commit the gardener pins. */
  pin: string;
  dailyCap: number;
  windowHours: number;
  verification: boolean;
  /** Repos whose reverts the gardener may land on its own; empty means every revert is proposed. */
  autoLandRepos: string[];
  build: Limit;
  test: Limit;
};

export async function readRevertPolicy(): Promise<Signal<RevertPolicy>> {
  const source = "gardener/revert-policy";
  const pinsUrl = blobUrl(GARDENER, "main", "pins.toml");
  const pins = await fetchRaw(GARDENER, "main", "pins.toml", REVALIDATE_PINS);
  if (!pins.ok) return failSignal(source, pinsUrl, `gardener: ${pins.reason}`, pins);
  const pinned = parseToml(PinsSchema, pins.text, "gardener: pins.toml");
  if (!pinned.ok) return failSignal(source, pinsUrl, pinned.reason, pins);
  const pin = pinned.value["infra-config"].commit;
  if (!isCommitId(pin)) return failSignal(source, pinsUrl, "gardener: pins.toml [infra-config] commit is not a full commit id", pins);

  const sourceUrl = blobUrl(INFRA_CONFIG, pin, PATH);
  const file = await fetchRawAtCommit(INFRA_CONFIG, pin, PATH, REVALIDATE_FILE);
  if (!file.ok) return failSignal(source, sourceUrl, `infra-config: ${file.reason}`, file);
  const parsed = parseToml(AutoRevertSchema, file.text, `infra-config@${pin.slice(0, 7)}: ${PATH}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, file);
  const { policy, build_failure, test_failure } = parsed.value;
  const limit = (l: z.infer<typeof LimitSchema>): Limit => ({
    create: l.create_daily_limit,
    submit: l.submit_daily_limit,
    maxCulpritAgeHours: l.max_culprit_age_hours,
  });
  // A file at a commit never changes, so the pin's read says how current this is.
  return okSignal(
    source,
    sourceUrl,
    {
      pin,
      dailyCap: policy.daily_cap,
      windowHours: policy.window_hours,
      verification: policy.require_culprit_verification,
      autoLandRepos: policy.auto_land_repos,
      build: limit(build_failure),
      test: limit(test_failure),
    },
    undefined,
    pins,
  );
}

function parseToml<T>(schema: z.ZodType<T>, text: string, what: string): { ok: true; value: T } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    return { ok: false, reason: `${what}: not TOML` };
  }
  return parseValue(schema, data, what);
}
