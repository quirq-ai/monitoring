import { describe, expect, it } from "vitest";
import { localGroups, readGateRepos, readOrgRepos, readProducts } from "@/lib/sources/registry";
import { withFixtures } from "../helpers/fixtures";

describe("registry", () => {
  it("reads the products from infra-config", async () => {
    await withFixtures();
    const signal = await readProducts();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    const names = signal.value.map((p) => p.name);
    expect(names).toContain("innernet");
    expect(names).toContain("xo-space");
    expect(signal.value.find((p) => p.name === "innernet")?.channels).toContain("canary");
  });

  it("reads the gate's repo list", async () => {
    await withFixtures();
    const signal = await readGateRepos();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.length).toBeGreaterThanOrEqual(13);
    expect(signal.value.map((r) => r.name)).toContain("gate");
  });

  it("is unknown when a TOML file is broken", async () => {
    await withFixtures([{ raw: "infra-config/main/config/repos.toml", body: "[[repo]\nname = " }]);
    const signal = await readProducts();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("infra-config");
  });

  it("lists the org repos from the API", async () => {
    await withFixtures();
    const signal = await readOrgRepos();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.source).toBe("github/org-repos");
    expect(signal.value.map((r) => r.name)).toContain("monitoring");
  });

  it("falls back to the wiki manifest without a token", async () => {
    await withFixtures();
    delete process.env.GITHUB_TOKEN;
    const signal = await readOrgRepos();
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.source).toBe("wiki/manifest");
    expect(signal.value.map((r) => r.name)).toContain("wiki");
  });

  it("carries both reasons when the API and the manifest fail", async () => {
    await withFixtures([{ raw: "wiki/main/.quirq-wiki-manifest.json", status: 404, body: "" }]);
    delete process.env.GITHUB_TOKEN;
    const signal = await readOrgRepos();
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("GitHub API: no token; wiki manifest: wiki:main .quirq-wiki-manifest.json returned 404");
  });

  it("knows its own extra groups", () => {
    const groups = localGroups();
    expect(groups.map((g) => g.id)).toContain("apps");
    expect(groups.flatMap((g) => Object.keys(g.repos))).toContain("monitoring");
  });
});
