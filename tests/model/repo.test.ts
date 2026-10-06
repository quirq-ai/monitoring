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
  });

  it("carries the row, the PRs, the checks, the tree and the perf metrics of a product", async () => {
    await withFixtures();
    const view = await buildRepoView("xo-space");
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.row.ci.state).toBe("red");
    expect(view.pulls.ok && view.pulls.value.map((p) => p.number)).toEqual([77]);
    expect(view.checks.ok && view.checks.value.checks.length).toBe(2);
    expect(view.tree?.ok && view.tree.value.state).toBe("open");
    expect(view.perf.map((m) => m.metric)).toEqual(["xo-space-server-start"]);
    expect(view.release?.days.length).toBe(14);
  });
});
