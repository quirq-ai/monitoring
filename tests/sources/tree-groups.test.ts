import { describe, expect, it } from "vitest";
import { readTreeGroups } from "@/lib/sources/tree-groups";
import { assertNoToken, withFixtures } from "../helpers/fixtures";

const RAW = "gardener/tree-status/groups/groups.json";

describe("gardener tree-status groups", () => {
  it("reads the captured file, which has no red range", async () => {
    await withFixtures();
    const signal = await readTreeGroups();
    expect(signal).toMatchObject({ ok: true, value: [], sourceUrl: "https://github.com/quirq-ai/gardener/blob/tree-status/groups/groups.json" });
    assertNoToken(signal);
  });

  it("says the file is not published yet on a 404", async () => {
    await withFixtures([{ raw: RAW, status: 404, body: "404: Not Found" }]);
    expect(await readTreeGroups()).toMatchObject({ ok: false, reason: "tree-status: groups/groups.json is not published yet" });
  });

  it("refuses a malformed file, an unknown kind and another schema", async () => {
    await withFixtures([{ raw: RAW, body: "{not json" }]);
    expect((await readTreeGroups()).ok).toBe(false);
    const entry = { repo: "innernet", last_good: "a", first_bad: "b", builders: ["x"], runs: ["u"], kind: "flaky", failed_steps: [] };
    await withFixtures([{ raw: RAW, body: JSON.stringify({ schema: "qq-gardener-groups/1", groups: [entry] }) }]);
    expect((await readTreeGroups()).ok).toBe(false);
    await withFixtures([{ raw: RAW, body: JSON.stringify({ schema: "qq-gardener-groups/2", groups: [] }) }]);
    const other = await readTreeGroups();
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.reason).toContain("the dashboard needs updating");
  });
});
