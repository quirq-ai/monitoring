import { describe, expect, it } from "vitest";
import { readLedger } from "@/lib/sources/ledger";
import { withFixtures } from "../helpers/fixtures";

describe("ledger", () => {
  it("says the ledger has not started while the branch is missing", async () => {
    await withFixtures();
    const signal = await readLedger();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("ledger not started");
  });

  it("counts records once the branch exists", async () => {
    await withFixtures([
      { path: "/repos/quirq-ai/gardener/contents/reverts", file: "api/gardener_contents_reverts.json" },
      { path: "/repos/quirq-ai/gardener/contents/landed", file: "api/gardener_contents_landed.json" },
    ]);
    const signal = await readLedger();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.reverts).toBe(1);
    expect(signal.value.landed).toBe(0);
    expect(signal.value.newest[0]).toContain("innernet");
  });
});
