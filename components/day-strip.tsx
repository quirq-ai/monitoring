import Link from "next/link";
import type { State } from "@/components/state-badge";
import { dayCounts } from "@/lib/model/calendar";
import type { TodayItem } from "@/lib/model/types";
import { cn } from "@/lib/utils";

const bar: Record<State, string> = {
  green: "bg-state-green",
  red: "bg-state-red",
  held: "bg-state-held",
  pending: "bg-state-pending",
  stale: "bg-state-stale",
  unknown: "border border-state-unknown",
};

/** "Today", else the short weekday of a UTC date: "Tue". */
export function dayLabel(date: string, today: string, style: "short" | "long" = "short"): string {
  if (date === today) return "Today";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: style, timeZone: "UTC" });
}

/** "14 October" or "14 Oct" for a UTC date. */
export function dayDate(date: string, style: "short" | "long" = "long"): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: style, timeZone: "UTC" });
}

function countWords(n: number, counts: { state: State; count: number }[]): string {
  if (n === 0) return "no changes";
  return `${n} ${n === 1 ? "change" : "changes"}: ${counts.map((c) => `${c.count} ${c.state}`).join(", ")}`;
}

/**
 * The Calendar's seven days, today first. Each day says how many changes it had and draws them as
 * a thin bar split by state (decoration: the link's name says the counts in words). The chosen day
 * is outlined in the text color.
 */
export function DayStrip({ dates, day, items, href }: { dates: string[]; day: string; items: Map<string, TodayItem[]>; href: (date: string) => string }) {
  return (
    <nav aria-label="Days" className="grid grid-cols-7 gap-1 sm:gap-2">
      {dates.map((date) => {
        const list = items.get(date) ?? [];
        const counts = dayCounts(list);
        const on = date === day;
        return (
          <Link
            key={date}
            href={href(date)}
            aria-current={on ? "date" : undefined}
            aria-label={`${dayLabel(date, dates[0], "long")} ${dayDate(date)}: ${countWords(list.length, counts)}`}
            className={cn(
              "flex min-h-19 min-w-0 flex-col items-center gap-1 rounded-lg border bg-card px-0.5 pt-2 pb-1.5 text-card-foreground transition-colors sm:min-h-26 sm:items-start sm:gap-1.5 sm:px-3.5 sm:pt-3 sm:pb-2.5",
              on ? "border-foreground ring-1 ring-foreground" : "border-border hover:bg-muted",
            )}
          >
            <span className={cn("text-[11px] sm:text-xs", on ? "font-medium" : "text-muted-foreground")}>{dayLabel(date, dates[0])}</span>
            <span className={cn("text-lg leading-none font-semibold tracking-tight tabular-nums sm:text-2xl", list.length === 0 && "text-muted-foreground")}>{Number(date.slice(8))}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground sm:text-xs">
              {list.length}
              <span className="hidden sm:inline"> {list.length === 1 ? "change" : "changes"}</span>
            </span>
            <span aria-hidden="true" className={cn("mt-auto flex h-1 w-7 gap-px overflow-hidden rounded-full sm:w-full", list.length === 0 && "bg-line")}>
              {counts.map((c) => (
                <span key={c.state} className={cn("box-border h-full rounded-[1px]", bar[c.state])} style={{ flexGrow: c.count }} />
              ))}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
