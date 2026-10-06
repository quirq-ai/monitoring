import { z } from "zod";
import { parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal, type State } from "@/lib/signal";

// The latest production deployment of a repo and its state. Vercel's GitHub app records one per
// push, so this is where "did my merge ship?" is answered.

const REVALIDATE = 300;

const DeploymentSchema = z
  .object({
    id: z.number(),
    sha: z.string(),
    ref: z.string().default(""),
    environment: z.string().default(""),
    created_at: z.string(),
    updated_at: z.string(),
    creator: z.object({ login: z.string().default("") }).loose().nullable().optional(),
  })
  .loose();

const StatusSchema = z
  .object({
    state: z.string(),
    created_at: z.string(),
    environment_url: z.string().nullable().default(null),
    target_url: z.string().nullable().default(null),
    log_url: z.string().nullable().default(null),
  })
  .loose();

export type Deployment = {
  id: number;
  sha: string;
  environment: string;
  createdAt: string;
  by: string;
  state: State;
  status: string;
  url: string;
};

export async function readLatestDeployment(repo: string): Promise<Signal<Deployment | null>> {
  const source = `github/deployments/${repo}`;
  const sourceUrl = web.deployments(repo);
  const api = await ghGet<unknown>(repoPath(repo, "deployments"), {
    revalidate: REVALIDATE,
    params: { per_page: 10, environment: "Production" },
  });
  if (!api.ok) return failSignal(source, sourceUrl, api.reason, api);
  const parsed = parseValue(z.array(DeploymentSchema), api.data, `${repo} deployments`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, api);
  // Vercel names its environment "Production"; a preview deploy never answers "did my merge ship?".
  const production = parsed.value.find((d) => /^production$/i.test(d.environment));
  if (!production) return okSignal(source, sourceUrl, null, undefined, api);
  const statuses = await ghGet<unknown>(repoPath(repo, `deployments/${production.id}/statuses`), {
    revalidate: REVALIDATE,
    params: { per_page: 1 },
  });
  if (!statuses.ok) return failSignal(source, sourceUrl, statuses.reason, statuses);
  const parsedStatus = parseValue(z.array(StatusSchema), statuses.data, `${repo} deployment statuses`);
  if (!parsedStatus.ok) return failSignal(source, sourceUrl, parsedStatus.reason, statuses);
  const latest = parsedStatus.value[0];
  const status = latest?.state ?? "no status";
  return okSignal(
    source,
    sourceUrl,
    {
      id: production.id,
      sha: production.sha,
      environment: production.environment,
      createdAt: production.created_at,
      by: production.creator?.login ?? "",
      state: deployState(status),
      status,
      url: latest?.environment_url || latest?.target_url || latest?.log_url || sourceUrl,
    },
    latest?.created_at ?? production.updated_at,
    statuses,
  );
}

export function deployState(status: string): State {
  switch (status) {
    case "success":
      return "green";
    case "failure":
    case "error":
      return "red";
    case "pending":
    case "queued":
    case "in_progress":
      return "pending";
    case "inactive":
      return "unknown";
    default:
      return "unknown";
  }
}
