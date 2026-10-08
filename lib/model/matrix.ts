import type { TodayItem } from "./types";

/** One row of Today's change matrix: a repo and its changes in the window, oldest first. */
export type MatrixRow = { repo: string; items: TodayItem[] };

/**
 * Groups the window's changes by repo for the matrix. Rows with the most changes come first
 * (ties by name), each row oldest to newest so a new entry lands at the right; tracked repos
 * with no change are listed apart, by name, so "nothing changed" is said rather than hidden. A
 * repo with a change but no registry (a failure record filed elsewhere) still gets a row.
 */
export function matrixRows(items: TodayItem[], tracked: string[]): { changed: MatrixRow[]; quiet: string[] } {
  const byRepo = new Map<string, TodayItem[]>();
  for (const item of items) byRepo.set(item.repo, [...(byRepo.get(item.repo) ?? []), item]);
  // The snapshot lists newest first.
  const changed = [...byRepo].map(([repo, list]) => ({ repo, items: [...list].reverse() })).sort((a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo));
  const quiet = [...new Set(tracked)].filter((name) => !byRepo.has(name)).sort((a, b) => a.localeCompare(b));
  return { changed, quiet };
}
