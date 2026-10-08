// The one shape every source returns. A page never sees a raw fetch result: it sees a Signal,
// which either carries a validated value or says in one line why it does not.

export const states = ["green", "red", "held", "pending", "unknown", "stale"] as const;
export type State = (typeof states)[number];

/**
 * When the bytes behind a signal were actually read, and for how long the data cache may serve
 * them. Next serves an expired cache entry once while it refreshes in the background, so a
 * signal's `fetchedAt` is the response's own `Date` header, not the render time.
 */
export type Read = { fetchedAt: string; maxAge: number };

export type Signal<T> =
  | {
      source: string; // stable id, e.g. "release/channels"
      sourceUrl: string; // the human link: the file on GitHub or the API page
      fetchedAt: string; // ISO time the bytes were read (the response's Date header)
      maxAge: number; // the cache window in seconds; the data may be this old plus one refresh
      observedAt?: string; // ISO time the data says it was written
      ok: true;
      value: T;
    }
  | {
      source: string;
      sourceUrl: string;
      fetchedAt: string;
      maxAge: number;
      observedAt?: string;
      ok: false;
      reason: string; // one actionable line, e.g. "release-state: channels.json returned 404"
    };

// Every signal carries the read behind it: without a `maxAge` a read could never go stale, so
// its "ok" and its green cells would hold forever. A source that fails before it reads anything
// (a refused name, say) passes `unreadAt` with its own cache window.
export function okSignal<T>(source: string, sourceUrl: string, value: T, observedAt: string | undefined, read: Read): Signal<T> {
  return { source, sourceUrl, fetchedAt: read.fetchedAt, maxAge: read.maxAge, observedAt, ok: true, value };
}

export function failSignal<T>(source: string, sourceUrl: string, reason: string, read: Read): Signal<T> {
  return { source, sourceUrl, fetchedAt: read.fetchedAt, maxAge: read.maxAge, ok: false, reason };
}

/** The read of a source that never called out: now, with the window it would have cached for. */
export function unreadAt(maxAge: number): Read {
  return { fetchedAt: new Date().toISOString(), maxAge };
}

/**
 * The one stale rule: a read older than twice its cache window was served expired and not
 * refreshed since (Next serves an expired entry once while it refreshes in the background). The
 * model's cells and page reads and Health's Sources list all judge a read by this. Written so
 * that a read it cannot judge (an unparseable time, a window that is missing at runtime through
 * an untyped path) is stale, never fresh: missing is never green.
 */
export function isStaleRead(read: Read, now: Date): boolean {
  const ageSeconds = (now.getTime() - Date.parse(read.fetchedAt)) / 1000;
  return !(ageSeconds <= 2 * read.maxAge);
}

/** Map a failed signal to another type without touching its reason. */
export function carryFailure<A, B>(signal: Signal<A> & { ok: false }): Signal<B> {
  return { ...signal };
}

/** The ISO time a response was read: its own Date header, which the data cache keeps. */
export function readAt(headers: Headers | undefined): string {
  const date = headers?.get("date");
  const parsed = date ? new Date(date) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}
