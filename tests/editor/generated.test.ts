import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERATED_NOTE, GENERATED_SHORT } from "@/lib/editor/generated";
import { tomlView } from "@/lib/editor/view";

const config = (name: string) => readFileSync(`tests/fixtures/raw/infra-config/main/config/${name}`, "utf8");

function view(name: string) {
  const v = tomlView(config(name), `infra-config/config/${name}`);
  if (!v.ok) throw new Error(v.reason);
  return v.fields;
}
const locked = (fields: ReturnType<typeof view>, id: string) => {
  const f = fields.find((x) => x.id === id);
  if (!f) throw new Error(`no field ${id}`);
  return f.locked !== undefined;
};

describe("values qqcfg generate reads", () => {
  it("locks a pool's runner and name, and the names builders and repos refer to", () => {
    const org = view("org.toml");
    expect(locked(org, "pool[0].github.runs_on")).toBe(true);
    expect(locked(org, "pool[1].github.runs_on")).toBe(true);
    expect(locked(org, "pool[0].name")).toBe(true);
    expect(locked(org, "pool[0].secrets")).toBe(false);
    const kinds = view("kinds.toml");
    expect(locked(kinds, "kind[0].name")).toBe(true);
    expect(locked(kinds, "toolchain[0].pin")).toBe(true);
    expect(locked(view("repos.toml"), "repo[0].name")).toBe(true);
  });

  it("leaves what generate does not read editable", () => {
    expect(locked(view("kinds.toml"), "toolchain[0].track")).toBe(false);
    expect(locked(view("pipelines.toml"), "defaults.drift_grace_days")).toBe(false);
    expect(locked(view("pipelines.toml"), "defaults.timeout_minutes")).toBe(true);
  });

  it("gives the full note once per section and the short one after it", () => {
    const fields = view("pipelines.toml").filter((f) => f.locked);
    const sections = new Set(fields.map((f) => f.section));
    for (const section of sections) {
      const notes = fields.filter((f) => f.section === section).map((f) => f.locked);
      expect(notes[0]).toBe(GENERATED_NOTE);
      expect(notes.slice(1).every((n) => n === GENERATED_SHORT)).toBe(true);
    }
    expect(fields.filter((f) => f.locked === GENERATED_NOTE)).toHaveLength(sections.size);
  });
});
