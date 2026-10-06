import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import type { Cell } from "@/lib/model/types";

/**
 * The state word first, then the detail, then the link: one tile or one table cell. A `none`
 * cell is a known fact with no health in it, so it shows as plain text with no badge.
 */
export function CellView({ cell, now, title, exact = false }: { cell: Cell; now: Date; title?: string; exact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {title ? <span className="text-xs text-muted-foreground">{title}</span> : null}
      {cell.state === "none" ? null : <StateBadge state={cell.state} />}
      <a href={cell.url} className={`text-sm underline-offset-2 hover:underline ${cell.state === "none" ? "text-muted-foreground" : ""}`} rel="noreferrer">
        {cell.text}
      </a>
      {cell.at ? <TimeAgo iso={cell.at} now={now} exact={exact} className="text-xs text-muted-foreground" /> : null}
    </div>
  );
}

/** A compact form for table cells. */
export function CellInline({ cell, now }: { cell: Cell; now: Date }) {
  return (
    <span className="flex flex-col gap-0.5">
      {cell.state === "none" ? null : <StateBadge state={cell.state} />}
      <a href={cell.url} className={`text-xs underline-offset-2 hover:underline ${cell.state === "none" ? "text-muted-foreground" : ""}`} rel="noreferrer">
        {cell.text}
      </a>
      {cell.at ? <TimeAgo iso={cell.at} now={now} className="text-xs text-muted-foreground" /> : null}
    </span>
  );
}
