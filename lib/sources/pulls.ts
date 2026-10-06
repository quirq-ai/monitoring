import { z } from "zod";
import { OWNER, assertLogin } from "@/config/owner";
import { ORG, parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// Pull requests across the org, through the issue search API: one request returns the open
// PRs of every repo, so the Board and Today need no call per repo. The search index can lag a
// change by a minute or two, which the "as of" time shows.

const REVALIDATE = 120;
const REVALIDATE_REVIEWS = 600;
const PER_PAGE = 100;
/** How far back "merged recently" looks. Today filters it further. */
export const MERGED_DAYS = 7;

const UserSchema = z.object({ login: z.string().default("") }).loose();

const ItemSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.string(),
    draft: z.boolean().default(false),
    user: UserSchema.nullable().default(null),
    assignees: z.array(UserSchema).default([]),
    labels: z.array(z.object({ name: z.string().default("") }).loose()).default([]),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable().default(null),
    repository_url: z.string(),
    pull_request: z.object({ merged_at: z.string().nullable().default(null) }).loose().optional(),
  })
  .loose();

const SearchSchema = z
  .object({ total_count: z.number(), incomplete_results: z.boolean().default(false), items: z.array(ItemSchema) })
  .loose();

export type PullRequest = {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  assignees: string[];
  labels: string[];
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
};

export type PullSearch = { pulls: PullRequest[]; total: number; incomplete: boolean };

function toPull(item: z.infer<typeof ItemSchema>): PullRequest {
  return {
    repo: item.repository_url.split("/").pop() ?? "",
    number: item.number,
    title: item.title,
    url: item.html_url,
    author: item.user?.login ?? "",
    draft: item.draft,
    assignees: item.assignees.map((a) => a.login).filter(Boolean),
    labels: item.labels.map((l) => l.name).filter(Boolean),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    mergedAt: item.pull_request?.merged_at ?? null,
    closedAt: item.closed_at,
  };
}

async function searchPulls(id: string, query: string, sort: string): Promise<Signal<PullSearch>> {
  const source = `github/pulls/${id}`;
  const q = `org:${ORG} is:pr ${query}`;
  const sourceUrl = web.issueSearch(q);
  const api = await ghGet<unknown>("search/issues", {
    revalidate: REVALIDATE,
    params: { q, sort, order: "desc", per_page: PER_PAGE },
  });
  if (!api.ok) return failSignal(source, sourceUrl, api.reason);
  const parsed = parseValue(SearchSchema, api.data, `pull request search (${id})`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  const pulls = parsed.value.items.map(toPull);
  return okSignal(
    source,
    sourceUrl,
    { pulls, total: parsed.value.total_count, incomplete: parsed.value.incomplete_results },
    pulls[0]?.updatedAt,
  );
}

/** Every open PR in the org, newest activity first. */
export function readOpenPulls(): Promise<Signal<PullSearch>> {
  return searchPulls("open", "is:open", "updated");
}

/** PRs merged in the last `MERGED_DAYS` days, newest first. */
export function readMergedPulls(now = new Date()): Promise<Signal<PullSearch>> {
  const since = new Date(now.getTime() - MERGED_DAYS * 86_400_000).toISOString().slice(0, 10);
  return searchPulls("merged", `is:merged merged:>=${since}`, "updated");
}

/** Open PRs where the owner is a requested reviewer. */
export function readReviewRequested(owner = OWNER): Promise<Signal<PullSearch>> {
  assertLogin(owner);
  return searchPulls("review-requested", `is:open review-requested:${owner}`, "updated");
}

/** Open PRs the owner has reviewed, to check whether that review still covers the head. */
export function readReviewedByOwner(owner = OWNER): Promise<Signal<PullSearch>> {
  assertLogin(owner);
  return searchPulls("reviewed-by", `is:open reviewed-by:${owner}`, "updated");
}

// --- one PR's head and reviews -----------------------------------------------------------------

const PullDetailSchema = z
  .object({
    number: z.number(),
    head: z.object({ sha: z.string() }).loose(),
    mergeable_state: z.string().nullable().default(null),
  })
  .loose();

const ReviewSchema = z
  .object({
    state: z.string(),
    commit_id: z.string().nullable().default(null),
    submitted_at: z.string().nullable().default(null),
    user: UserSchema.nullable().default(null),
  })
  .loose();

export type ReviewStatus = {
  headSha: string;
  /** The owner's latest review state on any commit, e.g. APPROVED. */
  latestState: string | null;
  /** The commit that review was on. */
  reviewedSha: string | null;
  /** True when the latest approval is on an older commit than the head. */
  approvalStale: boolean;
};

export async function readReviewStatus(repo: string, number: number, owner = OWNER): Promise<Signal<ReviewStatus>> {
  assertLogin(owner);
  if (!Number.isInteger(number) || number < 1) throw new Error(`not a PR number: ${number}`);
  const source = `github/reviews/${repo}/${number}`;
  const sourceUrl = `${web.repo(repo)}/pull/${number}`;
  const [detail, reviews] = await Promise.all([
    ghGet<unknown>(repoPath(repo, `pulls/${number}`), { revalidate: REVALIDATE_REVIEWS }),
    ghGet<unknown>(repoPath(repo, `pulls/${number}/reviews`), { revalidate: REVALIDATE_REVIEWS, params: { per_page: 100 } }),
  ]);
  if (!detail.ok) return failSignal(source, sourceUrl, detail.reason);
  if (!reviews.ok) return failSignal(source, sourceUrl, reviews.reason);
  const parsedDetail = parseValue(PullDetailSchema, detail.data, `${repo}#${number}`);
  if (!parsedDetail.ok) return failSignal(source, sourceUrl, parsedDetail.reason);
  const parsedReviews = parseValue(z.array(ReviewSchema), reviews.data, `${repo}#${number} reviews`);
  if (!parsedReviews.ok) return failSignal(source, sourceUrl, parsedReviews.reason);
  const headSha = parsedDetail.value.head.sha;
  const own = parsedReviews.value
    .filter((r) => r.user?.login === owner && r.state !== "COMMENTED")
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const latest = own.at(-1);
  return okSignal(
    source,
    sourceUrl,
    {
      headSha,
      latestState: latest?.state ?? null,
      reviewedSha: latest?.commit_id ?? null,
      approvalStale: latest?.state === "APPROVED" && Boolean(latest.commit_id) && latest.commit_id !== headSha,
    },
    latest?.submitted_at ?? undefined,
  );
}
