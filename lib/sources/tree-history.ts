import { z } from "zod";
import { parseValue } from "@/lib/fetch";
import { ghGet, repoPath, web } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// gardener commits the tree-status branch only when a status file changes (a state, a head, a
// coverage hole), with a message like `tree-status: innernet open, xo-space closed`, so most
// commits change no state. The last 100 commits (one request, about a month at today's rate) are
// read, and an open/close event is a commit whose message names a state that differs from the
// commit before it. Any other message (a planned `groups: 2 red ranges`) names no state and is
// never an event.

const REPO = "gardener";
const BRANCH = "tree-status";
const REVALIDATE = 300;
/** GitHub's largest page: one request either way. */
export const HISTORY_COMMITS = 100;

const CommitSchema = z
  .object({
    sha: z.string(),
    html_url: z.string(),
    commit: z.object({
      message: z.string(),
      committer: z.object({ date: z.string().default("") }).loose().nullable().default(null),
      author: z.object({ date: z.string().default("") }).loose().nullable().default(null),
    }).loose(),
  })
  .loose();

export type TreeChange = {
  sha: string;
  url: string;
  at: string;
  /** Repo to state as the message says it, e.g. { innernet: "open" }. */
  states: Record<string, string>;
  /** Repos whose state differs from the previous commit, oldest first. Empty for the first commit. */
  changed: string[];
};

export async function readTreeHistory(): Promise<Signal<TreeChange[]>> {
  const source = "gardener/tree-history";
  const sourceUrl = web.commits(REPO, BRANCH);
  const api = await ghGet<unknown>(repoPath(REPO, "commits"), {
    revalidate: REVALIDATE,
    params: { sha: BRANCH, per_page: HISTORY_COMMITS },
  });
  if (!api.ok) {
    const why = api.status === 404 ? "tree-status branch not found" : api.reason;
    return failSignal(source, sourceUrl, `gardener: ${why}`, api);
  }
  const parsed = parseValue(z.array(CommitSchema), api.data, "gardener: tree-status commits");
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, api);
  const oldestFirst = [...parsed.value].reverse();
  const changes: TreeChange[] = [];
  let previous: Record<string, string> = {};
  for (const c of oldestFirst) {
    const states = parseMessage(c.commit.message);
    const changed = Object.keys(states).filter((repo) => repo in previous && previous[repo] !== states[repo]);
    changes.push({
      sha: c.sha,
      url: c.html_url,
      at: c.commit.committer?.date || c.commit.author?.date || "",
      states,
      changed,
    });
    previous = { ...previous, ...states };
  }
  changes.reverse();
  return okSignal(source, sourceUrl, changes, changes[0]?.at || undefined, api);
}

/** `tree-status: innernet open, xo-space closed` to `{ innernet: "open", xo-space: "closed" }`. */
export function parseMessage(message: string): Record<string, string> {
  const firstLine = message.split("\n")[0] ?? "";
  const body = firstLine.replace(/^tree-status:\s*/, "");
  const states: Record<string, string> = {};
  for (const part of body.split(",")) {
    const match = part.trim().match(/^([A-Za-z0-9_.-]+)\s+(open|closed|unknown)$/);
    if (match) states[match[1]] = match[2];
  }
  return states;
}
