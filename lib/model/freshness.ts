import type { Writer } from "@/config/freshness";
import type { Signal } from "@/lib/signal";
import type { WorkflowRun } from "@/lib/sources/writer-runs";
import { web } from "@/lib/github";
import { ago, minutesSince } from "@/lib/model/time";
import type { WriterHealth } from "@/lib/model/types";

/**
 * Is the writer alive? Judged on its newest completed run (cancelled and skipped already
 * dropped): success inside the window is fresh; any other conclusion inside the window is red
 * (the data may still be current); nothing inside the window is stale.
 */
export function judgeWriter(writer: Writer, runs: Signal<WorkflowRun[]>, now: Date): WriterHealth {
  const base = {
    id: writer.id,
    repo: writer.repo,
    workflow: writer.workflow,
    interval: writer.interval,
    writes: writer.writes,
    url: runs.sourceUrl || web.actions(writer.repo, writer.workflow),
  };
  if (!runs.ok) return { ...base, state: "unknown", reason: runs.reason };
  const newest = runs.value[0];
  if (!newest) return { ...base, state: "stale", reason: "no completed run found" };
  const lastRun = { at: newest.completedAt, conclusion: newest.conclusion, url: newest.url };
  const age = minutesSince(newest.completedAt, now);
  if (age === null || age > writer.windowMinutes) {
    return { ...base, state: "stale", reason: `last run ${ago(newest.completedAt, now) || "at an unknown time"}, window ${writer.windowMinutes} min`, lastRun };
  }
  if (newest.conclusion === "success") {
    return { ...base, state: "green", reason: `ran ${ago(newest.completedAt, now)}`, lastRun };
  }
  return {
    ...base,
    state: "red",
    reason: `${writer.workflow.replace(/\.ya?ml$/, "")} ${newest.conclusion} ${ago(newest.completedAt, now)}; the data may still be current`,
    lastRun,
  };
}
