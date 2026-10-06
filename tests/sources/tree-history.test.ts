import { describe, expect, it } from "vitest";
import { parseMessage, readTreeHistory } from "@/lib/sources/tree-history";
import { withFixtures } from "../helpers/fixtures";

describe("tree history", () => {
  it("derives the open and close events from the commit log", async () => {
    await withFixtures();
    const signal = await readTreeHistory();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.length).toBe(13);
    expect(signal.value[0].changed).toEqual(["innernet"]);
    expect(signal.value[0].states.innernet).toBe("open");
    expect(signal.value[1].changed).toEqual(["innernet"]);
    expect(signal.value[1].states.innernet).toBe("closed");
    expect(signal.value.at(-1)?.changed).toEqual([]);
  });

  it("parses a status message and ignores anything else", () => {
    expect(parseMessage("tree-status: innernet open, xo-space closed\n\nbody")).toEqual({ innernet: "open", "xo-space": "closed" });
    expect(parseMessage("Merge pull request")).toEqual({});
  });

  it("names a missing branch", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", status: 404, body: "{}" }]);
    const signal = await readTreeHistory();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("gardener: tree-status branch not found");
  });
});
