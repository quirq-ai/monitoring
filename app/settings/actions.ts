"use server";

import { headers } from "next/headers";
import { applyEdits } from "@/lib/editor/apply";
import { ghLogin } from "@/lib/editor/gh";
import { refuseWrite } from "@/lib/editor/mode";
import { buildPlan, planFiles, reviewNote } from "@/lib/editor/plan";
import { renderScript } from "@/lib/editor/script";
import { EditRequestSchema, type ApplyView, type PlanView } from "@/lib/editor/types";
import { summarizeZod } from "@/lib/fetch";

// The settings editor's server functions. Everything the browser sends is checked here: the
// request against its schema, every id against the server's own catalog (in buildPlan), and a
// write against the local-editor rules in refuseWrite.

/** Build the plan for review: what each pull request changes, and the gh script that does it. */
export async function reviewEdits(input: unknown): Promise<PlanView> {
  const request = EditRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, reason: `the request is malformed: ${summarizeZod(request.error)}` };
  const built = await buildPlan(request.data);
  if (!built.ok) return built;
  const { plan } = built;
  const files = planFiles(plan);
  return {
    ok: true,
    digest: plan.digest,
    prs: plan.prs.map((pr, i) => ({ repo: pr.repo, title: pr.title, files: files[i], reviewNote: reviewNote(pr.reviewers) })),
    properties: plan.properties.map((p) => ({ repo: p.repo, name: p.name, from: p.from, to: p.to, needsOrgOwner: p.endpoint === "org" })),
    script: renderScript(plan),
  };
}

/** Who gh is signed in as, for the local editor's "Connected as" line. */
export async function whoAmI(key: unknown): Promise<{ ok: true; login: string } | { ok: false; reason: string }> {
  const refused = refuseWrite((await headers()).get("host"), key);
  if (refused) return { ok: false, reason: refused };
  return ghLogin();
}

/** Open the pull requests and set the properties, through the person's own gh. */
export async function applyReviewed(key: unknown, input: unknown, digest: unknown): Promise<ApplyView> {
  const refused = refuseWrite((await headers()).get("host"), key);
  if (refused) return { ok: false, reason: refused, steps: [] };
  const request = EditRequestSchema.safeParse(input);
  if (!request.success) return { ok: false, reason: `the request is malformed: ${summarizeZod(request.error)}`, steps: [] };
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) return { ok: false, reason: "review the change first", steps: [] };
  return applyEdits(request.data, digest);
}
