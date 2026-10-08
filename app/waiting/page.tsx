import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { buildSnapshot } from "@/lib/model/build";
import { ago } from "@/lib/model/time";

const kindWords: Record<string, string> = {
  review: "review requested",
  assigned: "assigned to you",
  "stale-approval": "approval on an older head",
  held: "canary held",
  failure: "open failure",
};

export default async function WaitingPage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const down = snapshot.sources.filter((s) => !s.ok && /^github\/(pulls|issues|reviews)/.test(s.source));
  const read = snapshot.reads.waiting;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Waiting on you" lead={`PRs that need ${snapshot.owner}, held canaries and open failures.`} />
      <ApiBanner api={snapshot.health.api} />
      {down.length && snapshot.health.api.state === "ok" ? (
        <p className="text-sm text-muted-foreground">
          {down.length} of the PR and issue sources could not be read, so this list may be short: {down[0].reason}.
        </p>
      ) : null}
      {read.stale && read.asOf ? (
        <p className="text-sm text-muted-foreground">
          <StateBadge state="stale" /> The oldest read behind this list is from {ago(read.asOf, now)} and has not refreshed yet; the next view will.
        </p>
      ) : null}
      {snapshot.waiting.length === 0 ? (
        <Card className="rounded-xl p-4 text-sm text-muted-foreground shadow-none">
          {snapshot.counts.waitingComplete ? "Nothing is waiting on you." : read.asOf ? "Nothing is waiting on you in the sources that could be read." : "No data could be read for this page."}
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
          <ol className="divide-y divide-line">
            {snapshot.waiting.map((item, i) => (
              <li key={`${item.kind}-${item.url}-${i}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
                <span className="flex flex-wrap items-center gap-2">
                  <StateBadge state={item.state} />
                  <span className="text-xs text-muted-foreground">{kindWords[item.kind]}</span>
                  <Link href={`/repos/${item.repo}`} className="text-sm font-medium wrap-anywhere underline-offset-2 hover:underline">
                    {item.repo}
                  </Link>
                </span>
                <a href={item.url} className="text-base wrap-anywhere underline-offset-2 hover:underline" rel="noreferrer">
                  {item.title}
                </a>
                <span className="text-sm text-muted-foreground">
                  {item.detail}
                  {" · "}
                  {item.kind === "held" || item.kind === "failure" ? "since " : "last activity "}
                  <TimeAgo iso={item.since} now={now} />
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
