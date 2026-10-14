import "server-only";
import { z } from "zod";
import { ghLogin, ghRead, ghWrite } from "@/lib/editor/gh";
import { buildPlan, commitMessage, contentsPath, type Plan } from "@/lib/editor/plan";
import type { ApplyStep, ApplyView, EditRequest } from "@/lib/editor/types";
import { ORG } from "@/lib/fetch";

// The local editor carries a plan out through the person's own gh, in the same order as the
// script: read everything live and stop before the first write if anything moved, then one branch
// and pull request per repo, then the property changes. A failure stops there and says what was
// already done.

export async function applyEdits(request: EditRequest, reviewedDigest: string, stamp: Date = new Date()): Promise<ApplyView> {
  const built = await buildPlan(request);
  if (!built.ok) return { ok: false, reason: built.reason, steps: [] };
  const plan = built.plan;
  if (plan.digest !== reviewedDigest) return { ok: false, reason: "the change is not the one you reviewed (a file moved on main); review it again", steps: [] };
  const login = await ghLogin();
  if (!login.ok) return { ok: false, reason: login.reason, steps: [] };

  const stale = await liveCheck(plan);
  if (stale) return { ok: false, login: login.login, reason: `${stale} Nothing was written.`, steps: [] };

  const steps: ApplyStep[] = [];
  const suffix = stamp.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  for (const pr of plan.prs) {
    const branch = `settings-editor/${pr.repo}-${suffix}`;
    const base = await ghRead<{ object?: { sha?: unknown } }>(`repos/${ORG}/${pr.repo}/git/ref/heads/main`);
    const baseSha = base.ok ? base.data.object?.sha : undefined;
    if (typeof baseSha !== "string") return stop(login.login, steps, `could not read ${pr.repo} main${base.ok ? "" : `: ${base.reason}`}`);
    const ref = await ghWrite("POST", `repos/${ORG}/${pr.repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: baseSha });
    if (!ref.ok) return stop(login.login, steps, `could not create a branch in ${pr.repo} (do you have write access?): ${ref.reason}`);
    for (const f of pr.files) {
      const body: Record<string, string> = { message: commitMessage(f), content: Buffer.from(f.after, "utf8").toString("base64"), branch };
      if (f.baseSha) body.sha = f.baseSha;
      const put = await ghWrite("PUT", contentsPath(f), body);
      if (!put.ok) return stop(login.login, steps, `could not write ${f.file.path} on ${branch} in ${pr.repo}: ${put.reason}`);
    }
    const opened = await ghWrite<{ html_url?: unknown }>("POST", `repos/${ORG}/${pr.repo}/pulls`, { title: pr.title, head: branch, base: "main", body: pr.body });
    if (!opened.ok) return stop(login.login, steps, `${branch} is pushed in ${pr.repo} but the pull request was not opened: ${opened.reason}`);
    const url = typeof opened.data.html_url === "string" && opened.data.html_url.startsWith("https://github.com/") ? opened.data.html_url : undefined;
    steps.push({ what: `Pull request on ${pr.repo}: ${pr.title}`, ok: true, url });
  }
  for (const p of plan.properties) {
    const value = { property_name: p.name, value: p.to };
    const res =
      p.endpoint === "repo"
        ? await ghWrite("PATCH", `repos/${ORG}/${p.repo}/properties/values`, { properties: [value] })
        : await ghWrite("PATCH", `orgs/${ORG}/properties/values`, { repository_names: [p.repo], properties: [value] });
    if (!res.ok) {
      const hint = p.endpoint === "org" ? " (an org-owned property needs gh's admin:org scope: gh auth refresh -s admin:org)" : "";
      return stop(login.login, steps, `GitHub refused ${p.name} on ${p.repo}: ${res.reason}${hint}`);
    }
    steps.push({ what: `${p.repo} ${p.name}: ${p.from ?? "(not set)"} → ${p.to ?? "(not set)"}`, ok: true });
  }
  return { ok: true, login: login.login, steps };
}

function stop(login: string, steps: ApplyStep[], reason: string): ApplyView {
  return { ok: false, login, reason: `${reason}. ${steps.length ? "The steps above were done; nothing after this was." : "Nothing was written."}`, steps };
}

const ShaSchema = z.object({ sha: z.string() }).loose();
const ValuesSchema = z.array(z.object({ property_name: z.string(), value: z.unknown() }).loose());

/** Why the live state differs from what the plan was built on, or undefined when it matches. */
async function liveCheck(plan: Plan): Promise<string | undefined> {
  for (const pr of plan.prs) {
    for (const f of pr.files) {
      const res = await ghRead<unknown>(`${contentsPath(f)}?ref=main`);
      let sha: string | null;
      if (res.ok) {
        const parsed = ShaSchema.safeParse(res.data);
        if (!parsed.success) return `${f.file.repo} ${f.file.path}: unexpected answer from GitHub.`;
        sha = parsed.data.sha;
      } else if (/\(HTTP 404\)/.test(res.reason)) sha = null;
      else return `could not read ${f.file.repo} ${f.file.path}: ${res.reason}.`;
      if (sha !== f.baseSha) return `${f.file.repo} ${f.file.path} changed on main since you edited it; reload and edit again.`;
    }
  }
  for (const p of plan.properties) {
    const res = await ghRead<unknown>(`repos/${ORG}/${p.repo}/properties/values`);
    if (!res.ok) return `could not read ${p.repo}'s properties: ${res.reason}.`;
    const parsed = ValuesSchema.safeParse(res.data);
    if (!parsed.success) return `${p.repo}: unexpected answer from GitHub.`;
    const now = parsed.data.find((v) => v.property_name === p.name)?.value ?? null;
    if (now !== p.from) return `${p.repo} ${p.name} is now ${now === null ? "not set" : String(now)}, not what you edited; reload.`;
  }
  return undefined;
}
