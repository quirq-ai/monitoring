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
    // The groups commit the gardener will push next to the status files names no repo state.
    expect(parseMessage("groups: 2 red ranges")).toEqual({});
    expect(parseMessage("groups: 0 red ranges 6c9652e1684b3daab253852f011657bcf16f7341\n\nbody")).toEqual({});
    expect(parseMessage("groups: 1 red ranges\n\ntree-status: innernet open")).toEqual({});
  });

  it("reads 100 commits in one request", async () => {
    const fixtures = await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", query: { sha: "tree-status", per_page: "100" }, body: "[]" }]);
    expect(await readTreeHistory()).toMatchObject({ ok: true, value: [] });
    expect(fixtures.log.api).toBe(1);
  });

  it("is unknown on a malformed log and without a token", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", body: '[{"sha":1}]' }]);
    expect((await readTreeHistory()).ok).toBe(false);
    delete process.env.GITHUB_TOKEN;
    expect(await readTreeHistory()).toMatchObject({ ok: false, reason: "gardener: no token" });
  });

  it("names a missing branch", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/gardener/commits", status: 404, body: "{}" }]);
    const signal = await readTreeHistory();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("gardener: tree-status branch not found");
  });
});
