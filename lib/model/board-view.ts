import type { State } from "@/lib/signal";
import type { BoardRow, Cell } from "./types";

/**
 * Whether a repo's note needs a look: anything but green, except a repo that is unknown only
 * because the GitHub API did not answer while the banner says so once for the whole page.
 */
export function needsLook(row: BoardRow, apiOk: boolean): boolean {
  return !(row.worst === "green" || (row.quiet && !apiOk));
}

/** The order the Board says states in: the worst first, green last. */
export const concernOrder: readonly State[] = ["red", "held", "pending", "stale", "unknown", "green"];

/** How many repos are in each state, worst first, leaving out the states no repo is in. */
export function stateCounts(rows: readonly BoardRow[]): { state: State; count: number }[] {
  return concernOrder.map((state) => ({ state, count: rows.filter((r) => r.worst === state).length })).filter((c) => c.count > 0);
}

const cellRank: Record<Cell["state"], number> = { red: 0, held: 1, pending: 2, stale: 3, unknown: 4, green: 5, none: 6 };

/** A note's fields with the ones that need a look first; equal states keep their order. */
export function byConcern<T extends { cell: Cell }>(fields: readonly T[]): T[] {
  return [...fields].sort((a, b) => cellRank[a.cell.state] - cellRank[b.cell.state]);
}
