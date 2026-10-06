import type { CanaryDay } from "@/lib/model/types";

const fill: Record<CanaryDay["outcome"], string> = {
  shipped: "fill-state-green",
  held: "fill-state-held",
  error: "fill-state-red",
  noop: "fill-state-pending",
  none: "fill-muted",
  unknown: "fill-state-unknown",
};

/** One square per day, oldest left, in plain SVG. Each square links to the run file. */
export function CanaryStrip({ days, repo }: { days: CanaryDay[]; repo: string }) {
  const size = 18;
  const gap = 4;
  const width = days.length * (size + gap) - gap;
  return (
    <figure className="flex flex-col gap-1">
      <svg
        width={width}
        height={size}
        viewBox={`0 0 ${width} ${size}`}
        role="img"
        aria-label={`${repo} canary, last ${days.length} days: ${days.map((d) => `${d.date} ${d.outcome}`).join(", ")}`}
        className="max-w-full"
      >
        {days.map((d, i) => (
          <a key={d.date} href={d.url}>
            <rect x={i * (size + gap)} y={0} width={size} height={size} rx={3} className={`${fill[d.outcome]} stroke-border`} strokeWidth={1}>
              <title>{`${d.date}: ${d.outcome}${d.reason ? `, ${d.reason}` : ""}`}</title>
            </rect>
          </a>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {days[0]?.date} to {days.at(-1)?.date}: green shipped, amber held, red error, blue nothing to ship, grey no run
      </figcaption>
    </figure>
  );
}
