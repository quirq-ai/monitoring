import { describe, expect, it } from "vitest";
import { isCommitId, rawCommitUrl } from "@/lib/fetch";
import { readRevertPolicy } from "@/lib/sources/revert-policy";
import { withFixtures } from "../helpers/fixtures";

const PIN = "bf3ad29834d85489c49aa6d41ec3c7e59474b746";

describe("revert policy", () => {
  it("reads auto_revert.toml at the infra-config commit the gardener pins, without a token", async () => {
    const fixtures = await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const signal = await readRevertPolicy();
    expect(signal).toMatchObject({
      ok: true,
      sourceUrl: `https://github.com/quirq-ai/infra-config/blob/${PIN}/config/auto_revert.toml`,
      value: { pin: PIN, dailyCap: 10, windowHours: 24, verification: true, autoLandRepos: [], build: { create: 10, submit: 4, maxCulpritAgeHours: 6 }, test: { submit: 0 } },
    });
    expect(fixtures.log.api).toBe(0);
  });

  it("never reads infra-config main for the caps", async () => {
    // main says something else; the gardener still runs with its pin.
    await withFixtures([{ raw: "infra-config/main/config/auto_revert.toml", body: "[policy]\ndaily_cap = 99\n" }]);
    const signal = await readRevertPolicy();
    expect(signal.ok && signal.value.dailyCap).toBe(10);
  });

  it("refuses a pin that is not a full commit id, and never fetches it", async () => {
    const fixtures = await withFixtures([{ raw: "gardener/main/pins.toml", body: '[infra-config]\ncommit = "main"\n' }]);
    const signal = await readRevertPolicy();
    expect(signal).toMatchObject({ ok: false, reason: "gardener: pins.toml [infra-config] commit is not a full commit id" });
    expect(fixtures.log.requests).toBe(1);
  });

  it("takes only a full, lower-case, 40-character commit id as a pin", async () => {
    const bad = [PIN.slice(0, 39), `${PIN}0`, PIN.toUpperCase(), PIN.slice(0, 7), `../${PIN}`, `${PIN}/../../x`, `x${PIN}`, `${PIN}\n`, ` ${PIN}`, "main", ""];
    for (const pin of bad) {
      expect(isCommitId(pin), JSON.stringify(pin)).toBe(false);
      expect(() => rawCommitUrl("infra-config", pin, "config/auto_revert.toml")).toThrow();
    }
    expect(isCommitId(PIN)).toBe(true);
    for (const pin of [PIN.slice(0, 39), `${PIN}0`, PIN.toUpperCase(), `../${PIN}`]) {
      const fixtures = await withFixtures([{ raw: "gardener/main/pins.toml", body: `[infra-config]\ncommit = ${JSON.stringify(pin)}\n` }]);
      expect((await readRevertPolicy()).ok, pin).toBe(false);
      expect(fixtures.log.requests).toBe(1);
    }
  });

  it("is unknown when the file is missing or does not match", async () => {
    await withFixtures([{ raw: `infra-config/${PIN}/config/auto_revert.toml`, status: 404, body: "404: Not Found" }]);
    const missing = await readRevertPolicy();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain("returned 404");
    await withFixtures([{ raw: `infra-config/${PIN}/config/auto_revert.toml`, body: "[policy]\ndaily_cap = \"ten\"\n" }]);
    const bad = await readRevertPolicy();
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("does not match schema");
    await withFixtures([{ raw: "gardener/main/pins.toml", body: "not = [toml" }]);
    expect(await readRevertPolicy()).toMatchObject({ ok: false, reason: "gardener: pins.toml: not TOML" });
  });
});
