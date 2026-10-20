import { z } from "zod";
import { parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal, type State, unreadAt } from "@/lib/signal";
import { isOwnCheck } from "@/config/checks";

// The check runs on a branch's head commit, rolled up into one state. Branch names come from
// the registry, never from a visitor.

const REVALIDATE = 600;
const PER_PAGE = 50;
// A head with more runs than one page is read further, up to this many pages: test-pipelines'
// compatibility check adds one run per org repo to its head (config/checks.ts).
const MAX_PAGES = 4;

const CheckSchema = z
  .object({
    id: z.number().optional(),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    html_url: z.string().nullable().default(null),
    head_sha: z.string().default(""),
    completed_at: z.string().nullable().default(null),
    app: z.object({ slug: z.string().default("") }).loose().nullable().optional(),
  })
  .loose();

const ResponseSchema = z.object({ total_count: z.number(), check_runs: z.array(CheckSchema) }).loose();

export type CheckRun = { name: string; status: string; conclusion: string; url: string; completedAt: string | null };

export type BranchChecks = {
  headSha: string;
  state: State;
  summary: string;
  checks: CheckRun[];
};

export async function readBranchChecks(repo: string, branch: string): Promise<Signal<BranchChecks>> {
  const source = `github/checks/${repo}`;
  // Git allows almost any branch name; the dashboard only builds URLs from plain ones, and says
  // so for the rest instead of throwing out of the page (one failing source never breaks a page).
  if (!/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch)) return failSignal(source, web.repo(repo), `not a usable branch name: ${JSON.stringify(branch).slice(0, 60)}`, unreadAt(REVALIDATE));
  const sourceUrl = web.commits(repo, branch);
  const path = repoPath(repo, `commits/${encodeURIComponent(branch)}/check-runs`);
  const first = await ghGet<unknown>(path, { revalidate: REVALIDATE, params: { per_page: PER_PAGE } });
  if (!first.ok) {
    const why = first.status === 404 ? `no branch ${branch}` : first.reason;
    return failSignal(source, sourceUrl, why, first);
  }
  const parsed = parseValue(ResponseSchema, first.data, `${repo} check runs`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, first);
  const total = parsed.value.total_count;
  const runs = [...parsed.value.check_runs];
  // A later page that fails or does not parse leaves the runs it held unread, which the rollup
  // below reports as it does a head with more runs than it reads.
  // Each page is its own request, cached on its own, and the path names the branch, not the
  // commit: two pages can come from different moments, or from two head commits once the branch
  // moves. Pages that disagree (another total, another head commit, or a run read twice) mean the
  // listing changed while it was read, so their sum can miss a failure: never green.
  let changed = false;
  for (let page = 2; page <= MAX_PAGES && runs.length < total; page++) {
    const next = await ghGet<unknown>(path, { revalidate: REVALIDATE, params: { per_page: PER_PAGE, page } });
    if (!next.ok) break;
    const more = parseValue(ResponseSchema, next.data, `${repo} check runs`);
    if (!more.ok || more.value.check_runs.length === 0) break;
    if (more.value.total_count !== total) changed = true;
    runs.push(...more.value.check_runs);
  }
  const ids = runs.flatMap((c) => (typeof c.id === "number" ? [c.id] : []));
  if (new Set(runs.map((c) => c.head_sha)).size > 1 || new Set(ids).size < ids.length) changed = true;
  const headSha = runs[0]?.head_sha ?? "";
  const own = runs.filter((c) => isOwnCheck(repo, c.name, c.app?.slug ?? ""));
  const unread = Math.max(0, total - runs.length);
  const checks: CheckRun[] = own.map((c) => ({
    name: c.name,
    status: c.status,
    conclusion: c.conclusion ?? "",
    url: c.html_url ?? sourceUrl,
    completedAt: c.completed_at,
  }));
  // A failure among the runs read is red whatever was not read; anything else is unknown.
  const full = rollup(checks);
  const counted = checks.length + unread;
  const verdict =
    changed && full.state !== "red"
      ? { state: "unknown" as const, summary: `check runs on the head commit changed between pages; ${runs.length} read` }
      : changed
        ? { ...full, summary: `${full.summary} (read while the runs changed)` }
        : unread > 0 && full.state !== "red"
          ? { state: "unknown" as const, summary: `${total} check runs on the head commit; only ${runs.length} read` }
          : unread > 0
            ? { ...full, summary: `${full.summary} (${checks.length} of ${counted} read)` }
            : full;
  return okSignal(source, sourceUrl, { headSha, ...verdict, checks }, newest(checks), first);
}

function newest(checks: CheckRun[]): string | undefined {
  return checks.map((c) => c.completedAt ?? "").filter(Boolean).sort().at(-1);
}

export function rollup(checks: CheckRun[]): { state: State; summary: string } {
  if (checks.length === 0) return { state: "unknown", summary: "no check runs on the head commit" };
  const failed = checks.filter((c) => ["failure", "timed_out", "cancelled", "action_required", "startup_failure"].includes(c.conclusion));
  if (failed.length) return { state: "red", summary: `${failed.length} of ${checks.length} failed: ${failed.map((c) => c.name).join(", ")}` };
  const running = checks.filter((c) => c.status !== "completed");
  if (running.length) return { state: "pending", summary: `${running.length} of ${checks.length} still running` };
  const stale = checks.filter((c) => c.conclusion === "stale");
  if (stale.length) return { state: "unknown", summary: `${stale.length} of ${checks.length} marked stale by GitHub` };
  const passed = checks.filter((c) => c.conclusion === "success");
  const rest = checks.filter((c) => c.conclusion !== "success");
  if (passed.length === 0) return { state: "unknown", summary: `no check passed: ${checks.map((c) => `${c.name} ${c.conclusion}`).join(", ")}` };
  const skipped = rest.length ? `, ${rest.length} ${[...new Set(rest.map((c) => c.conclusion))].join("/")}` : "";
  return { state: "green", summary: `${passed.length} check${passed.length === 1 ? "" : "s"} passed${skipped}` };
}
