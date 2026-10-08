import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import type { SourceStatus } from "@/lib/model/types";
import { isStaleRead } from "@/lib/signal";

/**
 * Every source this render read, with its state and the data's own time, as a plain list. A read
 * that answered is "ok" on a plain pill with no state color: `ok` says the file or API page could
 * be read (through the data cache, so never "fresh"), not that what it says is healthy; the Board
 * and the writers' cards judge that. A read older than twice its cache window is `stale`, the
 * rule the model applies to cells and to the count tiles; one that failed is `unknown`. The
 * list puts what needs a look first: unknown, then stale, then the reads that are fine.
 */
export function SourcesList({ sources, now }: { sources: SourceStatus[]; now: Date }) {
  const rank = (s: SourceStatus) => (!s.ok ? 0 : isStaleRead(s, now) ? 1 : 2);
  const sorted = [...sources].sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source));
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      {sorted.map((s, i) => {
        const stale = s.ok && isStaleRead(s, now);
        return (
          <li key={`${s.source}-${i}`} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {!s.ok ? (
                <StateBadge state="unknown" />
              ) : stale ? (
                <StateBadge state="stale" />
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">ok</span>
              )}
              <a href={s.sourceUrl} className="font-mono text-xs wrap-anywhere underline-offset-2 hover:underline sm:text-sm" rel="noreferrer">
                {s.source}
              </a>
              {stale ? (
                <span className="text-xs text-muted-foreground">
                  read <TimeAgo iso={s.fetchedAt} now={now} />, not refreshed yet
                </span>
              ) : null}
              {s.observedAt ? (
                <span className="text-xs text-muted-foreground">
                  as of <TimeAgo iso={s.observedAt} now={now} />
                </span>
              ) : null}
            </span>
            {s.reason ? <span className="text-xs wrap-anywhere text-muted-foreground">{s.reason}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
