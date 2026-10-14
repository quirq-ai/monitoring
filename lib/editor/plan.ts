import "server-only";
import { createHash } from "node:crypto";
import type { SettingsFile } from "@/config/settings";
import { applyOwnersEdits, ownersFor } from "@/lib/editor/codeowners";
import { applyCommitEdit, checkCommit, isPinCommit } from "@/lib/editor/commit-file";
import { lineDiff } from "@/lib/editor/diff";
import { checkPropertyValue } from "@/lib/editor/properties";
import { GENERATED_NOTE, isGenerateInput } from "@/lib/editor/generated";
import { applyTomlEdits, scanToml } from "@/lib/editor/toml-fields";
import { displayValue } from "@/lib/editor/view";
import type { EditRequest, PlannedFileView } from "@/lib/editor/types";
import { ORG } from "@/lib/fetch";
import { readProperties, readSettingsFile, settingsCatalog } from "@/lib/sources/settings";

// An edit request becomes a plan: one pull request per repo (each changed file one commit on a
// new branch), plus the property changes that have no file. The server builds it from its own
// read of every file, never from text the browser sent, and the same plan is what the review
// screen shows, what the gh script does and what the local editor does.

export type PlannedFile = {
  file: SettingsFile;
  /** The blob the edit was made against; null for a new file. */
  baseSha: string | null;
  before: string;
  after: string;
  summary: string[];
};

/** `reviewers`: who the repo's CODEOWNERS on main asks to review these paths (empty: nobody named). */
export type PlannedPr = { repo: string; title: string; body: string; files: PlannedFile[]; reviewers: string[] };

export type PlannedProperty = {
  repo: string;
  name: string;
  from: string | null;
  to: string | null;
  /** Where GitHub takes the write: the repo's own endpoint when repo admins may set it, else the org's. */
  endpoint: "repo" | "org";
};

export type Plan = { prs: PlannedPr[]; properties: PlannedProperty[]; digest: string };

export const EDITOR_URL = "https://monitoring.quirq.dev/settings";

export async function buildPlan(request: EditRequest): Promise<{ ok: true; plan: Plan } | { ok: false; reason: string }> {
  if (request.files.length === 0 && request.properties.length === 0) return { ok: false, reason: "nothing to change" };
  const catalog = await settingsCatalog();
  const byId = new Map(catalog.files.map((f) => [f.id, f]));
  const planned: PlannedFile[] = [];
  const seen = new Set<string>();
  for (const edit of request.files) {
    const file = byId.get(edit.id);
    if (!file) return { ok: false, reason: `${edit.id}: not a settings file the editor knows` };
    if (seen.has(file.id)) return { ok: false, reason: `${file.id}: listed twice` };
    if (file.readOnly) return { ok: false, reason: `${file.path} in ${file.repo}: ${file.readOnly}` };
    seen.add(file.id);
    const read = await readSettingsFile(file);
    if (!read.ok) return { ok: false, reason: read.reason };
    const { text, blobSha } = read.value;
    let after: string;
    let summary: string[];
    if (file.format === "toml") {
      if (edit.owners?.length || !edit.toml?.length) return { ok: false, reason: `${file.id}: expected value edits` };
      const scan = scanToml(text);
      if (scan.ok) {
        const locked = scan.fields.find((f) => isGenerateInput(file.id, f, scan.fields) && edit.toml!.some((e) => e.id === f.id));
        if (locked) return { ok: false, reason: `${file.path} ${locked.section} ${locked.key}: ${GENERATED_NOTE}` };
        for (const e of edit.toml) {
          const f = scan.fields.find((x) => x.id === e.id);
          const bad = f && isPinCommit(file.id, f.key) ? checkCommit(e.to) : undefined;
          if (bad) return { ok: false, reason: `${file.repo} ${file.path} ${f!.section} commit: ${bad}` };
        }
      }
      const result = applyTomlEdits(text, edit.toml);
      if (!result.ok) return { ok: false, reason: `${file.path}: ${result.reason}` };
      after = result.text;
      summary = result.changed.map((c) => `${c.field.section} ${c.field.key}: ${displayValue(c.field.value)} → ${displayValue(c.to)}`);
    } else if (file.format === "commit") {
      if (edit.owners?.length || !edit.toml?.length) return { ok: false, reason: `${file.id}: expected a commit edit` };
      const result = applyCommitEdit(text, edit.toml);
      if (!result.ok) return { ok: false, reason: `${file.repo} ${file.path}: ${result.reason}` };
      after = result.text;
      summary = result.summary;
    } else {
      if (edit.toml?.length || !edit.owners?.length) return { ok: false, reason: `${file.id}: expected owner edits` };
      const result = applyOwnersEdits(text, edit.owners);
      if (!result.ok) return { ok: false, reason: `${file.repo} CODEOWNERS: ${result.reason}` };
      after = result.text;
      summary = result.summary;
    }
    if (after === text) continue;
    planned.push({ file, baseSha: blobSha, before: text, after, summary });
  }

  const properties: PlannedProperty[] = [];
  if (request.properties.length) {
    const live = await readProperties();
    if (!live.ok) return { ok: false, reason: live.reason };
    const pairs = new Set<string>();
    for (const p of request.properties) {
      const def = live.value.defs.find((d) => d.name === p.name);
      if (!def) return { ok: false, reason: `${p.name}: not an org property` };
      const repo = live.value.repos.find((r) => r.repo === p.repo);
      if (!repo) return { ok: false, reason: `${p.repo}: not a repo in the org's property list` };
      if (pairs.has(`${p.repo}/${p.name}`)) return { ok: false, reason: `${p.repo} ${p.name}: listed twice` };
      pairs.add(`${p.repo}/${p.name}`);
      const current = repo.values[p.name] ?? null;
      if (Array.isArray(current)) return { ok: false, reason: `${p.repo} ${p.name}: a multi select; change it on GitHub` };
      if (current !== p.from) return { ok: false, reason: `${p.repo} ${p.name}: changed since you loaded it (now ${current ?? "not set"}); reload and edit again` };
      const to = p.to === "" ? null : p.to;
      const problem = checkPropertyValue(def, to);
      if (problem) return { ok: false, reason: `${p.repo}: ${problem}` };
      if (to === current) continue;
      properties.push({ repo: p.repo, name: p.name, from: current, to, endpoint: def.editableBy === "org_and_repo_actors" ? "repo" : "org" });
    }
  }
  if (planned.length === 0 && properties.length === 0) return { ok: false, reason: "nothing to change: every value is what the file already says" };

  const repos = [...new Set(planned.map((p) => p.file.repo))];
  const prs: PlannedPr[] = [];
  for (const repo of repos) {
    const files = planned.filter((p) => p.file.repo === repo);
    const reviewers = await codeReviewers(repo, files, catalog.files);
    if (!reviewers.ok) return reviewers;
    prs.push({ repo, title: prTitle(files), body: prBody(files, reviewers.owners), files, reviewers: reviewers.owners });
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ files: planned.map((p) => [p.file.id, p.baseSha, p.after]), properties }))
    .digest("hex");
  return { ok: true, plan: { prs, properties, digest } };
}

function prTitle(files: PlannedFile[]): string {
  const lines = files.flatMap((f) => f.summary);
  if (lines.length === 1) return `Settings: ${lines[0]}`.slice(0, 200);
  return `Settings: ${lines.length} changes in ${files.map((f) => f.file.path).join(", ")}`.slice(0, 200);
}

/**
 * Who must review the pull request: the owners the repo's CODEOWNERS on main names for the edited
 * paths (an edit to CODEOWNERS itself is reviewed under the rules it replaces, as on GitHub).
 */
async function codeReviewers(repo: string, files: PlannedFile[], catalog: SettingsFile[]): Promise<{ ok: true; owners: string[] } | { ok: false; reason: string }> {
  const owners = catalog.find((f) => f.repo === repo && f.format === "codeowners");
  if (!owners) return { ok: true, owners: [] };
  const read = await readSettingsFile(owners);
  if (!read.ok) return { ok: false, reason: `${repo}: could not read its CODEOWNERS to say who reviews this: ${read.reason}` };
  return { ok: true, owners: [...new Set(files.flatMap((f) => ownersFor(read.value.text, f.file.path)))] };
}

/**
 * One line on who reviews, for the review screen and the pull request. GitHub does not enforce it
 * here (gate's settings ask for no approvals and no code-owner review); waiting for the code owner
 * is the project's own rule, so the line says that and no more.
 */
export function reviewNote(reviewers: string[]): string {
  if (reviewers.length === 0) return "The repo's CODEOWNERS names no owner for these paths.";
  return `The repo's CODEOWNERS assigns these paths to ${reviewers.join(", ")}, and the project waits for that review before merging. That is the project's rule, not a GitHub setting.`;
}

function prBody(files: PlannedFile[], reviewers: string[]): string {
  const parts = [`Opened with the monitoring settings editor (${EDITOR_URL}).`, "", reviewNote(reviewers), ""];
  for (const f of files) {
    parts.push(`**${f.file.path}**${f.baseSha ? "" : " (new file)"}`, "", ...f.summary.map((s) => `- ${s}`), "", `After merge: ${f.file.effect}`, "");
  }
  return parts.join("\n").trimEnd();
}

export function commitMessage(f: PlannedFile): string {
  return [`settings: ${f.file.path}`, "", ...f.summary.map((s) => `- ${s}`)].join("\n");
}

/** The repo's file path in the contents API. */
export function contentsPath(f: PlannedFile): string {
  return `repos/${ORG}/${f.file.repo}/contents/${f.file.path}`;
}

export function planFiles(plan: Plan): PlannedFileView[][] {
  return plan.prs.map((pr) =>
    pr.files.map((f) => ({
      id: f.file.id,
      path: f.file.path,
      title: f.file.title,
      created: f.baseSha === null,
      summary: f.summary,
      diff: lineDiff(f.before, f.after),
      effect: f.file.effect,
    })),
  );
}
