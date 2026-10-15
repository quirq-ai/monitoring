import { describe, expect, it } from "vitest";
import { brokenNow, calendarDates, dayCounts, itemsOn, pickDay } from "../../lib/model/calendar";
import type { TodayItem, WaitingItem } from "../../lib/model/types";

const item = (at: string, state: TodayItem["state"], extra: Partial<TodayItem> = {}): TodayItem => ({
  kind: "merged",
  repo: "innernet",
  title: "t",
  at,
  url: `https://github.com/quirq-ai/innernet/pull/${at}`,
  state,
  ...extra,
});

describe("calendarDates", () => {
  it("is seven UTC dates, today first, across a month end", () => {
    expect(calendarDates(new Date("2026-10-03T00:30:00Z"))).toEqual(["2026-10-03", "2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29", "2026-09-28", "2026-09-27"]);
  });
});

describe("pickDay", () => {
  const dates = calendarDates(new Date("2026-10-14T21:00:00Z"));
  it("takes a date the calendar shows and falls back to today for anything else", () => {
    expect(pickDay("2026-10-12", dates)).toBe("2026-10-12");
    expect(pickDay(undefined, dates)).toBe("2026-10-14");
    expect(pickDay("2026-10-07", dates), "eight days back is past the calendar").toBe("2026-10-14");
    expect(pickDay("../../etc", dates)).toBe("2026-10-14");
    expect(pickDay(["2026-10-12", "2026-10-13"], dates), "a repeated parameter is not a day").toBe("2026-10-14");
  });
});

describe("itemsOn and dayCounts", () => {
  it("files each change under its UTC date, keeps their order and counts the states", () => {
    const items = [item("2026-10-14T20:43:00Z", "green"), item("2026-10-14T00:10:00+02:00", "red"), item("2026-10-13T23:59:00Z", "held"), item("not a time", "green")];
    expect(itemsOn(items, "2026-10-14").map((i) => i.at)).toEqual(["2026-10-14T20:43:00Z"]);
    expect(itemsOn(items, "2026-10-13").map((i) => i.state), "00:10 at +02:00 is the day before in UTC").toEqual(["red", "held"]);
    expect(dayCounts(itemsOn(items, "2026-10-13"))).toEqual([
      { state: "red", count: 1 },
      { state: "held", count: 1 },
    ]);
    expect(dayCounts([])).toEqual([]);
  });
});

describe("brokenNow", () => {
  const waiting: WaitingItem[] = [
    { kind: "failure", repo: "release", title: "#44", detail: "", since: "", url: "https://github.com/quirq-ai/release/issues/44", state: "red" },
    { kind: "held", repo: "xo-space", title: "canary held", detail: "", since: "", url: "https://example.test/hold", state: "held" },
  ];
  it("keeps red and held alarms not cleared since, and leaves out what is already waiting on you", () => {
    const today = [
      item("1", "red", { kind: "deploy", repo: "website", url: "https://vercel.test/1" }),
      item("2", "red", { kind: "tree", superseded: true, cleared: true }),
      item("3", "held", { kind: "canary", repo: "xo-space", url: "https://example.test/run" }),
      item("4", "red", { kind: "issue", repo: "release", url: "https://github.com/quirq-ai/release/issues/44" }),
      item("5", "green"),
      item("6", "unknown", { kind: "failure", demo: true }),
    ];
    expect(brokenNow(today, waiting).map((t) => t.at)).toEqual(["1"]);
    expect(brokenNow(today, []).map((t) => t.at), "with nothing waiting, every live alarm shows").toEqual(["1", "3", "4"]);
  });
});
