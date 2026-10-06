import { describe, expect, it } from "vitest";
import { deployState, readLatestDeployment } from "@/lib/sources/deployments";
import { withFixtures } from "../helpers/fixtures";

describe("deployments", () => {
  it("reads the captured monitoring production deploy", async () => {
    await withFixtures();
    const signal = await readLatestDeployment("monitoring");
    expect(signal.ok && signal.value?.sha).toBe("dd0e680b761429093de688446802256c18bfc540");
    if (!signal.ok || !signal.value) return;
    expect(signal.value.state).toBe("green");
    expect(signal.value.by).toBe("vercel[bot]");
    expect(signal.value.url).toMatch(/^https:\/\//);
  });

  it("is red on a failed deploy and null with none", async () => {
    await withFixtures();
    expect(await readLatestDeployment("website")).toMatchObject({ value: { state: "red", status: "failure" } });
    expect((await readLatestDeployment("gate")).ok && (await readLatestDeployment("gate"))).toMatchObject({ value: null });
  });

  it("is unknown on 404, on a bad shape and without a token, and null when only previews exist", async () => {
    await withFixtures([
      { path: "/repos/quirq-ai/innernet/deployments", status: 404, body: "{}" },
      { path: "/repos/quirq-ai/xo-space/deployments", body: '[{"id":"x"}]' },
      { path: "/repos/quirq-ai/website/deployments", body: '[{"id":1,"sha":"a","environment":"Preview","created_at":"t","updated_at":"t"}]' },
    ]);
    expect((await readLatestDeployment("innernet")).ok).toBe(false);
    const bad = await readLatestDeployment("xo-space");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("does not match schema");
    const preview = await readLatestDeployment("website");
    expect(preview.ok && preview.value).toBeNull();
    delete process.env.GITHUB_TOKEN;
    expect(await readLatestDeployment("innernet")).toMatchObject({ ok: false, reason: "no token" });
  });

  it("maps every status to a state without ever defaulting to green", () => {
    expect(deployState("success")).toBe("green");
    expect(deployState("error")).toBe("red");
    expect(deployState("queued")).toBe("pending");
    expect(deployState("whatever")).toBe("unknown");
  });
});
