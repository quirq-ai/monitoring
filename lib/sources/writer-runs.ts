import { z } from "zod";
import { parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";
import type { Writer } from "@/config/freshness";

// The last completed runs of a writer workflow, whatever triggered them. Cancelled and skipped
// runs are routine (every writer queues in a concurrency group), so they are dropped here; the
// model judges the newest run that remains.

const REVALIDATE = 300;

const RunSchema = z
  .object({
    id: z.number(),
    name: z.string().nullable().default(null),
    event: z.string(),
    status: z.string().nullable(),
    conclusion: z.string().nullable(),
    head_branch: z.string().nullable().default(null),
    head_sha: z.string().default(""),
    html_url: z.string(),
    run_started_at: z.string().optional(),
    updated_at: z.string(),
    created_at: z.string(),
  })
  .loose();

const ResponseSchema = z.object({ total_count: z.number(), workflow_runs: z.array(RunSchema) }).loose();

export type WorkflowRun = {
  id: number;
  event: string;
  conclusion: string;
  branch: string;
  sha: string;
  url: string;
  completedAt: string;
};

export async function readWriterRuns(writer: Writer): Promise<Signal<WorkflowRun[]>> {
  if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(writer.workflow)) throw new Error(`not a workflow file: ${writer.workflow}`);
  const source = `writer/${writer.id}`;
  if (!/^[A-Za-z0-9_.\/-]{1,200}$/.test(writer.branch)) throw new Error(`not a branch name: ${writer.branch}`);
  const sourceUrl = web.actions(writer.repo, writer.workflow);
  const api = await ghGet<unknown>(repoPath(writer.repo, `actions/workflows/${writer.workflow}/runs`), {
    revalidate: REVALIDATE,
    params: { status: "completed", branch: writer.branch, per_page: 10 },
  });
  if (!api.ok) {
    const why = api.status === 404 ? `${writer.workflow} not found in ${writer.repo}` : api.reason;
    return failSignal(source, sourceUrl, why);
  }
  const parsed = parseValue(ResponseSchema, api.data, `${writer.repo} ${writer.workflow} runs`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  const runs = parsed.value.workflow_runs
    .filter((r) => r.conclusion !== "cancelled" && r.conclusion !== "skipped" && (r.head_branch ?? writer.branch) === writer.branch)
    .map((r) => ({
      id: r.id,
      event: r.event,
      conclusion: r.conclusion ?? "unknown",
      branch: r.head_branch ?? "",
      sha: r.head_sha,
      url: r.html_url,
      completedAt: r.updated_at,
    }))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return okSignal(source, sourceUrl, runs, runs[0]?.completedAt);
}
