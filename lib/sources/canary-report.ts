import { blobUrl, fetchRaw, treeUrl } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";
import { recentDates } from "@/lib/sources/canary-runs";

// release release-state reports/<date>.md: the daily canary report, shown as text.

const REPO = "release";
const BRANCH = "release-state";
const REVALIDATE = 300;

export type CanaryReport = { date: string; markdown: string };

/** The newest report in the last `days` days. */
export async function readLatestCanaryReport(days = 3, now = new Date()): Promise<Signal<CanaryReport>> {
  const source = "release/report";
  const dates = recentDates(days, now).reverse();
  let lastReason = "no report in the last days";
  for (const date of dates) {
    const path = `reports/${date}.md`;
    const raw = await fetchRaw(REPO, BRANCH, path, REVALIDATE);
    if (raw.ok) return okSignal(source, blobUrl(REPO, BRANCH, path), { date, markdown: raw.text });
    if (raw.status !== 404) lastReason = raw.reason;
  }
  return failSignal(source, treeUrl(REPO, BRANCH, "reports"), `release-state: ${lastReason}`);
}
