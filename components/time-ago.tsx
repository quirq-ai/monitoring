import { ago, exactUtc } from "@/lib/model/time";

/** "4 min ago" with the exact UTC time in the title; `exact` shows both, for phones. */
export function TimeAgo({ iso, now, exact = false, className }: { iso?: string | null; now: Date; exact?: boolean; className?: string }) {
  if (!iso) return null;
  const words = ago(iso, now);
  const utc = exactUtc(iso);
  return (
    <time dateTime={iso} title={utc} className={className}>
      {words}
      {exact ? <span className="text-muted-foreground"> ({utc})</span> : null}
    </time>
  );
}
