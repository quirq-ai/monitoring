import Link from "next/link";
import { StateDot, type State } from "@/components/state-badge";
import { Card } from "@/components/ui/card";
import { ago } from "@/lib/model/time";
import type { Snapshot } from "@/lib/model/types";

/**
 * The three numbers at the top of Today, each a link to where the items are. A count whose
 * sources were not all read is a floor ("3+"), and a zero built from no data is "?", never a
 * green zero. A count whose sources were read long past their window is shown stale, with when.
 * The number is the text color; the state dot next to the label carries the tone (the outlined
 * `unknown` dot when sources are missing, as everywhere else).
 */
export function CountTiles({ counts, reads, now }: { counts: Snapshot["counts"]; reads: Snapshot["reads"]; now: Date }) {
  const tiles: { label: string; value: number; href: string; complete: boolean; read: Snapshot["reads"]["waiting"] | undefined; tone: State }[] = [
    { label: "waiting on you", value: counts.waiting, href: "/waiting", complete: counts.waitingComplete, read: reads.waiting, tone: counts.waiting ? "pending" : "green" },
    { label: "red or held", value: counts.redOrHeld, href: "/board", complete: counts.redOrHeldComplete, read: reads.board, tone: counts.redOrHeld ? "red" : "green" },
    { label: "unknown, stale or failing", value: counts.unknownOrStale, href: "/health", complete: true, read: undefined, tone: counts.unknownOrStale ? "unknown" : "green" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-3">
      {tiles.map((t) => {
        const stale = Boolean(t.read?.stale && t.read.asOf);
        const tone: State = !t.complete ? "unknown" : stale ? "stale" : t.tone;
        return (
          <li key={t.label}>
            <Card className="h-full gap-0 rounded-xl py-0 shadow-none">
              <Link href={t.href} className="flex h-full flex-col gap-1 rounded-xl p-3 transition-colors hover:bg-muted sm:p-5">
                <span className="flex items-start gap-2 text-xs text-muted-foreground sm:text-sm">
                  <StateDot state={tone} className="mt-1 sm:mt-1.5" />
                  <span className="min-h-[3lh] leading-tight sm:min-h-[2lh]">{t.label}</span>
                </span>
                <span className="text-3xl font-semibold tracking-tight tabular-nums text-card-foreground sm:text-4xl">{t.complete ? t.value : t.value === 0 ? "?" : `${t.value}+`}</span>
                {!t.complete ? <span className="text-xs text-muted-foreground">some sources unread</span> : stale ? <span className="text-xs text-muted-foreground">stale: read {ago(t.read!.asOf, now)}</span> : null}
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
