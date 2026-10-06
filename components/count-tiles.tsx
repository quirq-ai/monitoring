import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ago } from "@/lib/model/time";
import type { Snapshot } from "@/lib/model/types";

/**
 * The three numbers at the top of Today, each a link to where the items are. A count whose
 * sources were not all read is a floor ("3+"), and a zero built from no data is "?", never a
 * green zero. A count whose sources were read long past their window is shown stale, with when.
 */
export function CountTiles({ counts, reads, now }: { counts: Snapshot["counts"]; reads: Snapshot["reads"]; now: Date }) {
  const tiles = [
    { label: "waiting on you", value: counts.waiting, href: "/waiting", complete: counts.waitingComplete, read: reads.waiting, tone: counts.waiting ? "text-state-pending" : "text-state-green" },
    { label: "red or held", value: counts.redOrHeld, href: "/board", complete: counts.redOrHeldComplete, read: reads.board, tone: counts.redOrHeld ? "text-state-red" : "text-state-green" },
    { label: "unknown, stale or failing", value: counts.unknownOrStale, href: "/health", complete: true, read: undefined, tone: counts.unknownOrStale ? "text-state-unknown" : "text-state-green" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-3">
      {tiles.map((t) => {
        const stale = Boolean(t.read?.stale && t.read.asOf);
        const tone = !t.complete ? "text-state-unknown" : stale ? "text-state-stale" : t.tone;
        return (
          <li key={t.label}>
            <Card className="h-full gap-1 rounded-lg py-0 shadow-none">
              <Link href={t.href} className="flex h-full flex-col gap-1 p-3 hover:bg-muted sm:p-4">
                <span className={`font-mono text-3xl font-semibold ${tone}`}>{t.complete ? t.value : t.value === 0 ? "?" : `${t.value}+`}</span>
                <span className="text-sm text-card-foreground">{t.label}</span>
                {!t.complete ? <span className="text-xs text-muted-foreground">some sources unread</span> : stale ? <span className="text-xs text-muted-foreground">stale: read {ago(t.read!.asOf, now)}</span> : null}
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
