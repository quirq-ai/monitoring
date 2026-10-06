import { describe, expect, it } from "vitest";
import { deployState, readLatestDeployment } from "@/lib/sources/deployments";
import { withFixtures } from "../helpers/fixtures";

describe("deployments", () => {
  it("reads the captured monitoring production deploy", async () => {
    await withFixtures();
    const signal = await readLatestDeployment("monitoring");
    expect(signal.ok).toBe(true);
    if (!signal.ok || !signal.value) return;
    expect(signal.value.sha).toBe("dd0e680b761429093de688446802256c18bfc540");
    expect(signal.value.state).toBe("green");
    expect(signal.value.by).toBe("vercel[bot]");
    expect(signal.value.url).toMatch(/^https:\/\//);
  });

  it("is red on a failed deploy and null with none", async () => {
    await withFixtures();
    expect(await readLatestDeployment("website")).toMatchObject({ value: { state: "red", status: "failure" } });
    expect((await readLatestDeployment("gate")).ok && (await readLatestDeployment("gate"))).toMatchObject({ value: null });
  });

  it("maps every status to a state without ever defaulting to green", () => {
    expect(deployState("success")).toBe("green");
    expect(deployState("error")).toBe("red");
    expect(deployState("queued")).toBe("pending");
    expect(deployState("whatever")).toBe("unknown");
  });
});
