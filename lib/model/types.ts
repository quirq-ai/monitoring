import { z } from "zod";
import { states } from "@/lib/signal";

// The model the pages render and GET /api/snapshot returns. The schema is the contract: the
// route validates the snapshot before sending it, so a shape drift fails loudly in a test.

export const SNAPSHOT_SCHEMA = "qq-monitoring-snapshot/1";

const StateSchema = z.enum(states);

/**
 * One thing on screen: a state word, the detail, where it came from and where to go. `none` is a
 * known fact with no health in it ("nothing merged in 7 days", "no deployments"): the pages show
 * it as plain text with no badge, and it is never counted as unknown.
 */
export const CellStateSchema = z.enum([...states, "none"]);

export const CellSchema = z.object({
  state: CellStateSchema,
  text: z.string(),
  url: z.string(),
  at: z.string().optional(),
  source: z.string(),
});

export const SourceStatusSchema = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
  maxAge: z.number().optional(),
  observedAt: z.string().optional(),
  ok: z.boolean(),
  reason: z.string().optional(),
});

export const TodayItemSchema = z.object({
  kind: z.enum(["merged", "lkgr", "channel", "canary", "tree", "failure", "issue", "deploy"]),
  repo: z.string(),
  title: z.string(),
  at: z.string(),
  url: z.string(),
  state: StateSchema,
  demo: z.boolean().optional(),
});

export const WaitingItemSchema = z.object({
  kind: z.enum(["review", "assigned", "stale-approval", "held", "failure"]),
  repo: z.string(),
  title: z.string(),
  detail: z.string(),
  since: z.string(),
  url: z.string(),
  state: StateSchema,
});

export const BoardRowSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string(),
  group: z.string(),
  product: z.boolean(),
  defaultBranch: z.string(),
  registered: z.boolean(),
  ci: CellSchema,
  openPulls: z.number(),
  /** True when the open-PR search was cut at its page size, so the count is a floor. */
  openPullsLowerBound: z.boolean(),
  lastMerge: CellSchema,
  tree: CellSchema.optional(),
  lkgr: CellSchema.optional(),
  canary: CellSchema.optional(),
  deploy: CellSchema.optional(),
  /** The worst state among the row's health cells, for ordering: red and held first, green last. */
  worst: StateSchema,
});

export const BoardGroupSchema = z.object({ id: z.string(), title: z.string(), repos: z.array(BoardRowSchema) });

export const CanaryDaySchema = z.object({
  date: z.string(),
  outcome: z.enum(["shipped", "held", "noop", "error", "none", "unknown"]),
  reason: z.string(),
  url: z.string(),
});

export const ReleaseRepoSchema = z.object({
  repo: z.string(),
  lkgr: CellSchema,
  channels: z.record(z.string(), CellSchema),
  days: z.array(CanaryDaySchema),
  latest: CanaryDaySchema.optional(),
  hold: z
    .object({ commit: z.string(), stage: z.string(), date: z.string(), runUrl: z.string(), url: z.string() })
    .optional(),
});

export const WriterHealthSchema = z.object({
  id: z.string(),
  repo: z.string(),
  workflow: z.string(),
  interval: z.string(),
  writes: z.string(),
  state: StateSchema,
  reason: z.string(),
  lastRun: z.object({ at: z.string(), conclusion: z.string(), url: z.string() }).optional(),
  url: z.string(),
});

export const ScorecardViewSchema = z.object({
  generatedAt: z.string(),
  repos: z.array(
    z.object({
      repo: z.string(),
      metrics: z.array(z.object({ name: z.string(), value: z.number().nullable(), unit: z.string(), target: z.string(), detail: z.string() })),
    }),
  ),
  notMeasured: z.array(z.object({ name: z.string(), waitingOn: z.string(), detail: z.string() })),
  url: z.string(),
});

export const SnapshotSchema = z.object({
  schema: z.literal(SNAPSHOT_SCHEMA),
  generatedAt: z.string(),
  org: z.string(),
  owner: z.string(),
  window: z.enum(["24h", "7d"]),
  counts: z.object({
    waiting: z.number(),
    waitingComplete: z.boolean(),
    redOrHeld: z.number(),
    redOrHeldComplete: z.boolean(),
    unknownOrStale: z.number(),
    /** False when a source feeding the Today list could not be read, so the list may be short. */
    todayComplete: z.boolean(),
  }),
  /** The oldest read among the sources that answered: the data on screen is at least this old. */
  dataAsOf: z.string(),
  today: z.array(TodayItemSchema),
  waiting: z.array(WaitingItemSchema),
  board: z.array(BoardGroupSchema),
  unregistered: z.array(z.string()),
  release: z.object({
    channels: z.array(z.object({ name: z.string(), cadence: z.string(), audience: z.array(z.string()) })),
    repos: z.array(ReleaseRepoSchema),
    /** Why there are no repos, when the product registry could not be read. */
    reposReason: z.string().optional(),
    report: z.object({ date: z.string(), markdown: z.string(), url: z.string() }).optional(),
    reportReason: z.string().optional(),
  }),
  health: z.object({
    writers: z.array(WriterHealthSchema),
    scorecard: ScorecardViewSchema.optional(),
    scorecardReason: z.string().optional(),
    ledger: CellSchema,
    tokenPresent: z.boolean(),
    apiRequestsThisHour: z.number(),
    /** The GitHub API as a whole: one line the pages show as a banner when it is not `ok`. */
    api: z.object({
      state: z.enum(["ok", "no-token", "rate-limited", "token-rejected", "down"]),
      text: z.string(),
      until: z.string().optional(),
    }),
  }),
  sources: z.array(SourceStatusSchema),
});

export type Cell = z.infer<typeof CellSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type TodayItem = z.infer<typeof TodayItemSchema>;
export type WaitingItem = z.infer<typeof WaitingItemSchema>;
export type BoardRow = z.infer<typeof BoardRowSchema>;
export type BoardGroup = z.infer<typeof BoardGroupSchema>;
export type CanaryDay = z.infer<typeof CanaryDaySchema>;
export type ReleaseRepo = z.infer<typeof ReleaseRepoSchema>;
export type WriterHealth = z.infer<typeof WriterHealthSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
