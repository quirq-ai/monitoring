/**
 * Splits a list into runs, in order, of items that fold and items that do not, so the phone Board
 * can draw a run of folded rows as one card and every other row as a card of its own. Every item
 * lands in exactly one run; an empty list gives no runs.
 */
export function foldRuns<T>(items: readonly T[], folds: (item: T) => boolean): { folded: boolean; items: T[] }[] {
  const runs: { folded: boolean; items: T[] }[] = [];
  for (const item of items) {
    const folded = folds(item);
    const last = runs.at(-1);
    if (last && last.folded === folded) last.items.push(item);
    else runs.push({ folded, items: [item] });
  }
  return runs;
}
