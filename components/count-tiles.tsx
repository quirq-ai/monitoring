import Link from "next/link";
import type { Snapshot } from "@/lib/model/types";

/** The three numbers at the top of Today, each a link to where the items are. */
export function CountTiles({ counts }: { counts: Snapshot["counts"] }) {
  const tiles = [
    { label: "waiting on you", value: counts.waiting, href: "/waiting", tone: counts.waiting ? "text-state-pending" : "text-state-green" },
    { label: "red or held", value: counts.redOrHeld, href: "/board", tone: counts.redOrHeld ? "text-state-red" : "text-state-green" },
    { label: "unknown or stale", value: counts.unknownOrStale, href: "/health", tone: counts.unknownOrStale ? "text-state-unknown" : "text-state-green" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <li key={t.label}>
          <Link href={t.href} className="flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-3 hover:bg-muted sm:p-4">
            <span className={`font-mono text-3xl font-semibold ${t.tone}`}>{t.value}</span>
            <span className="text-sm text-card-foreground">{t.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
