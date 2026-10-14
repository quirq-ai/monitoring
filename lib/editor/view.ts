import { parseCodeowners } from "@/lib/editor/codeowners";
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

/** `readOnly` shows every value as text: the file says it is edited some other way. */
export function tomlView(text: string, readOnly = false): { ok: true; fields: FieldView[] } | { ok: false; reason: string } {
  const scan = scanToml(text);
  if (!scan.ok) return scan;
  return {
    ok: true,
    fields: scan.fields.map((f) => ({
      id: f.id,
      key: f.key,
      section: f.section,
      line: f.line,
      kind: readOnly ? undefined : f.kind,
      value: f.kind && !readOnly ? (f.value as FieldView["value"]) : undefined,
      display: f.id.startsWith("line:") ? String(f.value) : displayValue(f.value),
      note: f.note,
      help: f.help,
    })),
  };
}

export function ownersView(text: string): RuleView[] {
  return parseCodeowners(text).map((r) => ({ pattern: r.pattern, owners: r.owners, help: r.help, line: r.line }));
}
