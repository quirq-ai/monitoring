import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { codeownersFile, FIXED_FILES, manifestFile, type SettingsFile } from "@/config/settings";
import { editorMode } from "@/lib/editor/mode";
import { ghRead } from "@/lib/editor/gh";
import { blobUrl, fetchRaw, ORG, parseValue } from "@/lib/fetch";
import { ghGet, isSafeName } from "@/lib/github";
import { failSignal, okSignal, unreadAt, type Signal } from "@/lib/signal";
import { localGroups, readGateRepos, readProducts } from "@/lib/sources/registry";

// What the settings editor edits. The deployed site reads the files raw, like every other page.
// On a person's own machine (`pnpm editor`) it reads them through their gh login instead, from
// the contents API, so what they edit is main as it is now and not up to five minutes old.

const REVALIDATE_FILE = 60;
const REVALIDATE_PROPERTIES = 300;

export type SettingsText = {
  /** The file's text, or "" when it does not exist yet (only a CODEOWNERS may be created). */
  text: string;
  exists: boolean;
  /** Git's blob id of the text: the version an edit is made against. Null when it does not exist. */
  blobSha: string | null;
};

/** Git's blob id of a text, so it can be checked against the contents API's `sha`. */
export function blobSha(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** Every file the editor knows: the fixed ones, plus a CODEOWNERS per repo and a manifest per product. */
export async function settingsCatalog(): Promise<{ files: SettingsFile[]; reason?: string }> {
  const [products, gate] = await Promise.all([readProducts(), readGateRepos()]);
  const reasons = [products, gate].flatMap((s) => (s.ok ? [] : [s.reason]));
  const productNames = products.ok ? products.value.map((p) => p.name) : [];
  const repos = new Set<string>([...productNames, ...(gate.ok ? gate.value.map((r) => r.name) : [])]);
  for (const g of localGroups()) for (const name of Object.keys(g.repos)) repos.add(name);
  const names = [...repos].filter((r) => isSafeName(r, 100)).sort();
  return {
    files: [...FIXED_FILES, ...productNames.filter((r) => isSafeName(r, 100)).map(manifestFile), ...names.map(codeownersFile)],
    reason: reasons.length ? reasons.join("; ") : undefined,
  };
}

const ContentsSchema = z.object({ sha: z.string(), content: z.string(), encoding: z.literal("base64") }).loose();

export async function readSettingsFile(file: SettingsFile): Promise<Signal<SettingsText>> {
  const source = `settings/${file.id}`;
  const sourceUrl = blobUrl(file.repo, file.branch, file.path);
  const missingOk = file.format === "codeowners";
  if (editorMode() === "gh") {
    const read = unreadAt(0);
    const res = await ghRead<unknown>(`repos/${ORG}/${file.repo}/contents/${file.path}?ref=${file.branch}`);
    if (!res.ok) {
      if (missingOk && /\(HTTP 404\)/.test(res.reason)) return okSignal(source, sourceUrl, { text: "", exists: false, blobSha: null }, undefined, read);
      return failSignal(source, sourceUrl, `${file.repo}: ${file.path}: ${res.reason}`, read);
    }
    const parsed = parseValue(ContentsSchema, res.data, `${file.repo}: ${file.path}`);
    if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, read);
    const text = Buffer.from(parsed.value.content, "base64").toString("utf8");
    if (blobSha(text) !== parsed.value.sha) return failSignal(source, sourceUrl, `${file.repo}: ${file.path} is not plain UTF-8 text; edit it on GitHub`, read);
    return okSignal(source, sourceUrl, { text, exists: true, blobSha: parsed.value.sha }, undefined, read);
  }
  const raw = await fetchRaw(file.repo, file.branch, file.path, REVALIDATE_FILE);
  if (!raw.ok) {
    if (missingOk && raw.status === 404) return okSignal(source, sourceUrl, { text: "", exists: false, blobSha: null }, undefined, raw);
    return failSignal(source, sourceUrl, `${file.repo}: ${raw.reason}`, raw);
  }
  return okSignal(source, sourceUrl, { text: raw.text, exists: true, blobSha: blobSha(raw.text) }, undefined, raw);
}

// --- org custom properties ------------------------------------------------------------------

const PropertySchema = z
  .object({
    property_name: z.string().regex(/^[A-Za-z0-9_.-]{1,75}$/),
    value_type: z.string(),
    required: z.boolean().optional(),
    default_value: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    description: z.string().nullish(),
    allowed_values: z.array(z.string()).nullish(),
    values_editable_by: z.string().nullish(),
  })
  .loose();

const RepoValuesSchema = z
  .object({
    repository_name: z.string(),
    properties: z.array(z.object({ property_name: z.string(), value: z.union([z.string(), z.array(z.string()), z.null()]) }).loose()),
  })
  .loose();

export type PropertyDef = {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string;
  allowed: string[];
  /** "org_and_repo_actors" lets a repo admin set it; otherwise it needs an org owner. */
  editableBy: string;
};

export type RepoProperties = { repo: string; values: Record<string, string | string[] | null> };

export type Properties = { defs: PropertyDef[]; repos: RepoProperties[]; cut: boolean };

const PAGE = 100;

async function getJson(path: string, revalidate: number): Promise<{ ok: true; data: unknown; read: { fetchedAt: string; maxAge: number } } | { ok: false; reason: string; read: { fetchedAt: string; maxAge: number } }> {
  if (editorMode() === "gh") {
    const read = unreadAt(0);
    const res = await ghRead<unknown>(path);
    return res.ok ? { ok: true, data: res.data, read } : { ok: false, reason: res.reason, read };
  }
  const [base, query] = path.split("?");
  const params = Object.fromEntries(new URLSearchParams(query ?? ""));
  const res = await ghGet<unknown>(base, { revalidate, params });
  return res.ok ? { ok: true, data: res.data, read: res } : { ok: false, reason: res.reason, read: res };
}

/** The org's custom properties and every repo's values: two calls, cached five minutes. */
export async function readProperties(): Promise<Signal<Properties>> {
  const source = "github/org-properties";
  const sourceUrl = `https://github.com/organizations/${ORG}/settings/custom-properties`;
  const [schema, values] = await Promise.all([
    getJson(`orgs/${ORG}/properties/schema`, REVALIDATE_PROPERTIES),
    getJson(`orgs/${ORG}/properties/values?per_page=${PAGE}`, REVALIDATE_PROPERTIES),
  ]);
  if (!schema.ok) return failSignal(source, sourceUrl, `org properties: ${schema.reason}`, schema.read);
  if (!values.ok) return failSignal(source, sourceUrl, `org property values: ${values.reason}`, values.read);
  const defs = parseValue(z.array(PropertySchema), schema.data, "org properties");
  if (!defs.ok) return failSignal(source, sourceUrl, defs.reason, schema.read);
  const repos = parseValue(z.array(RepoValuesSchema), values.data, "org property values");
  if (!repos.ok) return failSignal(source, sourceUrl, repos.reason, values.read);
  return okSignal(
    source,
    sourceUrl,
    {
      defs: defs.value.map((d) => ({
        name: d.property_name,
        type: d.value_type,
        required: d.required ?? false,
        defaultValue: typeof d.default_value === "string" ? d.default_value : null,
        description: d.description ?? "",
        allowed: d.allowed_values ?? [],
        editableBy: d.values_editable_by ?? "org_actors",
      })),
      repos: repos.value
        .filter((r) => isSafeName(r.repository_name, 100))
        .map((r) => ({ repo: r.repository_name, values: Object.fromEntries(r.properties.map((p) => [p.property_name, p.value])) }))
        .sort((a, b) => a.repo.localeCompare(b.repo)),
      cut: repos.value.length >= PAGE,
    },
    undefined,
    values.read,
  );
}
