import { parseCodeowners } from "@/lib/editor/codeowners";
import { isPinCommit } from "@/lib/editor/commit-file";
import { GENERATED_NOTE, GENERATED_SHORT, isGenerateInput } from "@/lib/editor/generated";
import { scanToml } from "@/lib/editor/toml-fields";
import type { FieldView, RuleView } from "@/lib/editor/types";

// What the form shows for a file: plain, serialisable values only.

/** One line of text for any parsed TOML value. */
export function displayValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(displayValue).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{ ${Object.entries(value).map(([k, v]) => `${k} = ${displayValue(v)}`).join(", ")} }`;
  return String(value);
}

/** `fileId` decides which values are read by qqcfg generate, and so shown read-only. */
export function tomlView(text: string, fileId: string): { ok: true; fields: FieldView[] } | { ok: false; reason: string } {
  const scan = scanToml(text);
  if (!scan.ok) return scan;
  // The full note once per section, the short one after it.
  const noted = new Set<string>();
  const lockNote = (section: string) => {
    if (noted.has(section)) return GENERATED_SHORT;
    noted.add(section);
    return GENERATED_NOTE;
  };
  return {
    ok: true,
    fields: scan.fields.map((f) => {
      const locked = isGenerateInput(fileId, f, scan.fields);
      return {
      id: f.id,
      key: f.key,
      section: f.section,
      line: f.line,
      kind: locked ? undefined : f.kind,
      value: f.kind && !locked ? (f.value as FieldView["value"]) : undefined,
      locked: locked ? lockNote(f.section) : undefined,
      commitId: isPinCommit(fileId, f.key) ? (true as const) : undefined,
      display: f.id.startsWith("line:") ? String(f.value) : displayValue(f.value),
      note: f.note,
      help: f.help,
      };
    }),
  };
}

export function ownersView(text: string): RuleView[] {
  return parseCodeowners(text).map((r) => ({ pattern: r.pattern, owners: r.owners, help: r.help, line: r.line }));
}
