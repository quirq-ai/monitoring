import { describe, expect, it } from "vitest";
import { byConcern, needsLook, stateCounts } from "../../lib/model/board-view";
import type { BoardRow, Cell } from "../../lib/model/types";

const cell = (state: Cell["state"]): Cell => ({ state, text: state, url: "https://github.com/quirq-ai", source: "test" });

function row(name: string, worst: BoardRow["worst"], quiet = worst === "green"): BoardRow {
  return {
    name,
    url: `https://github.com/quirq-ai/${name}`,
    description: "",
    group: "infra",
    product: false,
    defaultBranch: "main",
    registered: true,
    ci: cell(worst),
    openPulls: 0,
    openPullsLowerBound: false,
    lastMerge: cell("none"),
    worst,
    quiet,
  };
}

describe("needsLook", () => {
  it("leaves out green repos and keeps every other state", () => {
    expect(needsLook(row("a", "green"), true)).toBe(false);
    for (const state of ["red", "held", "pending", "stale", "unknown"] as const) expect(needsLook(row("a", state), true)).toBe(true);
  });

  it("leaves out a repo unknown only because the API is out, while the banner says so", () => {
    const outage = row("a", "unknown", true);
    expect(needsLook(outage, false)).toBe(false);
    expect(needsLook(outage, true), "with the API answering, unknown is the repo's own").toBe(true);
    expect(needsLook(row("b", "unknown", false), false), "an unknown of the repo's own still needs a look").toBe(true);
  });
});

describe("stateCounts", () => {
  it("counts each state worst first and leaves out the empty ones", () => {
    const rows = [row("a", "green"), row("b", "red"), row("c", "unknown"), row("d", "green"), row("e", "red")];
    expect(stateCounts(rows)).toEqual([
      { state: "red", count: 2 },
      { state: "unknown", count: 1 },
      { state: "green", count: 2 },
    ]);
    expect(stateCounts([])).toEqual([]);
  });
});

describe("byConcern", () => {
  it("puts the fields that need a look first and keeps the order of equals", () => {
    const fields = [
      { label: "CI", cell: cell("green") },
      { label: "Last merge", cell: cell("none") },
      { label: "Deploy", cell: cell("red") },
      { label: "Tree", cell: cell("green") },
      { label: "Canary", cell: cell("held") },
      { label: "lkgr", cell: cell("unknown") },
    ];
    expect(byConcern(fields).map((f) => f.label)).toEqual(["Deploy", "Canary", "lkgr", "CI", "Tree", "Last merge"]);
    expect(fields[0].label, "the input is left as it was").toBe("CI");
  });
});
