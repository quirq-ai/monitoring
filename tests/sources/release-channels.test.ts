import { describe, expect, it } from "vitest";
import { readReleaseChannels } from "@/lib/sources/release-channels";
import { assertNoToken, withFixtures } from "../helpers/fixtures";

const RAW = "release/release-state/channels.json";

describe("release channels", () => {
  it("reads the captured file", async () => {
    await withFixtures();
    const signal = await readReleaseChannels();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.innernet.canary.commit).toBe("8f383a3d6c28f1e4495ff177efe70dca43d17604");
    expect(signal.value["xo-space"].canary.generation).toBe(1);
    expect(signal.observedAt).toBe("2026-10-05T06:59:21Z");
    expect(signal.sourceUrl).toBe("https://github.com/quirq-ai/release/blob/release-state/channels.json");
    assertNoToken(signal);
  });

  it("is unknown with a reason on 404", async () => {
    await withFixtures([{ raw: RAW, status: 404, body: "404: Not Found" }]);
    const signal = await readReleaseChannels();
    expect(signal.ok).toBe(false);
    if (signal.ok) return;
    expect(signal.reason).toBe("release-state: release:release-state channels.json returned 404");
  });

  it("is unknown when the file is not JSON", async () => {
    await withFixtures([{ raw: RAW, body: "{ not json" }]);
    const signal = await readReleaseChannels();
    expect(signal.ok && signal.value).toBeFalsy();
    if (signal.ok) return;
    expect(signal.reason).toContain("not JSON");
  });

  it("is unknown when the shape is wrong", async () => {
    await withFixtures([{ raw: RAW, body: JSON.stringify({ schema: "qq-channels/1", repos: { innernet: { canary: { commit: 5 } } } }) }]);
    const signal = await readReleaseChannels();
    expect(signal.ok).toBe(false);
    if (signal.ok) return;
    expect(signal.reason).toContain("does not match schema");
    expect(signal.reason).toContain("repos.innernet.canary.commit");
  });

  it("refuses a newer schema id", async () => {
    await withFixtures([{ raw: RAW, body: JSON.stringify({ schema: "qq-channels/2", repos: {} }) }]);
    const signal = await readReleaseChannels();
    expect(signal.ok).toBe(false);
    if (signal.ok) return;
    expect(signal.reason).toContain("qq-channels/2 is not qq-channels/1");
    expect(signal.reason).toContain("dashboard needs updating");
  });
});
