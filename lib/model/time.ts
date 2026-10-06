// Plain-words time, computed on the server from one `now` so a page is consistent with itself.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** "4 min ago", "3 h ago", "2 d ago"; "" when the time is missing or unreadable. */
export function ago(iso: string | null | undefined, now: Date): string {
  const t = parseTime(iso);
  if (t === null) return "";
  const diff = now.getTime() - t;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  return `${Math.floor(diff / DAY)} d ago`;
}

export function minutesSince(iso: string | null | undefined, now: Date): number | null {
  const t = parseTime(iso);
  return t === null ? null : (now.getTime() - t) / MINUTE;
}

export function within(iso: string | null | undefined, hours: number, now: Date): boolean {
  const m = minutesSince(iso, now);
  return m !== null && m >= 0 - 5 && m <= hours * 60;
}

/** `2026-10-06T17:16:30Z` to `2026-10-06 17:16 UTC`, for titles and the repo page. */
export function exactUtc(iso: string | null | undefined): string {
  const t = parseTime(iso);
  if (t === null) return "";
  return new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export const WINDOWS = { "24h": 24, "7d": 24 * 7 } as const;
export type Window = keyof typeof WINDOWS;

export function parseWindow(value: string | null | undefined): Window {
  return value === "7d" ? "7d" : "24h";
}
