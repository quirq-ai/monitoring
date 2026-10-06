import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Snapshot } from "@/lib/model/types";

/**
 * The three numbers at the top of Today, each a link to where the items are. A count whose
 * sources were not all read is a floor ("3+"), and a zero built from no data is "?", never a
 * green zero.
 */
export function CountTiles({ counts }: { counts: Snapshot["counts"] }) {
  const tiles = [
    { label: "waiting on you", value: counts.waiting, href: "/waiting", complete: counts.waitingComplete, tone: counts.waiting ? "text-state-pending" : "text-state-green" },
    { label: "red or held", value: counts.redOrHeld, href: "/board", complete: counts.redOrHeldComplete, tone: counts.redOrHeld ? "text-state-red" : "text-state-green" },
    { label: "unknown or stale", value: counts.unknownOrStale, href: "/health", complete: true, tone: counts.unknownOrStale ? "text-state-unknown" : "text-state-green" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <li key={t.label}>
          <Card className="h-full gap-1 rounded-lg py-0 shadow-none">
            <Link href={t.href} className="flex h-full flex-col gap-1 p-3 hover:bg-muted sm:p-4">
              <span className={`font-mono text-3xl font-semibold ${t.complete ? t.tone : "text-state-unknown"}`}>
                {t.complete ? t.value : t.value === 0 ? "?" : `${t.value}+`}
              </span>
              <span className="text-sm text-card-foreground">{t.label}</span>
              {t.complete ? null : <span className="text-xs text-muted-foreground">some sources unread</span>}
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
