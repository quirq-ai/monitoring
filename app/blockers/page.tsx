import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { CountTiles } from "@/components/count-tiles";
import { newTab } from "@/components/new-tab";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { buildSnapshot } from "@/lib/model/build";
import { brokenNow } from "@/lib/model/calendar";
import { ago } from "@/lib/model/time";
import type { TodayItem } from "@/lib/model/types";

const kindWords: Record<string, string> = {
  review: "review requested",
  assigned: "assigned to you",
  "stale-approval": "approval on an older head",
  held: "canary held",
  failure: "open failure",
};

const alarmWords: Record<TodayItem["kind"], string> = {
  merged: "merge",
  lkgr: "lkgr",
  channel: "channel",
  canary: "canary",
  tree: "tree",
  failure: "failure record",
  issue: "issue",
  deploy: "deploy",
  writer: "writer",
};

export default async function BlockersPage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const down = snapshot.sources.filter((s) => !s.ok && /^github\/(pulls|issues|reviews)/.test(s.source));
  const read = snapshot.reads.waiting;
  const broken = brokenNow(snapshot.today, snapshot.waiting);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Blockers" lead={`What is waiting on ${snapshot.owner}, what is red or held, and what could not be read.`} />
      <ApiBanner api={snapshot.health.api} />
      <CountTiles counts={snapshot.counts} reads={snapshot.reads} now={now} />
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

      <section id="waiting" aria-labelledby="waiting-title" className="flex scroll-mt-28 flex-col gap-2 min-[900px]:scroll-mt-16">
        <h2 id="waiting-title" className="flex items-baseline gap-2 text-lg">
          Waiting on you <span className="text-sm font-normal tabular-nums text-muted-foreground">{snapshot.waiting.length}</span>
        </h2>
        {snapshot.waiting.length === 0 ? (
          <Card className="rounded-xl p-4 text-sm text-muted-foreground shadow-none">
            {snapshot.counts.waitingComplete ? "Nothing is waiting on you." : read.asOf ? "Nothing is waiting on you in the sources that could be read." : "No data could be read for this list."}
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
                  <a href={item.url} className="text-base wrap-anywhere underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
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
      </section>

      <section id="broken" aria-labelledby="broken-title" className="flex scroll-mt-28 flex-col gap-2 min-[900px]:scroll-mt-16">
        <div className="flex flex-col gap-0.5">
          <h2 id="broken-title" className="flex items-baseline gap-2 text-lg">
            Broken right now <span className="text-sm font-normal tabular-nums text-muted-foreground">{broken.length}</span>
          </h2>
          <p className="text-sm text-muted-foreground">Red or held in the last 24 hours and not cleared since; anything already waiting on you is not repeated.</p>
        </div>
        {broken.length === 0 ? (
          <Card className="rounded-xl p-4 text-sm text-muted-foreground shadow-none">
            {snapshot.counts.todayComplete ? "Nothing else is red or held." : "Nothing else is red or held in the sources that could be read; Health says which could not."}
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
            <ol className="divide-y divide-line">
              {broken.map((item, i) => (
                <li key={`${item.kind}-${item.at}-${i}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="flex flex-wrap items-center gap-2">
                    <StateBadge state={item.state} />
                    <span className="text-xs text-muted-foreground">{alarmWords[item.kind]}</span>
                    <Link href={`/repos/${item.repo}`} className="text-sm font-medium wrap-anywhere underline-offset-2 hover:underline">
                      {item.repo}
                    </Link>
                  </span>
                  <a href={item.url} className="text-base wrap-anywhere underline-offset-2 hover:underline" {...(item.url.startsWith("/") ? {} : newTab)}>
                    {item.title}
                  </a>
                  <TimeAgo iso={item.at} now={now} className="text-sm text-muted-foreground" />
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {read.asOf ? (
          <>
            Data as of <TimeAgo iso={read.asOf} now={new Date()} exact /> (the oldest source read for this list).
          </>
        ) : (
          "No data could be read for this page."
        )}{" "}
        <Link href="/health" className="underline-offset-2 hover:underline">
          Every source and its state
        </Link>
        .
      </p>
    </div>
  );
}
