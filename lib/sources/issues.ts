import { z } from "zod";
import { ORG, parseValue } from "@/lib/fetch";
import { ghGet, web } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// Issues the pipelines file: `qq-failure` (in more than one repo, so the search is org-wide)
// and release's daily `canary-report`. Search can lag a new issue by a few minutes.

const REVALIDATE = 300;
const LABELS = ["qq-failure", "canary-report"] as const;
export type IssueLabel = (typeof LABELS)[number];

const ItemSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.string(),
    labels: z.array(z.object({ name: z.string().default("") }).loose()).default([]),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable().default(null),
    repository_url: z.string(),
    pull_request: z.unknown().optional(),
  })
  .loose();

const SearchSchema = z.object({ total_count: z.number(), items: z.array(ItemSchema) }).loose();

export type Issue = {
  repo: string;
  number: number;
  title: string;
  url: string;
  open: boolean;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export async function readIssues(label: IssueLabel, state: "open" | "all" = "open"): Promise<Signal<Issue[]>> {
  if (!LABELS.includes(label)) throw new Error(`not a tracked label: ${label}`);
  const source = `github/issues/${label}`;
  const q = `org:${ORG} is:issue label:${label}${state === "open" ? " is:open" : ""}`;
  const sourceUrl = web.issueSearch(q);
  const api = await ghGet<unknown>("search/issues", {
    revalidate: REVALIDATE,
    params: { q, sort: "created", order: "desc", per_page: 50 },
  });
  if (!api.ok) return failSignal(source, sourceUrl, api.reason);
  const parsed = parseValue(SearchSchema, api.data, `issue search (${label})`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason);
  const issues: Issue[] = parsed.value.items
    .filter((i) => !i.pull_request)
    .map((i) => ({
      repo: i.repository_url.split("/").pop() ?? "",
      number: i.number,
      title: i.title,
      url: i.html_url,
      open: i.state === "open",
      labels: i.labels.map((l) => l.name).filter(Boolean),
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
    }));
  return okSignal(source, sourceUrl, issues, issues[0]?.updatedAt);
}
