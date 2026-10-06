import { TimeAgo } from "@/components/time-ago";
import type { SourceStatus } from "@/lib/model/types";

/** Every source this render read, with its state and the data's own time, as a plain list. */
export function SourcesList({ sources, now }: { sources: SourceStatus[]; now: Date }) {
  const sorted = [...sources].sort((a, b) => Number(a.ok) - Number(b.ok) || a.source.localeCompare(b.source));
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {sorted.map((s, i) => (
        <li key={`${s.source}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className={s.ok ? "text-state-green" : "text-state-unknown"}>{s.ok ? "ok" : "unknown"}</span>
            <a href={s.sourceUrl} className="underline-offset-2 hover:underline" rel="noreferrer">
              {s.source}
            </a>
            {s.observedAt ? (
              <span className="text-xs text-muted-foreground">
                as of <TimeAgo iso={s.observedAt} now={now} />
              </span>
            ) : null}
          </span>
          {s.reason ? <span className="text-xs text-muted-foreground">{s.reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}
