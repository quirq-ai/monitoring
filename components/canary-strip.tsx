import type { CanaryDay } from "@/lib/model/types";

// One class per outcome. `unknown` (the run file could not be read) is an outlined square with a
// question mark, so it never passes for a quiet day; `none` (no file that day) is the muted fill.
const look: Record<CanaryDay["outcome"], { rect: string; word: string }> = {
  shipped: { rect: "fill-state-green stroke-border", word: "shipped" },
  held: { rect: "fill-state-held stroke-border", word: "held" },
  error: { rect: "fill-state-red stroke-border", word: "error" },
  noop: { rect: "fill-state-pending stroke-border", word: "nothing to ship" },
  none: { rect: "fill-muted stroke-border", word: "no run" },
  unknown: { rect: "fill-none stroke-state-unknown", word: "unreadable" },
};

const order: CanaryDay["outcome"][] = ["shipped", "held", "error", "noop", "none", "unknown"];

/** One square per day, oldest left, in plain SVG. Each square is a link to the run file. */
export function CanaryStrip({ days, repo }: { days: CanaryDay[]; repo: string }) {
  const size = 18;
  const gap = 4;
  const width = days.length * (size + gap) - gap;
  return (
    <figure className="flex flex-col gap-1">
      <svg width={width} height={size} viewBox={`0 0 ${width} ${size}`} className="max-w-full overflow-visible">
        <title>{`${repo} canary, last ${days.length} days`}</title>
        {days.map((d, i) => (
          <a key={d.date} href={d.url} aria-label={`${d.date}: ${look[d.outcome].word}${d.reason ? `, ${d.reason}` : ""}`}>
            <rect x={i * (size + gap) + 1} y={1} width={size - 2} height={size - 2} rx={4} className={look[d.outcome].rect} strokeWidth={d.outcome === "unknown" ? 2 : 1}>
              <title>{`${d.date}: ${look[d.outcome].word}${d.reason ? `, ${d.reason}` : ""}`}</title>
            </rect>
            {d.outcome === "unknown" ? (
              <text x={i * (size + gap) + size / 2} y={size / 2 + 4} textAnchor="middle" className="fill-state-unknown text-[11px] font-semibold" aria-hidden="true">
                ?
              </text>
            ) : null}
          </a>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {days[0]?.date} to {days.at(-1)?.date}
        </span>
        {order.map((o) => (
          <span key={o} className="inline-flex items-center gap-1">
            <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="overflow-visible">
              <rect x={1} y={1} width={8} height={8} rx={2} className={look[o].rect} strokeWidth={o === "unknown" ? 2 : 1} />
              {o === "unknown" ? (
                <text x={5} y={8.5} textAnchor="middle" className="fill-state-unknown text-[8px] font-semibold">
                  ?
                </text>
              ) : null}
            </svg>
            {look[o].word}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
