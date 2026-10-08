import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { newTab } from "@/components/new-tab";
import { StateBadge, StateDot, states, type State } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { MatrixRow } from "@/lib/model/matrix";
import { ago } from "@/lib/model/time";
import type { TodayItem } from "@/lib/model/types";

/**
 * What changed, one row per tracked repo: the repo, its count, and one dot per change in the
 * state color, oldest left, newest right, so a busy repo reads as a long row and a quiet one as a
 * short one. The dots are the ElevenLabs UI matrix idea (a grid of round cells) with the
 * dashboard's own state markers for cells, and the row wraps instead of scrolling, so a phone
 * never scrolls sideways. A row opens into that repo's entries (the dots are decorative; the
 * trigger says the counts). Tracked repos with no change in the window fold into one line, so
 * "nothing changed" is still said, never hidden. `matrixRows` (lib/model/matrix.ts) builds the rows.
 */
function countWords(items: TodayItem[]): string {
  const counts = new Map<State, number>();
  for (const item of items) counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
  return states
    .filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(", ");
}

export function ChangeMatrix({ changed, quiet, now }: { changed: MatrixRow[]; quiet: string[]; now: Date }) {
  const shown = new Set(changed.flatMap((r) => r.items.map((i) => i.state)));
  return (
    <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
      <ul className="divide-y divide-line">
        {changed.map((row) => {
          const n = row.items.length;
          return (
            <li key={row.repo}>
              <Collapsible>
                <div className="flex min-h-11 items-center gap-3 pl-4 pr-1">
                  <Link href={`/repos/${row.repo}`} className="min-h-11 w-24 shrink-0 py-2 text-sm font-medium wrap-anywhere underline-offset-2 hover:underline sm:w-36">
                    <span className="flex min-h-7 items-center">{row.repo}</span>
                  </Link>
                  <CollapsibleTrigger
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md py-2 text-left hover:bg-muted [&[data-state=open]>svg]:rotate-180"
                    aria-label={`${n} ${n === 1 ? "change" : "changes"} for ${row.repo}: ${countWords(row.items)}`}
                  >
                    <span aria-hidden="true" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                      {row.items.map((item, i) => (
                        <StateDot key={`${item.kind}-${item.at}-${i}`} state={item.state} className="size-2.5" title={`${item.title}, ${ago(item.at, now)}`} />
                      ))}
                    </span>
                    <span aria-hidden="true" className="w-7 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {n}
                    </span>
                    <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform" aria-hidden="true" />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <ol className="flex flex-col gap-2 px-4 pt-1 pb-3">
                    {[...row.items].reverse().map((item, i) => (
                      <li key={`${item.kind}-${item.at}-${i}`} className="flex items-start gap-2">
                        <StateBadge state={item.state} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <a href={item.url} className="text-sm wrap-anywhere underline-offset-2 hover:underline" {...(item.url.startsWith("/") ? {} : newTab)}>
                            {item.title}
                            {item.demo ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">planted demo, not counted</span> : null}
                            {item.cleared && (item.state === "red" || item.state === "held") ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">since cleared</span> : null}
                          </a>
                          <TimeAgo iso={item.at} now={now} className="text-xs text-muted-foreground" />
                        </span>
                      </li>
                    ))}
                  </ol>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
        {quiet.length ? (
          <li>
            <Collapsible>
              <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted [&[data-state=open]>svg]:rotate-180">
                <span className="min-w-0 flex-1 wrap-anywhere">
                  {quiet.length} tracked {quiet.length === 1 ? "repo" : "repos"} with no change
                </span>
                <ChevronDown className="size-5 shrink-0 transition-transform" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-sm">
                  {quiet.map((name) => (
                    <li key={name}>
                      <Link href={`/repos/${name}`} className="inline-flex min-h-8 items-center wrap-anywhere underline-offset-2 hover:underline">
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </li>
        ) : null}
      </ul>
      {shown.size ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted-foreground">
          <span>one dot per change, oldest left</span>
          {states
            .filter((s) => shown.has(s))
            .map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <StateDot state={s} /> {s}
              </span>
            ))}
        </p>
      ) : null}
    </Card>
  );
}
