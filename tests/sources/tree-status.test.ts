import { describe, expect, it } from "vitest";
import { parseIndex, readTreeIndex, readTreeStatus } from "@/lib/sources/tree-status";
import { withFixtures } from "../helpers/fixtures";

describe("tree status", () => {
  it("reads the captured status files", async () => {
    await withFixtures();
    const xo = await readTreeStatus("xo-space");
    expect(xo.ok).toBe(true);
    if (!xo.ok) return;
    expect(xo.value.state).toBe("open");
    expect(Object.keys(xo.value.builders)).toContain("xo-space-postsubmit");
    expect(xo.value.coverage?.commits).toBe(11);
    const inn = await readTreeStatus("innernet");
    expect(inn.ok && inn.value.state).toBe("open");
  });

  it("is unknown for a repo gardener does not watch", async () => {
    await withFixtures();
    const signal = await readTreeStatus("website");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toBe("tree-status: the gardener does not watch website");
  });

  it("is unknown when the file is not JSON", async () => {
    await withFixtures([{ raw: "gardener/tree-status/status/innernet.json", body: "<html>" }]);
    const signal = await readTreeStatus("innernet");
    expect(signal.ok).toBe(false);
    if (!signal.ok) expect(signal.reason).toContain("not JSON");
  });

  it("refuses a state it does not know and a wrong schema", async () => {
    await withFixtures([
      { raw: "gardener/tree-status/status/innernet.json", body: '{"schema":"qq-tree-status/1","repo":"innernet","state":"purple"}' },
      { raw: "gardener/tree-status/status/xo-space.json", body: '{"schema":"qq-tree-status/3","repo":"xo-space","state":"open"}' },
    ]);
    const bad = await readTreeStatus("innernet");
    expect(bad.ok).toBe(false);
    const wrong = await readTreeStatus("xo-space");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toContain("qq-tree-status/3 is not qq-tree-status/1");
  });

  it("lists the watched repos from the gardener's status index", async () => {
    await withFixtures();
    expect(await readTreeIndex()).toMatchObject({ ok: true, value: ["xo-space", "innernet"] });
  });

  it("keeps only plain repo names from the index, once each", () => {
    const text = "# Tree status\n\n| Repo | Tree |\n|---|---|\n| xo-space | **open** |\n| ../etc | open |\n| xo-space | open |\n| a b | open |\n";
    expect(parseIndex(text)).toEqual(["xo-space"]);
    expect(parseIndex("# nothing here\n")).toBeNull();
  });

  it("is unknown when the index is missing", async () => {
    await withFixtures([{ raw: "gardener/tree-status/status/README.md", status: 404, body: "404: Not Found" }]);
    expect(await readTreeIndex()).toMatchObject({ ok: false, reason: "tree-status: the tree-status branch has no status/README.md" });
  });
});
