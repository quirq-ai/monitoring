import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOwnersEdits, checkOwners, ownersFor, parseCodeowners } from "@/lib/editor/codeowners";

const gate = readFileSync("tests/fixtures/raw/gate/main/.github/CODEOWNERS", "utf8");

describe("CODEOWNERS", () => {
  it("reads rules with the comment above each", () => {
    const rules = parseCodeowners(gate);
    const settings = rules.find((r) => r.pattern === "/settings/")!;
    expect(settings.owners).toEqual(["@sharmasuraj0123"]);
    expect(settings.help?.at(-1)).toContain("rulesets");
  });

  it("changes, adds and removes rules and leaves every other line alone", () => {
    const r = applyOwnersEdits(gate, [
      { op: "set", pattern: "/settings/", from: ["@sharmasuraj0123"], to: ["@sharmasuraj0123", "@quirq-ai/infra"] },
      { op: "remove", pattern: "/timing/", from: ["@sharmasuraj0123"] },
      { op: "add", pattern: "/docs/", to: ["@sam-example"] },
    ]);
    if (!r.ok) throw new Error(r.reason);
    const before = gate.split("\n");
    const after = r.text.split("\n");
    expect(after).toContain("/settings/               @sharmasuraj0123 @quirq-ai/infra");
    expect(after.some((l) => l.startsWith("/timing/"))).toBe(false);
    expect(after.at(-2)).toBe("/docs/ @sam-example");
    expect(after.at(-1)).toBe("");
    expect(before.filter((l) => l.startsWith("#"))).toEqual(after.filter((l) => l.startsWith("#")));
    expect(r.summary).toHaveLength(3);
  });

  it("refuses bad owners, unknown or stale rules and duplicate adds", () => {
    expect(checkOwners(["sharmasuraj0123"])).toMatch(/not an owner/);
    expect(checkOwners(["@a/b", "x@y.dev"])).toBeUndefined();
    expect(applyOwnersEdits(gate, [{ op: "set", pattern: "/settings/", from: ["@someone"], to: [] }]).ok).toBe(false);
    expect(applyOwnersEdits(gate, [{ op: "set", pattern: "/nope/", from: [], to: ["@a"] }]).ok).toBe(false);
    expect(applyOwnersEdits(gate, [{ op: "add", pattern: "/src/", to: ["@a"] }]).ok).toBe(false);
    expect(applyOwnersEdits(gate, [{ op: "add", pattern: "!x", to: ["@a"] }]).ok).toBe(false);
  });

  it("creates a file from nothing", () => {
    const r = applyOwnersEdits("", [{ op: "add", pattern: "*", to: ["@a"] }]);
    expect(r.ok && r.text).toBe("* @a\n");
  });
});

describe("ownersFor", () => {
  const text = ["*            @all", "/config/     @policy", "docs/        @docs", "*.md         @writers", "/pins.toml   @pins", "/src/a/**/b  @deep"].join("\n");
  it("takes the last matching rule, as GitHub does", () => {
    expect(ownersFor(text, "config/gate.toml")).toEqual(["@policy"]);
    expect(ownersFor(text, "config/README.md")).toEqual(["@writers"]);
    expect(ownersFor(text, "pins.toml")).toEqual(["@pins"]);
    expect(ownersFor(text, "x/pins.toml")).toEqual(["@all"]);
    expect(ownersFor(text, "a/docs/x.txt")).toEqual(["@docs"]);
    expect(ownersFor(text, "src/a/x/y/b")).toEqual(["@deep"]);
    expect(ownersFor("/settings/ @s", "settings/github.toml")).toEqual(["@s"]);
    expect(ownersFor("/settings/ @s", "other.toml")).toEqual([]);
  });
});
