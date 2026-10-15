import { states, type State } from "@/lib/signal";
import { parseTime } from "./time";
import type { TodayItem, WaitingItem } from "./types";

/** How many days the Calendar shows: the merged-PR search looks back seven days, so no further. */
export const CALENDAR_DAYS = 7;

const DAY = 86_400_000;

/** The calendar's UTC dates, today first: ["2026-10-14", "2026-10-13", ...]. */
export function calendarDates(now: Date): string[] {
  return Array.from({ length: CALENDAR_DAYS }, (_, i) => new Date(now.getTime() - i * DAY).toISOString().slice(0, 10));
}

/**
 * The day a request asks for when it is one of the calendar's dates, else today. The value is
 * only ever compared with the dates, never passed on (rule 7).
 */
export function pickDay(value: string | string[] | undefined, dates: readonly string[]): string {
  return typeof value === "string" && dates.includes(value) ? value : dates[0];
}

/** The UTC date an item happened on, or "" when its time does not parse. */
export function itemDate(item: TodayItem): string {
  const t = parseTime(item.at);
  return t === null ? "" : new Date(t).toISOString().slice(0, 10);
}

/** One day's changes, in the snapshot's order (newest first). */
export function itemsOn(items: readonly TodayItem[], date: string): TodayItem[] {
  return items.filter((item) => itemDate(item) === date);
}

/** How many of a day's changes are in each state, in the dashboard's state order, empty ones left out. */
export function dayCounts(items: readonly TodayItem[]): { state: State; count: number }[] {
  return states.map((state) => ({ state, count: items.filter((i) => i.state === state).length })).filter((c) => c.count > 0);
}

/**
 * What is red or held and not cleared since, leaving out what Waiting on you already lists: the
 * same link, or a held canary for a repo whose hold is already there.
 */
export function brokenNow(today: readonly TodayItem[], waiting: readonly WaitingItem[]): TodayItem[] {
  const urls = new Set(waiting.map((w) => w.url));
  const held = new Set(waiting.filter((w) => w.kind === "held").map((w) => w.repo));
  return today.filter(
    (t) => (t.state === "red" || t.state === "held") && !t.superseded && !urls.has(t.url) && !(t.kind === "canary" && t.state === "held" && held.has(t.repo)),
  );
}
