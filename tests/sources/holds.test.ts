import { describe, expect, it } from "vitest";
import { readHold } from "@/lib/sources/holds";
import { withFixtures } from "../helpers/fixtures";

const COMMIT = "14b21a41668bc8124b4cf5cf9cd59fb44dc7d419";

describe("holds", () => {
  it("reads the synthetic hold record", async () => {
    await withFixtures();
    const signal = await readHold("xo-space", COMMIT);
    expect(signal.ok && signal.value?.stage).toBe("verify");
    if (!signal.ok || !signal.value) return;
    expect(signal.value.state).toBe("held");
    expect(signal.value.releases).toEqual([]);
  });

  it("is null when there is no hold", async () => {
    await withFixtures();
    const signal = await readHold("innernet", COMMIT);
    expect(signal.ok && signal.value).toBeNull();
  });

  it("keeps the writer's runner-fault extras", async () => {
    await withFixtures([{ raw: `release/release-state/canary/xo-space/held/${COMMIT}.json`, body: JSON.stringify({ repo: "xo-space", commit: COMMIT, date: "2026-10-06", stage: "build", state: "held", digest: "", run_url: "", releases: [], tag: "runner-fault", errors: 3 }) }]);
    const signal = await readHold("xo-space", COMMIT);
    expect(signal.ok && signal.value).toMatchObject({ tag: "runner-fault", errors: 3 });
  });

  it("is unknown on a malformed record", async () => {
    await withFixtures([{ raw: `release/release-state/canary/xo-space/held/${COMMIT}.json`, body: '{"repo": 1}' }]);
    const signal = await readHold("xo-space", COMMIT);
    expect(signal.ok).toBe(false);
  });

  it("rejects a commit that is not a commit", async () => {
    await withFixtures();
    await expect(readHold("xo-space", "main")).rejects.toThrow("not a commit id");
  });
});
