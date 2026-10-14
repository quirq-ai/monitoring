import type { FieldView } from "@/lib/editor/types";

// A file that holds one commit id and nothing else (rollers' infra-config.commit). It is shown and
// edited as one field, and the edit keeps the file's own trailing newline.

const SHA = /^[0-9a-f]{40}$/;

/** Why `value` is not a commit id, or undefined when it is one. */
export function checkCommit(value: unknown): string | undefined {
  return typeof value === "string" && SHA.test(value) ? undefined : "a commit is 40 lowercase hex characters";
}

/** A pins.toml `commit = "..."`: the form and the server both hold it to a commit id. */
export function isPinCommit(fileId: string, key: string): boolean {
  return fileId.endsWith("/pins.toml") && key === "commit";
}

export function readCommit(text: string): { ok: true; sha: string } | { ok: false; reason: string } {
  const sha = text.replace(/\n$/, "");
  return SHA.test(sha) ? { ok: true, sha } : { ok: false, reason: "expected one 40-character commit id and nothing else" };
}

export function commitView(text: string): { ok: true; fields: FieldView[] } | { ok: false; reason: string } {
  const read = readCommit(text);
  if (!read.ok) return read;
  return { ok: true, fields: [{ id: "commit", key: "commit", section: "pinned commit", line: 0, kind: "string", value: read.sha, display: JSON.stringify(read.sha), commitId: true }] };
}

export function applyCommitEdit(
  text: string,
  edits: { id: string; from: unknown; to: unknown }[],
): { ok: true; text: string; summary: string[] } | { ok: false; reason: string } {
  const read = readCommit(text);
  if (!read.ok) return read;
  if (edits.length !== 1 || edits[0].id !== "commit") return { ok: false, reason: "expected one edit of the commit" };
  const { from, to } = edits[0];
  if (from !== read.sha) return { ok: false, reason: `changed since you loaded it (now ${read.sha.slice(0, 7)}); reload and edit again` };
  const bad = checkCommit(to);
  if (bad || typeof to !== "string") return { ok: false, reason: bad ?? "a commit is text" };
  return { ok: true, text: text.replace(read.sha, to), summary: [`commit: ${read.sha.slice(0, 7)} → ${to.slice(0, 7)}`] };
}
