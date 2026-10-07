import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import reposJson from "@/config/repos.json";
import { blobUrl, fetchRaw, parseJson, parseValue } from "@/lib/fetch";
import { ghGet, web } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// The repo registry is owned elsewhere: infra-config config/repos.toml names the products and
// gate settings/github.toml names every repo behind the gate. config/repos.json here only adds
// the repos neither names. The org's public repo list (GitHub API, with the wiki's daily
// manifest as a no-token cross-check) catches any repo none of them knows.

const REVALIDATE_CONFIG = 600;

// A name that could not be a repo (a slash, a space, `..`) fails the whole file with a reason
// rather than throwing inside the model, so one bad entry turns the registry unknown, not the
// pages into 500s. Same rule as isSafeName in lib/github.ts.
const RepoNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}$/, "not a repo name")
  .refine((n) => n !== "." && n !== "..", "not a repo name");
const REVALIDATE_ORG = 3600;

// --- infra-config config/repos.toml ---------------------------------------------------------

const ProductSchema = z
  .object({
    name: RepoNameSchema,
    description: z.string().default(""),
    default_branch: z.string().default("main"),
    kinds: z.array(z.string()).default([]),
    channels: z.array(z.string()).default([]),
    deploy: z.object({ target: z.string().default("") }).loose().optional(),
  })
  .loose();

const ProductsFileSchema = z.object({ repo: z.array(ProductSchema).default([]) }).loose();

export type Product = {
  name: string;
  description: string;
  defaultBranch: string;
  kinds: string[];
  channels: string[];
  deployTarget: string;
};

export async function readProducts(): Promise<Signal<Product[]>> {
  const source = "infra-config/repos";
  const sourceUrl = blobUrl("infra-config", "main", "config/repos.toml");
  const raw = await fetchRaw("infra-config", "main", "config/repos.toml", REVALIDATE_CONFIG);
  if (!raw.ok) return failSignal(source, sourceUrl, `infra-config: ${raw.reason}`, raw);
  const toml = parseTomlSafe(raw.text, "infra-config: repos.toml");
  if (!toml.ok) return failSignal(source, sourceUrl, toml.reason, raw);
  const parsed = parseValue(ProductsFileSchema, toml.value, "infra-config: repos.toml");
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  const products = parsed.value.repo.map((r) => ({
    name: r.name,
    description: r.description,
    defaultBranch: r.default_branch,
    kinds: r.kinds,
    channels: r.channels,
    deployTarget: r.deploy?.target ?? "",
  }));
  return okSignal(source, sourceUrl, products, undefined, raw);
}

// --- gate settings/github.toml --------------------------------------------------------------

const GateRepoSchema = z
  .object({
    name: RepoNameSchema,
    kind: z.string().default(""),
    state_branches: z.array(z.string()).default([]),
  })
  .loose();

const GateFileSchema = z.object({ repo: z.array(GateRepoSchema).default([]) }).loose();

export type GateRepo = { name: string; kind: string; stateBranches: string[] };

export async function readGateRepos(): Promise<Signal<GateRepo[]>> {
  const source = "gate/settings";
  const sourceUrl = blobUrl("gate", "main", "settings/github.toml");
  const raw = await fetchRaw("gate", "main", "settings/github.toml", REVALIDATE_CONFIG);
  if (!raw.ok) return failSignal(source, sourceUrl, `gate: ${raw.reason}`, raw);
  const toml = parseTomlSafe(raw.text, "gate: github.toml");
  if (!toml.ok) return failSignal(source, sourceUrl, toml.reason, raw);
  const parsed = parseValue(GateFileSchema, toml.value, "gate: github.toml");
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  return okSignal(
    source,
    sourceUrl,
    parsed.value.repo.map((r) => ({ name: r.name, kind: r.kind, stateBranches: r.state_branches })),
    undefined,
    raw,
  );
}

// --- config/repos.json (this repo) ----------------------------------------------------------

export type LocalGroup = { id: string; title: string; repos: Record<string, string> };

export function localGroups(): LocalGroup[] {
  return Object.entries(reposJson.groups).map(([id, group]) => ({
    id,
    title: group.title,
    repos: group.repos,
  }));
}

// --- the org's public repos -----------------------------------------------------------------

const OrgRepoSchema = z
  .object({
    name: z.string(),
    html_url: z.string(),
    default_branch: z.string().default("main"),
    pushed_at: z.string().nullable().default(null),
    archived: z.boolean().default(false),
    fork: z.boolean().default(false),
    private: z.boolean().default(false),
    description: z.string().nullable().default(null),
  })
  .loose();

export type OrgRepo = {
  name: string;
  url: string;
  defaultBranch: string;
  pushedAt: string | null;
  archived: boolean;
  fork: boolean;
  description: string;
};

/** The org repo list from the API (cached an hour), or the wiki's manifest without a token. */
export async function readOrgRepos(): Promise<Signal<OrgRepo[]>> {
  const api = await ghGet<unknown>(`orgs/${process.env.MONITORING_ORG?.trim() || "quirq-ai"}/repos`, {
    revalidate: REVALIDATE_ORG,
    params: { type: "public", per_page: 100, sort: "pushed" },
  });
  if (api.ok) {
    const parsed = parseValue(z.array(OrgRepoSchema), api.data, "GitHub: org repos");
    if (parsed.ok) {
      return okSignal(
        "github/org-repos",
        web.orgRepos(),
        parsed.value
          .filter((r) => !r.private)
          .map((r) => ({
            name: r.name,
            url: r.html_url,
            defaultBranch: r.default_branch,
            pushedAt: r.pushed_at,
            archived: r.archived,
            fork: r.fork,
            description: r.description ?? "",
          })),
        undefined,
        api,
      );
    }
  }
  return readWikiManifest(api.ok ? undefined : api.reason);
}

const ManifestSchema = z
  .object({
    org: z.string(),
    generated_at: z.string(),
    excluded_repos: z.array(z.string()).default([]),
    repos: z.array(
      z
        .object({
          name: z.string(),
          html_url: z.string(),
          default_branch: z.string().default("main"),
          pushed_at: z.string().nullable().default(null),
          archived: z.boolean().default(false),
          fork: z.boolean().default(false),
        })
        .loose(),
    ),
  })
  .loose();

/** wiki main .quirq-wiki-manifest.json: the org repo list the wiki regenerates daily. */
export async function readWikiManifest(apiReason?: string): Promise<Signal<OrgRepo[]>> {
  const source = "wiki/manifest";
  const sourceUrl = blobUrl("wiki", "main", ".quirq-wiki-manifest.json");
  const raw = await fetchRaw("wiki", "main", ".quirq-wiki-manifest.json", REVALIDATE_ORG);
  const prefix = apiReason ? `GitHub API: ${apiReason}; wiki manifest: ` : "wiki manifest: ";
  if (!raw.ok) return failSignal(source, sourceUrl, `${prefix}${raw.reason}`, raw);
  const parsed = parseJson(ManifestSchema, raw.text, "wiki: .quirq-wiki-manifest.json");
  if (!parsed.ok) return failSignal(source, sourceUrl, `${prefix}${parsed.reason}`, raw);
  const repos: OrgRepo[] = parsed.value.repos.map((r) => ({
    name: r.name,
    url: r.html_url,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
    archived: r.archived,
    fork: r.fork,
    description: "",
  }));
  // The wiki excludes itself from its own manifest; add it back so it is never silently missing.
  for (const name of parsed.value.excluded_repos) {
    if (!repos.some((r) => r.name === name)) {
      repos.push({
        name,
        url: `https://github.com/${parsed.value.org}/${name}`,
        defaultBranch: "main",
        pushedAt: null,
        archived: false,
        fork: false,
        description: "",
      });
    }
  }
  return okSignal(source, sourceUrl, repos, parsed.value.generated_at, raw);
}

function parseTomlSafe(text: string, what: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: parseToml(text) };
  } catch (error) {
    return { ok: false, reason: `${what}: not TOML (${error instanceof Error ? error.message : String(error)})` };
  }
}
