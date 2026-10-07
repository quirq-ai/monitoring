import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import type { SourceStatus } from "@/lib/model/types";

/** Every source this render read, with its state and the data's own time, as a plain list. */
export function SourcesList({ sources, now }: { sources: SourceStatus[]; now: Date }) {
  const sorted = [...sources].sort((a, b) => Number(a.ok) - Number(b.ok) || a.source.localeCompare(b.source));
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      {sorted.map((s, i) => (
        <li key={`${s.source}-${i}`} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StateBadge state={s.ok ? "green" : "unknown"} />
            <a href={s.sourceUrl} className="font-mono text-xs break-all underline-offset-2 hover:underline sm:text-sm" rel="noreferrer">
              {s.source}
            </a>
            {s.observedAt ? (
              <span className="text-xs text-muted-foreground">
                as of <TimeAgo iso={s.observedAt} now={now} />
              </span>
            ) : null}
          </span>
          {s.reason ? <span className="text-xs break-words text-muted-foreground">{s.reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}
