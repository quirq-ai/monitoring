import { describe, expect, it } from "vitest";
import { gateByAge } from "@/lib/model/build";
import type { Cell, SourceStatus } from "@/lib/model/types";
import { isStaleRead, type Read } from "@/lib/signal";

const now = new Date("2026-10-08T12:00:00Z");
const readAgo = (seconds: number, maxAge: number): Read => ({ fetchedAt: new Date(now.getTime() - seconds * 1000).toISOString(), maxAge });

describe("the stale rule", () => {
  it("is twice the cache window, inclusive of the boundary", () => {
    expect(isStaleRead(readAgo(0, 120), now)).toBe(false);
    expect(isStaleRead(readAgo(240, 120), now), "exactly twice the window is not stale").toBe(false);
    expect(isStaleRead(readAgo(241, 120), now)).toBe(true);
    expect(isStaleRead(readAgo(3 * 3600, 3600), now)).toBe(true);
  });

  it("reads a window or a time it cannot judge as stale, never fresh", () => {
    expect(isStaleRead(readAgo(1, 0), now), "a zero window").toBe(true);
    expect(isStaleRead(readAgo(1, Number.NaN), now), "a NaN window").toBe(true);
    expect(isStaleRead({ ...readAgo(1, 120), maxAge: undefined as unknown as number }, now), "a window missing at runtime").toBe(true);
    expect(isStaleRead({ fetchedAt: "not a time", maxAge: 120 }, now), "an unparseable time").toBe(true);
  });

  it("gates a green cell by the same rule, with a zero window stale too", () => {
    const cell: Cell = { state: "green", text: "open", url: "https://example.test", source: "gardener/tree-status/innernet" };
    const source = (read: Read): SourceStatus => ({ source: cell.source, sourceUrl: "https://example.test", ok: true, ...read });
    expect(gateByAge(cell, source(readAgo(100, 300)), now).state).toBe("green");
    expect(gateByAge(cell, source(readAgo(601, 300)), now)).toMatchObject({ state: "stale", text: expect.stringContaining("not refreshed yet") });
    expect(gateByAge(cell, source(readAgo(1, 0)), now).state, "a zero window never reads as current").toBe("stale");
    expect(gateByAge({ ...cell, state: "red" }, source(readAgo(601, 300)), now).state, "an alarm stays an alarm").toBe("red");
  });
});
