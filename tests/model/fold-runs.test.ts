import { describe, expect, it } from "vitest";
import { foldRuns } from "../../lib/model/fold-runs";

const even = (n: number) => n % 2 === 0;

describe("foldRuns", () => {
  it("gives no runs for an empty list", () => {
    expect(foldRuns([], even)).toEqual([]);
  });

  it("puts an all-folded list in one folded run", () => {
    expect(foldRuns([2, 4, 6], even)).toEqual([{ folded: true, items: [2, 4, 6] }]);
  });

  it("puts an all-open list in one open run", () => {
    expect(foldRuns([1, 3, 5], even)).toEqual([{ folded: false, items: [1, 3, 5] }]);
  });

  it("starts a new run at every change and keeps the order", () => {
    expect(foldRuns([1, 2, 3, 4], even)).toEqual([
      { folded: false, items: [1] },
      { folded: true, items: [2] },
      { folded: false, items: [3] },
      { folded: true, items: [4] },
    ]);
    expect(foldRuns([1, 3, 2, 4, 5], even)).toEqual([
      { folded: false, items: [1, 3] },
      { folded: true, items: [2, 4] },
      { folded: false, items: [5] },
    ]);
  });

  it("neither drops nor duplicates an item, and never has two adjacent runs of one kind", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ name: `repo-${i}`, value: (i * 7) % 11 }));
    const runs = foldRuns(items, (item) => even(item.value));
    expect(runs.flatMap((r) => r.items)).toEqual(items);
    for (let i = 1; i < runs.length; i++) expect(runs[i].folded).not.toBe(runs[i - 1].folded);
    for (const run of runs) for (const item of run.items) expect(even(item.value)).toBe(run.folded);
    // The first item's name is a unique key for its run, since every item appears once.
    expect(new Set(runs.map((r) => r.items[0].name)).size).toBe(runs.length);
  });
});
