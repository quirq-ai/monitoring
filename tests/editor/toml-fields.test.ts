import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { applyTomlEdits, scanToml, type TomlField } from "@/lib/editor/toml-fields";

const gate = readFileSync("tests/fixtures/raw/gate/main/settings/github.toml", "utf8");
const repos = readFileSync("tests/fixtures/raw/infra-config/main/config/repos.toml", "utf8");

function fields(text: string): TomlField[] {
  const scan = scanToml(text);
  if (!scan.ok) throw new Error(scan.reason);
  return scan.fields;
}

function changedLines(a: string, b: string): [string, string][] {
  const x = a.split("\n");
  const y = b.split("\n");
  expect(y.length).toBe(x.length);
  return x.flatMap((line, i) => (line === y[i] ? [] : [[line, y[i]] as [string, string]]));
}

describe("scanToml", () => {
  it("finds every value with its path, its section label and its comment", () => {
    const f = fields(gate);
    const xo = f.find((x) => x.id === "repo[0].allow_auto_merge")!;
    expect(xo.section).toBe("[[repo]] xo-space");
    expect(xo.kind).toBe("boolean");
    expect(xo.value).toBe(false);
    expect(xo.note).toContain("Merge when ready");
    expect(f.find((x) => x.id === "org_workflows[0].enabled")?.section).toBe("[[org_workflows]] qq-drift");
    expect(f.find((x) => x.id === "main.required_approvals")?.kind).toBe("integer");
    expect(f.find((x) => x.id === "repo[3].checks")?.kind).toBe("string-list");
    // Every scanned value is the parsed file's value at that path.
    const parsed = parse(gate) as Record<string, unknown>;
    for (const x of f.filter((x) => x.kind)) {
      let at: unknown = parsed;
      for (const p of x.path) at = (at as Record<string | number, unknown>)[p];
      expect(at, x.id).toEqual(x.value);
    }
  });

  it("resolves arrays of tables nested in an array of tables", () => {
    const f = fields(repos);
    const nested = f.filter((x) => x.id.includes("other_qq_workflows"));
    expect(nested.length).toBeGreaterThan(0);
    for (const x of nested) expect(x.value, x.id).toBeDefined();
    expect(nested[0].id).toMatch(/^repo\[\d+\]\.other_qq_workflows\[0\]\.file$/);
  });

  it("shows multi-line values, dotted keys and inline tables read-only", () => {
    const text = 'a = [\n  "x", # one\n  "y",\n]\nb.c = 1\nd = { e = 1 }\ns = """\nk = 2\n"""\nz = true\n';
    const f = fields(text);
    expect(f.map((x) => [x.key, x.kind])).toEqual([
      ["a", undefined],
      ["b.c", undefined],
      ["d", undefined],
      ["s", undefined],
      ["z", "boolean"],
    ]);
  });

  it("refuses a file that is not TOML", () => {
    expect(scanToml("a = ").ok).toBe(false);
  });
});

describe("applyTomlEdits", () => {
  it("changes only the value, keeping the comment in its column", () => {
    const r = applyTomlEdits(gate, [{ id: "repo[0].allow_auto_merge", from: false, to: true }]);
    if (!r.ok) throw new Error(r.reason);
    expect(changedLines(gate, r.text)).toEqual([
      [
        'allow_auto_merge = false              # suraj (2026-10-04): xo-space PRs land by his own "Merge when ready"',
        'allow_auto_merge = true               # suraj (2026-10-04): xo-space PRs land by his own "Merge when ready"',
      ],
    ]);
  });

  it("writes numbers, lists and strings that parse back to what was asked", () => {
    const tricky = 'he said "hi" \\ then\ttab';
    const text = 'name = "a" # keep\nn = 1\nl = ["x"]\n';
    const r = applyTomlEdits(text, [
      { id: "name", from: "a", to: tricky },
      { id: "n", from: 1, to: 42 },
      { id: "l", from: ["x"], to: ["x", "y z"] },
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(parse(r.text)).toEqual({ name: tricky, n: 42, l: ["x", "y z"] });
    expect(r.text).toContain("# keep");
  });

  it("refuses an edit made against a value the file no longer has", () => {
    const r = applyTomlEdits(gate, [{ id: "repo[0].allow_auto_merge", from: true, to: false }]);
    expect(r).toEqual({ ok: false, reason: "repo[0].allow_auto_merge: the file changed since you loaded it; reload and edit again" });
  });

  it("refuses unknown ids, read-only values and values of the wrong kind", () => {
    expect(applyTomlEdits(gate, [{ id: "nope", from: 1, to: 2 }]).ok).toBe(false);
    expect(applyTomlEdits(gate, [{ id: "release_refs.bypass_integration_ids", from: [5199903], to: [1] }]).ok).toBe(false);
    expect(applyTomlEdits(gate, [{ id: "main.required_approvals", from: 0, to: "1" }]).ok).toBe(false);
    expect(applyTomlEdits(gate, [{ id: "main.required_approvals", from: 0, to: 1.5 }]).ok).toBe(false);
  });

  it("an unchanged value changes nothing", () => {
    const r = applyTomlEdits(gate, [{ id: "main.required_approvals", from: 0, to: 0 }]);
    expect(r.ok && r.text === gate && r.changed.length === 0).toBe(true);
  });
});
