import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { ChangeMatrix, QuietRepos } from "@/components/change-matrix";
import { DayStrip, dayDate, dayLabel } from "@/components/day-strip";
import { newTab } from "@/components/new-tab";
import { PageTitle } from "@/components/page-title";
import { StateBadge, StateDot, type State } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { buildSnapshot } from "@/lib/model/build";
import { CALENDAR_DAYS, calendarDates, dayCounts, itemDate, pickDay } from "@/lib/model/calendar";
import { matrixRows } from "@/lib/model/matrix";
import { ago, exactUtc } from "@/lib/model/time";
import type { Snapshot, TodayItem } from "@/lib/model/types";
import { cn } from "@/lib/utils";

export default async function CalendarPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const snapshot = await buildSnapshot({ window: "7d" });
  const now = new Date(snapshot.generatedAt);
  const dates = calendarDates(now);
  // Both parameters are checked against fixed choices and never reach a fetch (rule 7).
  const day = pickDay(params.day, dates);
  const byRepo = params.view === "repo";
  const today = day === dates[0];
  const href = (date: string, repo = byRepo) => {
    const query = [date === dates[0] ? "" : `day=${date}`, repo ? "view=repo" : ""].filter(Boolean).join("&");
    return query ? `/?${query}` : "/";
  };

  const byDay = new Map<string, TodayItem[]>();
  for (const item of snapshot.today) {
    const date = itemDate(item);
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
  }
  const items = byDay.get(day) ?? [];
  const counts = dayCounts(items);
  const tracked = snapshot.board.flatMap((g) => g.repos.map((r) => r.name));
  const { changed, quiet } = matrixRows(items, tracked);
  const read = snapshot.reads.today;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Calendar" lead="What changed across the org, one day at a time.">
        <BlockersLink counts={snapshot.counts} />
      </PageTitle>

      <ApiBanner api={snapshot.health.api} />

      {read.stale && read.asOf ? (
        <p className="text-sm text-muted-foreground">
          <StateBadge state="stale" /> The oldest read behind this page is from {ago(read.asOf, now)} and has not refreshed yet; the next view will.
        </p>
      ) : null}

      <section aria-labelledby="week-title" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week-title" className="text-sm font-medium tracking-normal">
            Last {CALENDAR_DAYS} days
          </h2>
          <span className="text-xs text-muted-foreground sm:text-sm">newest first · times in UTC</span>
        </div>
        <DayStrip dates={dates} day={day} items={byDay} href={(date) => href(date)} />
      </section>

      <section aria-labelledby="day-title" className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id="day-title" className="text-lg">
              {dayLabel(day, dates[0], "long")} <span className="font-normal text-muted-foreground">· {today ? `${dayLabel(day, "", "long")} ` : ""}{dayDate(day)}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {items.length === 0 ? "No changes" : `${items.length} ${items.length === 1 ? "change" : "changes"}: ${counts.map((c) => `${c.count} ${c.state}`).join(", ")}`}
            </p>
          </div>
          <nav aria-label="Group by" className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-sm">
            {([false, true] as const).map((repo) => (
              <Link
                key={String(repo)}
                href={href(day, repo)}
                aria-current={repo === byRepo ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 transition-colors md:min-h-8",
                  repo === byRepo ? "border border-border bg-card font-medium text-card-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {repo ? "by repo" : "by time"}
              </Link>
            ))}
          </nav>
        </div>
        {!snapshot.counts.todayComplete ? (
          <p className="text-sm text-muted-foreground">Some sources could not be read, so this day may be short; Health says which.</p>
        ) : null}
        {items.length === 0 ? (
          <Card className="rounded-xl p-4 text-sm text-muted-foreground shadow-none">
            {snapshot.counts.todayComplete ? `Nothing changed ${today ? "today" : "that day"}.` : "Nothing could be read for this day from the sources that answered."}
          </Card>
        ) : byRepo ? (
          <ChangeMatrix changed={changed} quiet={quiet} now={now} />
        ) : (
          <Agenda items={items} quiet={quiet} />
        )}
        {today ? null : <p className="text-xs text-muted-foreground">Deploys and channel moves keep only their newest event, so an earlier day can show fewer of them than happened.</p>}
      </section>

      <p className="text-xs text-muted-foreground">
        The calendar keeps the last {CALENDAR_DAYS} days.{" "}
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

/**
 * The Blockers counts in one line, so the Calendar still says what needs you at a glance. A count
 * whose sources were not all read is a floor ("3+") or "?", as on the tiles.
 */
function BlockersLink({ counts }: { counts: Snapshot["counts"] }) {
  const shown = (n: number, complete: boolean) => (complete ? String(n) : n === 0 ? "?" : `${n}+`);
  const parts: { state: State; text: string }[] = [
    { state: counts.waitingComplete ? (counts.waiting ? "pending" : "green") : "unknown", text: `${shown(counts.waiting, counts.waitingComplete)} waiting` },
    { state: counts.redOrHeldComplete ? (counts.redOrHeld ? "red" : "green") : "unknown", text: `${shown(counts.redOrHeld, counts.redOrHeldComplete)} red or held` },
    { state: counts.unknownOrStale ? "unknown" : "green", text: `${counts.unknownOrStale} unknown` },
  ];
  return (
    <Link href="/blockers" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted sm:w-fit sm:min-h-9">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {parts.map((p) => (
          <span key={p.text} className="inline-flex items-center gap-1.5 tabular-nums">
            <StateDot state={p.state} />
            {p.text}
          </span>
        ))}
      </span>
      <span className="text-muted-foreground">Blockers →</span>
    </Link>
  );
}

/** A day's changes by time, newest first: the time, the state word, the repo, then the change. */
function Agenda({ items, quiet }: { items: TodayItem[]; quiet: string[] }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
      <ol className="divide-y divide-line">
        {items.map((item, i) => (
          <li key={`${item.kind}-${item.at}-${i}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-start sm:gap-4">
            <span className="flex shrink-0 flex-wrap items-center gap-2 sm:w-60 sm:flex-nowrap">
              <time dateTime={item.at} title={exactUtc(item.at)} className="w-11 shrink-0 font-mono text-xs text-muted-foreground sm:text-[13px]">
                {exactUtc(item.at).slice(11, 16)}
              </time>
              <StateBadge state={item.state} />
              <Link href={`/repos/${item.repo}`} className="min-w-0 text-sm font-medium wrap-anywhere underline-offset-2 hover:underline">
                {item.repo}
              </Link>
            </span>
            <a href={item.url} className="min-w-0 flex-1 text-sm wrap-anywhere underline-offset-2 hover:underline" {...(item.url.startsWith("/") ? {} : newTab)}>
              {item.title}
              {item.demo ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">planted demo, not counted</span> : null}
              {item.cleared && (item.state === "red" || item.state === "held") ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">since cleared</span> : null}
            </a>
          </li>
        ))}
      </ol>
      {quiet.length ? (
        <div className="border-t border-line">
          <QuietRepos quiet={quiet} />
        </div>
      ) : null}
    </Card>
  );
}
