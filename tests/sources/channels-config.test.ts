import { describe, expect, it } from "vitest";
import { dailyCronTime, readChannelsConfig } from "@/lib/sources/channels-config";
import { withFixtures } from "../helpers/fixtures";

describe("channels config", () => {
  it("reads the channel order from infra-config", async () => {
    await withFixtures();
    const signal = await readChannelsConfig();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.channels[0].name).toBe("canary");
    expect(signal.value.sourceRef).toBe("lkgr");
  });

  it("reads a daily cron time", () => {
    expect(dailyCronTime("17 6 * * *")).toEqual({ hour: 6, minute: 17 });
    expect(dailyCronTime("*/5 * * * *")).toBeUndefined();
    expect(dailyCronTime(undefined)).toBeUndefined();
  });

  it("is unknown without a channel table", async () => {
    await withFixtures([{ raw: "infra-config/main/config/channels.toml", body: "[source]\nref = 'lkgr'\n" }]);
    const signal = await readChannelsConfig();
    expect(signal.ok).toBe(false);
  });
});
