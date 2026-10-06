// The one shape every source returns. A page never sees a raw fetch result: it sees a Signal,
// which either carries a validated value or says in one line why it does not.

export const states = ["green", "red", "held", "pending", "unknown", "stale"] as const;
export type State = (typeof states)[number];

export type Signal<T> =
  | {
      source: string; // stable id, e.g. "release/channels"
      sourceUrl: string; // the human link: the file on GitHub or the API page
      fetchedAt: string; // ISO time we read it
      observedAt?: string; // ISO time the data says it was written
      ok: true;
      value: T;
    }
  | {
      source: string;
      sourceUrl: string;
      fetchedAt: string;
      observedAt?: string;
      ok: false;
      reason: string; // one actionable line, e.g. "release-state: channels.json returned 404"
    };

export function okSignal<T>(
  source: string,
  sourceUrl: string,
  value: T,
  observedAt?: string,
): Signal<T> {
  return { source, sourceUrl, fetchedAt: new Date().toISOString(), observedAt, ok: true, value };
}

export function failSignal<T>(source: string, sourceUrl: string, reason: string): Signal<T> {
  return { source, sourceUrl, fetchedAt: new Date().toISOString(), ok: false, reason };
}

/** Map a failed signal to another type without touching its reason. */
export function carryFailure<A, B>(signal: Signal<A> & { ok: false }): Signal<B> {
  return { ...signal };
}
