import { describe, expect, it } from "vitest";
import { buildRepoView, isRepoName } from "@/lib/model/repo";
import { withFixtures } from "../helpers/fixtures";

describe("repo view", () => {
  it("is null for a name that is not a repo name, with no request at all", async () => {
    const fixtures = await withFixtures();
    expect(await buildRepoView("../etc/passwd")).toBeNull();
    expect(await buildRepoView("a b")).toBeNull();
    expect(fixtures.log.requests).toBe(0);
    expect(isRepoName("innernet")).toBe(true);
  });

  it("is null for a well-formed name no registry knows, without reading anything for it", async () => {
    const fixtures = await withFixtures();
    expect(await buildRepoView("no-such-repo")).toBeNull();
    expect(fixtures.log.misses.filter((m) => m.includes("no-such-repo"))).toEqual([]);
    expect(fixtures.log.api, "no API call for an unknown repo").toBe(0);
  });

  it("carries the row, the PRs, the checks, the tree and the perf metrics of a product", async () => {
    await withFixtures();
    const view = await buildRepoView("xo-space");
    expect(view).not.toBeNull();
    if (!view || "unavailable" in view) throw new Error("expected a repo view");
    expect(view.row.ci.state).toBe("red");
    expect(view.pulls.ok && view.pulls.value.map((p) => p.number)).toEqual([77]);
    expect(view.checks.ok && view.checks.value.checks.length).toBe(2);
    expect(view.tree?.ok && view.tree.value.state).toBe("open");
    expect(view.perf.map((m) => m.metric)).toEqual(["xo-space-server-start"]);
    expect(view.release?.days.length).toBe(14);
  });

  it("shows no metrics, not an unknown, for a product perf does not measure", async () => {
    await withFixtures();
    const view = await buildRepoView("website");
    if (!view || "unavailable" in view) throw new Error("expected a repo view");
    expect(view.perf).toEqual([]);
    expect(view.perfReason).toBeUndefined();
  });

  it("says why when the perf-data branch is missing, instead of showing no metrics", async () => {
    await withFixtures([{ path: "/repos/quirq-ai/perf/contents/innernet", status: 404, body: JSON.stringify({ message: "No commit found for the ref perf-data", documentation_url: "https://docs.github.com/rest/repos/contents" }) }]);
    const view = await buildRepoView("innernet");
    if (!view || "unavailable" in view) throw new Error("expected a repo view");
    expect(view.perf).toEqual([]);
    expect(view.perfReason).toBe("perf-data: GitHub API returned 404: No commit found for the ref perf-data");
  });

  it("is unavailable, not a 404, when the registries cannot be read", async () => {
    await withFixtures([
      { raw: "infra-config/main/config/repos.toml", status: 502, body: "" },
      { raw: "gate/main/settings/github.toml", status: 502, body: "" },
    ]);
    const view = await buildRepoView("innernet");
    expect(view).toMatchObject({ unavailable: expect.stringContaining("502") });
    expect(await buildRepoView("monitoring"), "a repo this repo's own config names is still found").not.toBeNull();
  });
});
