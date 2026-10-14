import { parse as parseToml } from "smol-toml";

// The settings files are hand-written TOML whose comments carry the reasons behind each value
// ("suraj (2026-10-04): xo-space PRs land by his own Merge when ready"). Re-serialising a parsed
// file would drop every comment, so the editor never does that. It finds the line that holds a
// value and replaces only the value's own characters, keeping the indentation, the spacing and the
// trailing comment. After every edit the whole file is parsed again and must equal the old file
// with exactly the edited values changed (`applyTomlEdits`), so an edit can never touch anything
// else, whatever the scanner got wrong.

/** The kinds of value the editor can change in place. Anything else is shown read-only. */
export type FieldKind = "boolean" | "integer" | "float" | "string" | "string-list";

export type FieldValue = boolean | number | string | string[];

/** One `key = value` line. `path` is where the value sits in the parsed file. */
export type TomlField = {
  /** A stable id: the path in the parsed file, e.g. `repo[3].allow_auto_merge`. */
  id: string;
  path: (string | number)[];
  key: string;
  /** The heading the field sits under, e.g. `[[repo]] xo-space` or `[policy]`. */
  section: string;
  /** 0-based line index of the key. */
  line: number;
  /** The value as parsed. */
  value: unknown;
  /** Set when the value can be edited in place; otherwise the field is read-only. */
  kind?: FieldKind;
  /** The trailing comment on the line, without `#`. */
  note?: string;
  /** Comment lines directly above the key, without `#` (the last few only). */
  help?: string[];
};

export type TomlScan = { ok: true; fields: TomlField[] } | { ok: false; reason: string };

const KEY = /^(\s*)([A-Za-z0-9_-]+)(\s*=\s*)(.*)$/;
const TABLE = /^\s*\[\s*([A-Za-z0-9_.-]+)\s*\]\s*(#.*)?$/;
const ARRAY_TABLE = /^\s*\[\[\s*([A-Za-z0-9_.-]+)\s*\]\]\s*(#.*)?$/;
// Any other assignment: a dotted or quoted key (`platforms."linux-x86_64" = { ... }`). Shown, not edited.
const OTHER_KEY = /^\s*([A-Za-z0-9_"'.-][^=]*?)\s*=\s*(.*)$/;
const MULTILINE_QUOTE = /^("""|''')/;
const NUMBER = /^[+-]?(\d[\d_]*)(\.\d[\d_]*)?([eE][+-]?\d+)?$/;
const HELP_LINES = 3;

/** Where a value token ends on its line, and what follows it. */
type Token = { text: string; start: number; end: number; rest: string };

/**
 * Read the value token at the start of `text` (after `key = `). Returns undefined for a value
 * that does not end on this line (a multi-line array or string) or that the scanner does not
 * understand; such a field is read-only.
 */
function readToken(text: string, offset: number): Token | undefined {
  const s = text;
  if (s.startsWith('"""') || s.startsWith("'''")) return undefined;
  let end = -1;
  if (s.startsWith('"')) {
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "\\") i++;
      else if (s[i] === '"') {
        end = i + 1;
        break;
      }
    }
  } else if (s.startsWith("'")) {
    const close = s.indexOf("'", 1);
    end = close === -1 ? -1 : close + 1;
  } else if (s.startsWith("[")) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') {
        for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === "\\") i++;
      } else if (c === "'") {
        i = s.indexOf("'", i + 1);
        if (i === -1) return undefined;
      } else if (c === "#") {
        return undefined; // a comment inside an array: the array goes on past this line
      } else if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
  } else if (s.startsWith("{")) {
    return undefined;
  } else {
    const m = /^[^\s#]+/.exec(s);
    end = m ? m[0].length : -1;
  }
  if (end <= 0) return undefined;
  const rest = s.slice(end);
  if (!/^\s*(#.*)?$/.test(rest)) return undefined;
  return { text: s.slice(0, end), start: offset, end: offset + end, rest };
}

function kindOf(token: string, value: unknown): FieldKind | undefined {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return token.startsWith('"') || token.startsWith("'") ? "string" : undefined;
  if (typeof value === "number") {
    if (!NUMBER.test(token)) return undefined; // inf, nan, hex, octal: shown, not edited
    return Number.isInteger(value) && !token.includes(".") && !/e/i.test(token) ? "integer" : "float";
  }
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return "string-list";
  return undefined;
}

export function pathId(path: (string | number)[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? p : `.${p}`)).join("");
}

function getAt(root: unknown, path: (string | number)[]): unknown {
  let at: unknown = root;
  for (const p of path) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string | number, unknown>)[p];
  }
  return at;
}

/** Find every `key = value` in a TOML file, with where it sits in the parsed file. */
export function scanToml(text: string): TomlScan {
  let parsed: unknown;
  try {
    parsed = parseToml(text);
  } catch (error) {
    return { ok: false, reason: `not valid TOML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  }
  const lines = text.split("\n");
  const fields: TomlField[] = [];
  // The current table, resolved to a path in the parsed file.
  let table: (string | number)[] = [];
  let section = "(top)";
  // How many elements each array of tables has so far, by its resolved parent path and name.
  const counts = new Map<string, number>();
  // The latest element index of each array of tables, by its dotted name, so `[repo.deploy]`
  // after the third `[[repo]]` resolves to repo[2].deploy.
  const latest = new Map<string, number>();
  // A multi-line value is skipped until its brackets close, or its multi-line string ends.
  let skipDepth = 0;
  let skipUntil: string | undefined;
  const skipFrom = (rhs: string) => {
    const quote = MULTILINE_QUOTE.exec(rhs)?.[1];
    if (quote && !rhs.slice(3).includes(quote)) skipUntil = quote;
    else if (rhs.trimStart().startsWith("[") && !readToken(rhs, 0)) skipDepth = bracketBalance(rhs);
  };

  // Every array of tables named on the way down resolves to its latest element; `indexLast` is
  // false for a `[table]` header, whose own last name is the table itself.
  const resolve = (names: string[], indexLast: boolean): (string | number)[] => {
    const out: (string | number)[] = [];
    for (let i = 0; i < names.length; i++) {
      out.push(names[i]);
      const dotted = names.slice(0, i + 1).join(".");
      if ((indexLast || i < names.length - 1) && latest.has(dotted)) out.push(latest.get(dotted)!);
    }
    return out;
  };

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (skipUntil) {
      if (line.includes(skipUntil)) skipUntil = undefined;
      continue;
    }
    if (skipDepth > 0) {
      skipDepth += bracketBalance(line);
      continue;
    }
    const aot = ARRAY_TABLE.exec(line);
    if (aot) {
      const names = aot[1].split(".");
      const parent = resolve(names.slice(0, -1), true);
      const key = `${pathId(parent)}/${names.at(-1)}`;
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      latest.set(names.join("."), index);
      // A new element resets the indexes of any arrays nested under the old one.
      for (const k of [...latest.keys()]) if (k.startsWith(`${names.join(".")}.`)) latest.delete(k);
      table = [...parent, names.at(-1)!, index];
      section = `[[${aot[1]}]]`;
      continue;
    }
    const tbl = TABLE.exec(line);
    if (tbl) {
      table = resolve(tbl[1].split("."), false);
      section = `[${tbl[1]}]`;
      continue;
    }
    const kv = KEY.exec(line);
    if (!kv) {
      const other = /^\s*#/.test(line) ? null : OTHER_KEY.exec(line);
      if (other) {
        fields.push({ id: `line:${n + 1}`, path: [], key: other[1], section, line: n, value: other[2].replace(/\s+#.*$/, "") });
        skipFrom(other[2]);
      }
      continue;
    }
    const [, indent, key, eq, rhs] = kv;
    const path = [...table, key];
    const value = getAt(parsed, path);
    const token = readToken(rhs, indent.length + key.length + eq.length);
    if (!token) skipFrom(rhs);
    const help: string[] = [];
    for (let k = n - 1; k >= 0 && help.length < HELP_LINES; k--) {
      const c = /^\s*#\s?(.*)$/.exec(lines[k]);
      if (!c) break;
      help.unshift(c[1]);
    }
    const note = token ? /^\s*#\s?(.*)$/.exec(token.rest)?.[1] : undefined;
    fields.push({
      id: pathId(path),
      path,
      key,
      section,
      line: n,
      value,
      kind: token && value !== undefined ? kindOf(token.text, value) : undefined,
      note: note || undefined,
      help: help.length ? help : undefined,
    });
  }
  labelSections(fields, parsed);
  return { ok: true, fields };
}

/** Count `[` minus `]` outside strings and comments. */
function bracketBalance(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "#") break;
    if (c === '"') {
      for (i++; i < line.length && line[i] !== '"'; i++) {
        if (line[i] === "\\") i++;
      }
    } else if (c === "'") {
      const close = line.indexOf("'", i + 1);
      if (close === -1) break;
      i = close;
    } else if (c === "[") depth++;
    else if (c === "]") depth--;
  }
  return depth;
}

/** `[[repo]]` becomes `[[repo]] xo-space`: the element's name, ruleset or file says which one it is. */
function labelSections(fields: TomlField[], parsed: unknown): void {
  for (const f of fields) {
    if (!f.section.startsWith("[[")) continue;
    const at = f.path.findLastIndex((p) => typeof p === "number");
    if (at < 0) continue;
    const element = getAt(parsed, f.path.slice(0, at + 1));
    if (element && typeof element === "object") {
      const e = element as Record<string, unknown>;
      const label = [e.name, e.ruleset, e.file, e.property].find((v) => typeof v === "string");
      if (typeof label === "string") f.section = `${f.section} ${label}`;
    }
  }
}

/** The TOML text for a value of the given kind. */
export function formatValue(kind: FieldKind, value: FieldValue): string {
  switch (kind) {
    case "boolean":
      return value ? "true" : "false";
    case "integer":
    case "float":
      return String(value);
    case "string":
      return tomlString(String(value));
    case "string-list":
      return `[${(value as string[]).map(tomlString).join(", ")}]`;
  }
}

function tomlString(s: string): string {
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
}

/** Check a value against the field's kind; the reason is one line a person can act on. */
export function checkValue(kind: FieldKind, value: unknown): { ok: true; value: FieldValue } | { ok: false; reason: string } {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false, reason: "must be on or off" };
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, reason: "must be a whole number" };
    case "float":
      return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: "must be a number" };
    case "string":
      return typeof value === "string" && value.length <= 2000 ? { ok: true, value } : { ok: false, reason: "must be text" };
    case "string-list":
      return Array.isArray(value) && value.length <= 200 && value.every((v) => typeof v === "string" && v.length <= 500)
        ? { ok: true, value }
        : { ok: false, reason: "must be a list of text" };
  }
}

export type TomlEdit = { id: string; from: unknown; to: unknown };

export type EditResult = { ok: true; text: string; changed: { field: TomlField; to: FieldValue }[] } | { ok: false; reason: string };

/**
 * Apply edits to a TOML file, line by line. Each edit names a field by id and the value the person
 * saw (`from`); if the file now says something else, the edit is refused rather than applied over
 * a change they never saw. The result is parsed again and must equal the old file with only the
 * edited values changed.
 */
export function applyTomlEdits(text: string, edits: TomlEdit[]): EditResult {
  const scan = scanToml(text);
  if (!scan.ok) return scan;
  const byId = new Map(scan.fields.map((f) => [f.id, f]));
  const lines = text.split("\n");
  const changed: { field: TomlField; to: FieldValue }[] = [];
  const seen = new Set<string>();
  for (const edit of edits) {
    const field = byId.get(edit.id);
    if (!field) return { ok: false, reason: `${edit.id}: no such setting in the file` };
    if (seen.has(edit.id)) return { ok: false, reason: `${edit.id}: edited twice` };
    seen.add(edit.id);
    if (!field.kind) return { ok: false, reason: `${edit.id}: this value cannot be edited here; change it on GitHub` };
    if (!sameValue(field.value, edit.from)) return { ok: false, reason: `${edit.id}: the file changed since you loaded it; reload and edit again` };
    const checked = checkValue(field.kind, edit.to);
    if (!checked.ok) return { ok: false, reason: `${edit.id}: ${checked.reason}` };
    if (sameValue(field.value, checked.value)) continue;
    const kv = KEY.exec(lines[field.line]);
    if (!kv) return { ok: false, reason: `${edit.id}: could not find the line` };
    const [, indent, key, eq, rhs] = kv;
    const token = readToken(rhs, indent.length + key.length + eq.length);
    if (!token) return { ok: false, reason: `${edit.id}: could not find the value on its line` };
    const line = lines[field.line];
    const next = formatValue(field.kind, checked.value);
    lines[field.line] = line.slice(0, token.start) + next + keepCommentColumn(token.rest, next.length - token.text.length);
    changed.push({ field, to: checked.value });
  }
  const out = lines.join("\n");
  let before: unknown;
  let after: unknown;
  try {
    before = parseToml(text);
    after = parseToml(out);
  } catch (error) {
    return { ok: false, reason: `the edited file is not valid TOML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  }
  const expected = structuredClone(before) as Record<string, unknown>;
  for (const c of changed) setAt(expected, c.field.path, c.to);
  if (!sameValue(expected, after)) return { ok: false, reason: "the edit would change more than the chosen values; nothing was changed" };
  return { ok: true, text: out, changed };
}

/** Keep a trailing comment in its column where the spaces allow, and at least one space away. */
function keepCommentColumn(rest: string, grew: number): string {
  const m = /^(\s+)(#.*)$/.exec(rest);
  if (!m) return rest;
  return " ".repeat(Math.max(1, m[1].length - grew)) + m[2];
}

function setAt(root: Record<string | number, unknown>, path: (string | number)[], value: unknown): void {
  let at: Record<string | number, unknown> = root;
  for (const p of path.slice(0, -1)) at = at[p] as Record<string | number, unknown>;
  at[path.at(-1)!] = value;
}

/** Deep equality for parsed TOML values (plain objects, arrays, scalars, dates). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
