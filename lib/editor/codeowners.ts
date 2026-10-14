// CODEOWNERS: one rule per line, `<pattern> <owner> <owner>...`, comments on lines of their own.
// The editor changes the owners of a rule, adds a rule at the end or removes one. Comments and
// every other line stay byte for byte, as in the TOML editor.

export type OwnerRule = {
  /** 0-based line index. */
  line: number;
  pattern: string;
  owners: string[];
  /** Comment lines directly above the rule, without `#` (the last few only). */
  help?: string[];
};

/** `@user`, `@org/team` or an email address, as GitHub accepts them. */
const OWNER = /^(@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9._-]{1,100})?|[^\s@]+@[^\s@]+\.[^\s@]+)$/;
/** No space, no leading `#` or `!` (GitHub does not support negation), not too long. */
const PATTERN = /^[^\s#!][^\s]{0,499}$/;

export function parseCodeowners(text: string): OwnerRule[] {
  const lines = text.split("\n");
  const rules: OwnerRule[] = [];
  lines.forEach((raw, line) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    // A trailing `#` comment is not part of the owners.
    const [pattern, ...owners] = trimmed.replace(/\s+#.*$/, "").split(/\s+/);
    const help: string[] = [];
    for (let k = line - 1; k >= 0 && help.length < 3; k--) {
      const c = /^\s*#\s?(.*)$/.exec(lines[k]);
      if (!c) break;
      help.unshift(c[1]);
    }
    rules.push({ line, pattern, owners, help: help.length ? help : undefined });
  });
  return rules;
}

export function checkOwners(owners: string[]): string | undefined {
  const bad = owners.find((o) => !OWNER.test(o));
  return bad === undefined ? undefined : `${bad} is not an owner: use @user, @org/team or an email address`;
}

export function checkPattern(pattern: string): string | undefined {
  return PATTERN.test(pattern) ? undefined : `${pattern || "(empty)"} is not a path pattern`;
}

/** Owners typed as one line, split on spaces and commas. */
export function splitOwners(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean);
}

export type OwnersEdit =
  | { op: "set"; pattern: string; from: string[]; to: string[] }
  | { op: "add"; pattern: string; to: string[] }
  | { op: "remove"; pattern: string; from: string[] };

export type OwnersResult = { ok: true; text: string; summary: string[] } | { ok: false; reason: string };

/**
 * Apply edits to a CODEOWNERS file. A rule is found by its pattern (the last rule for a pattern
 * wins on GitHub, so that is the one edited) and must still have the owners the person saw.
 */
export function applyOwnersEdits(text: string, edits: OwnersEdit[]): OwnersResult {
  const lines = text.split("\n");
  const summary: string[] = [];
  const added: string[] = [];
  const removed = new Set<number>();
  const touched = new Set<string>();
  for (const edit of edits) {
    const patternProblem = checkPattern(edit.pattern);
    if (patternProblem) return { ok: false, reason: patternProblem };
    if (touched.has(edit.pattern)) return { ok: false, reason: `${edit.pattern}: edited twice` };
    touched.add(edit.pattern);
    const rule = parseCodeowners(lines.join("\n")).findLast((r) => r.pattern === edit.pattern);
    if (edit.op === "add") {
      if (rule) return { ok: false, reason: `${edit.pattern} already has a rule; change its owners instead` };
      const problem = checkOwners(edit.to);
      if (problem) return { ok: false, reason: problem };
      added.push([edit.pattern, ...edit.to].join(" "));
      summary.push(`add ${edit.pattern}: ${edit.to.join(" ") || "(no owner)"}`);
      continue;
    }
    if (!rule) return { ok: false, reason: `${edit.pattern}: no such rule in the file` };
    if (rule.owners.join(" ") !== edit.from.join(" ")) {
      return { ok: false, reason: `${edit.pattern}: the file changed since you loaded it; reload and edit again` };
    }
    if (edit.op === "remove") {
      removed.add(rule.line);
      summary.push(`remove ${edit.pattern} (was ${edit.from.join(" ") || "no owner"})`);
      continue;
    }
    const problem = checkOwners(edit.to);
    if (problem) return { ok: false, reason: problem };
    if (edit.to.join(" ") === edit.from.join(" ")) continue;
    // Keep the pattern's own spacing: replace what follows the pattern up to any trailing comment.
    const raw = lines[rule.line];
    const at = raw.indexOf(rule.pattern) + rule.pattern.length;
    const comment = /\s+#.*$/.exec(raw.slice(at))?.[0] ?? "";
    const gap = /^\s+/.exec(raw.slice(at))?.[0] ?? " ";
    lines[rule.line] = raw.slice(0, at) + (edit.to.length ? gap + edit.to.join(" ") : "") + comment;
    summary.push(`${edit.pattern}: ${edit.from.join(" ") || "(no owner)"} → ${edit.to.join(" ") || "(no owner)"}`);
  }
  let out = lines.filter((_, i) => !removed.has(i));
  if (added.length) {
    const hadNewline = out.at(-1) === "";
    if (hadNewline) out = out.slice(0, -1);
    out = [...out, ...added, ...(hadNewline || out.length === 0 ? [""] : [])];
  }
  return { ok: true, text: out.join("\n"), summary };
}
