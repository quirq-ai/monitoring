import { z } from "zod";
import { parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal, type State } from "@/lib/signal";

// The check runs on a branch's head commit, rolled up into one state. Branch names come from
// the registry, never from a visitor.

const REVALIDATE = 600;
const PER_PAGE = 50;

const CheckSchema = z
  .object({
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
  if (!/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch)) throw new Error(`not a branch name: ${branch}`);
  const source = `github/checks/${repo}`;
  const sourceUrl = web.commits(repo, branch);
  const api = await ghGet<unknown>(repoPath(repo, `commits/${encodeURIComponent(branch)}/check-runs`), {
    revalidate: REVALIDATE,
    params: { per_page: PER_PAGE },
  });
  if (!api.ok) {
    const why = api.status === 404 ? `no branch ${branch}` : api.reason;
    return failSignal(source, sourceUrl, why, api);
  }
  const parsed = parseValue(ResponseSchema, api.data, `${repo} check runs`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, api);
  const checks: CheckRun[] = parsed.value.check_runs.map((c) => ({
    name: c.name,
    status: c.status,
    conclusion: c.conclusion ?? "",
    url: c.html_url ?? sourceUrl,
    completedAt: c.completed_at,
  }));
  const headSha = parsed.value.check_runs[0]?.head_sha ?? "";
  const verdict =
    parsed.value.total_count > checks.length
      ? { state: "unknown" as const, summary: `more than ${PER_PAGE} check runs on the head commit (${parsed.value.total_count}); only ${checks.length} read` }
      : rollup(checks);
  return okSignal(source, sourceUrl, { headSha, ...verdict, checks }, newest(checks), api);
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
