import { describe, expect, it } from "vitest";
import { matrixRows } from "@/lib/model/matrix";
import type { TodayItem } from "@/lib/model/types";

function item(repo: string, at: string, state: TodayItem["state"] = "green"): TodayItem {
  return { kind: "merged", repo, title: `${repo} at ${at}`, at, url: `https://github.com/quirq-ai/${repo}`, state };
}

describe("matrixRows", () => {
  // The snapshot's order: newest first.
  const items = [item("release", "2026-10-08T09:00:00Z", "red"), item("innernet", "2026-10-08T08:00:00Z"), item("innernet", "2026-10-08T07:00:00Z", "red"), item("innernet", "2026-10-08T06:00:00Z"), item("euler", "2026-10-08T05:00:00Z", "unknown")];

  it("one row per repo with a change, busiest first, each oldest to newest", () => {
    const { changed } = matrixRows(items, ["innernet", "release", "euler"]);
    expect(changed.map((r) => [r.repo, r.items.length])).toEqual([
      ["innernet", 3],
      ["euler", 1],
      ["release", 1],
    ]);
    expect(changed[0].items.map((i) => i.at)).toEqual(["2026-10-08T06:00:00Z", "2026-10-08T07:00:00Z", "2026-10-08T08:00:00Z"]);
  });

  it("lists the tracked repos with no change apart, by name, once each", () => {
    const { changed, quiet } = matrixRows(items, ["xo-space", "innernet", "depot", "depot", "release"]);
    expect(quiet).toEqual(["depot", "xo-space"]);
    // A change in a repo no registry names still gets a row, so nothing read is dropped.
    expect(changed.some((r) => r.repo === "euler")).toBe(true);
  });

  it("is empty for an empty window, every tracked repo quiet", () => {
    expect(matrixRows([], ["b", "a"])).toEqual({ changed: [], quiet: ["a", "b"] });
  });
});
