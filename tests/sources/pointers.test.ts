import { describe, expect, it } from "vitest";
import { readPointer } from "@/lib/sources/pointers";
import { withFixtures } from "../helpers/fixtures";

describe("pointers", () => {
  it("reads lkgr and a channel pointer", async () => {
    await withFixtures();
    const lkgr = await readPointer("innernet", "lkgr");
    expect(lkgr.ok).toBe(true);
    if (!lkgr.ok) return;
    expect(lkgr.value.ref).toBe("lkgr");
    expect(lkgr.value.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lkgr.value.history.length).toBeGreaterThan(0);
    expect(lkgr.observedAt).toBe(lkgr.value.updated_at);
    const canary = await readPointer("xo-space", "channels/canary");
    expect(canary.ok).toBe(true);
    if (!canary.ok) return;
    expect(canary.value.commit).toBe("14b21a41668bc8124b4cf5cf9cd59fb44dc7d419");
  });

  it("says when a repo has no pointer yet", async () => {
    await withFixtures();
    const signal = await readPointer("website", "lkgr");
    expect(signal.ok).toBe(false);
    if (signal.ok) return;
    expect(signal.reason).toBe("release-state: no lkgr pointer for website yet");
  });

  it("rejects a bad shape and a wrong schema", async () => {
    await withFixtures([
      { raw: "release/release-state/pointers/innernet/lkgr.json", body: '{"schema":"qq-pointer/1","repo":"innernet"}' },
      { raw: "release/release-state/pointers/xo-space/lkgr.json", body: '{"schema":"qq-pointer/9","repo":"x","ref":"lkgr","commit":"a","generation":1,"updated_at":"t"}' },
    ]);
    const bad = await readPointer("innernet", "lkgr");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("does not match schema");
    const wrong = await readPointer("xo-space", "lkgr");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toContain("qq-pointer/9 is not qq-pointer/1");
  });

  it("never lets a bad repo name reach a URL", async () => {
    await withFixtures();
    await expect(readPointer("../etc", "lkgr")).rejects.toThrow("not a repo name");
    await expect(readPointer("..", "lkgr")).rejects.toThrow("not a repo name");
    await expect(readPointer("innernet", "channels/../../x" as "channels/x")).rejects.toThrow("not a pointer ref");
  });
});
