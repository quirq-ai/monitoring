import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { CountTiles } from "@/components/count-tiles";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { buildSnapshot } from "@/lib/model/build";
import { ago, parseWindow } from "@/lib/model/time";
import type { TodayItem } from "@/lib/model/types";
import { cn } from "@/lib/utils";

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const window = parseWindow(typeof params.since === "string" ? params.since : undefined);
  const snapshot = await buildSnapshot({ window });
  const now = new Date(snapshot.generatedAt);
  const words = window === "24h" ? "24 hours" : "7 days";
  // What needs a look comes first on a phone; the rest is the timeline, newest first. An alarm a
  // newer event on the same subject has replaced (the tree closed, then opened) is history.
  const alarms = snapshot.today.filter((t) => (t.state === "red" || t.state === "held") && !t.superseded);
  const rest = snapshot.today.filter((t) => !alarms.includes(t));
  const read = snapshot.reads.today;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Today" lead="What needs you, then what changed, newest first.">
        <nav aria-label="Window" className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-sm">
          {(["24h", "7d"] as const).map((w) => (
            <Link
              key={w}
              href={w === "24h" ? "/" : "/?since=7d"}
              aria-current={w === window ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-3 transition-colors md:min-h-8",
                w === window ? "border border-border bg-card font-medium text-card-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              last {w === "24h" ? "24 hours" : "7 days"}
            </Link>
          ))}
        </nav>
      </PageTitle>

      <ApiBanner api={snapshot.health.api} />

      <CountTiles counts={snapshot.counts} reads={snapshot.reads} now={now} />

      {read.stale && read.asOf ? (
        <p className="text-sm text-muted-foreground">
          <StateBadge state="stale" /> The oldest read behind this page is from {ago(read.asOf, now)} and has not refreshed yet; the next view will.
        </p>
      ) : null}

      {alarms.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg">Needs a look</h2>
          <ItemList items={alarms} now={now} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{alarms.length ? "Everything else" : "What changed"}</h2>
        {!snapshot.counts.todayComplete ? (
          <p className="text-sm text-muted-foreground">Some sources could not be read, so this list may be short; Health says which.</p>
        ) : null}
        {rest.length === 0 ? (
          <Card className="rounded-xl p-4 text-sm text-muted-foreground shadow-none">
            {snapshot.counts.todayComplete ? `Nothing changed in the last ${words}.` : `Nothing could be read for the last ${words} from the sources that answered.`}
          </Card>
        ) : (
          <ItemList items={rest} now={now} />
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {read.asOf ? (
          <>
            Data as of <TimeAgo iso={read.asOf} now={new Date()} exact /> (the oldest source read for this page; raw files can be up to 5 minutes behind that, the search index a minute or two).
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

function ItemList({ items, now }: { items: TodayItem[]; now: Date }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
      <ol className="divide-y divide-line">
        {items.map((item, i) => (
          <li key={`${item.kind}-${item.at}-${i}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-start sm:gap-4">
            <span className="flex shrink-0 items-center gap-2 sm:w-44">
              <StateBadge state={item.state} />
              <Link href={`/repos/${item.repo}`} className="text-sm font-medium wrap-anywhere underline-offset-2 hover:underline">
                {item.repo}
              </Link>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <a href={item.url} className="text-sm wrap-anywhere underline-offset-2 hover:underline" rel={item.url.startsWith("/") ? undefined : "noreferrer"}>
                {item.title}
                {item.demo ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">planted demo, not counted</span> : null}
                {item.cleared && (item.state === "red" || item.state === "held") ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">since cleared</span> : null}
              </a>
              <TimeAgo iso={item.at} now={now} className="text-xs text-muted-foreground" />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
