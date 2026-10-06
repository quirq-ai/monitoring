import "server-only";
import { describeError, forgetMissing, isRememberedMissing, ORG, rememberMissing, REQUEST_TIMEOUT_MS } from "@/lib/fetch";
import { readAt } from "@/lib/signal";

// The only GitHub API client. GET only: the dashboard never writes. The token is sent only to
// api.github.com (or to a loopback fixture server under test), never anywhere else, and it is
// never logged or returned.

export type ApiResult<T> =
  | { ok: true; data: T; url: string; fetchedAt: string; maxAge: number; status: number }
  | { ok: false; reason: string; url: string; status?: number; fetchedAt: string; maxAge: number };

// Once GitHub answers with the rate limit, every further call until the reset would be refused
// too, so the reset time is kept here and calls are skipped until then (per server process).
let limitedUntil: number | undefined;

/** The ISO time the rate limit resets, while one is in force. */
export function rateLimitedUntil(): string | undefined {
  if (limitedUntil === undefined) return undefined;
  if (limitedUntil <= Date.now()) {
    limitedUntil = undefined;
    return undefined;
  }
  return new Date(limitedUntil).toISOString();
}

/** Tests call this between cases; nothing else should. */
export function forgetBackoff(): void {
  limitedUntil = undefined;
  forgetMissing();
}

export const RATE_LIMIT_REASON = "GitHub API rate limit, resets at";

export function apiBase(): string {
  return (process.env.MONITORING_API_BASE?.trim() || "https://api.github.com").replace(/\/+$/, "");
}

function tokenFor(base: string): string | undefined {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return undefined;
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    return undefined;
  }
  const allowed = host === "api.github.com" || host === "127.0.0.1" || host === "localhost";
  return allowed ? token : undefined;
}

export function hasToken(): boolean {
  return Boolean(tokenFor(apiBase()));
}

/** Requests made by this process, by hour, so the Health page can show the budget being used. */
const requestLog = new Map<string, number>();

export function requestsThisHour(): number {
  return requestLog.get(hourKey(new Date())) ?? 0;
}

function hourKey(at: Date): string {
  return at.toISOString().slice(0, 13);
}

function countRequest(): void {
  const key = hourKey(new Date());
  requestLog.set(key, (requestLog.get(key) ?? 0) + 1);
  for (const old of requestLog.keys()) if (old !== key) requestLog.delete(old);
}

export type ApiOptions = {
  /** Next.js data-cache window in seconds. */
  revalidate: number;
  /** Query parameters, added to the path. Values are encoded; keys must be known constants. */
  params?: Record<string, string | number>;
  /** Response media type; the default is the GitHub JSON type. */
  accept?: string;
};

/**
 * GET `/<path>` from the GitHub API. Without a token it returns `no token` without calling: the
 * anonymous limit (60 an hour) is too small to be useful and would show as a confusing failure.
 */
export async function ghGet<T>(path: string, options: ApiOptions): Promise<ApiResult<T>> {
  const base = apiBase();
  const url = buildUrl(base, path, options.params);
  const maxAge = options.revalidate;
  const token = tokenFor(base);
  if (!token) return { ok: false, reason: "no token", url, fetchedAt: new Date().toISOString(), maxAge };
  const limited = rateLimitedUntil();
  if (limited) return { ok: false, reason: `${RATE_LIMIT_REASON} ${limited}`, url, status: 403, fetchedAt: new Date().toISOString(), maxAge };
  if (isRememberedMissing(url)) return { ok: false, reason: "GitHub API returned 404", url, status: 404, fetchedAt: new Date().toISOString(), maxAge };

  const headers: Record<string, string> = {
    Accept: options.accept ?? "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${token}`,
  };
  try {
    countRequest();
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: options.revalidate },
    });
    const fetchedAt = readAt(res.headers);
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      if (remaining === "0" || res.status === 429) {
        const resetAt = reset && /^\d+$/.test(reset) ? Number(reset) * 1000 : Date.now() + 5 * 60_000;
        limitedUntil = Math.max(limitedUntil ?? 0, resetAt);
        return { ok: false, reason: `${RATE_LIMIT_REASON} ${new Date(resetAt).toISOString()}`, url, status: res.status, fetchedAt, maxAge };
      }
      return { ok: false, reason: `GitHub API refused (${res.status})`, url, status: res.status, fetchedAt, maxAge };
    }
    if (res.status === 401) {
      return { ok: false, reason: "token rejected", url, status: 401, fetchedAt, maxAge };
    }
    if (!res.ok) {
      if (res.status === 404) rememberMissing(url, options.revalidate);
      return { ok: false, reason: `GitHub API returned ${res.status}`, url, status: res.status, fetchedAt, maxAge };
    }
    const data = (await res.json()) as T;
    return { ok: true, data, url, fetchedAt, maxAge, status: res.status };
  } catch (error) {
    return { ok: false, reason: `GitHub API: ${describeError(error)}`, url, fetchedAt: new Date().toISOString(), maxAge };
  }
}

function buildUrl(base: string, path: string, params?: Record<string, string | number>): string {
  const clean = path.replace(/^\/+/, "");
  const url = new URL(`${base}/${clean}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** `repos/<org>/<repo>/...` with the repo name checked, so a route parameter never reaches a URL. */
export function repoPath(repo: string, rest: string): string {
  assertRepoName(repo);
  return `repos/${ORG}/${repo}/${rest.replace(/^\/+/, "")}`;
}

export function assertRepoName(repo: string): void {
  if (!isSafeName(repo, 100)) throw new Error(`not a repo name: ${repo}`);
}

/** Letters, digits, `_`, `.` and `-` only, and never `.` or `..`, so a name can never climb a path. */
export function isSafeName(name: string, max: number): boolean {
  return name !== "." && name !== ".." && new RegExp(`^[A-Za-z0-9_.-]{1,${max}}$`).test(name);
}

/** Where a person looks for the same thing on github.com. */
export const web = {
  repo: (repo: string) => `https://github.com/${ORG}/${repo}`,
  pulls: (repo: string) => `https://github.com/${ORG}/${repo}/pulls`,
  commit: (repo: string, sha: string) => `https://github.com/${ORG}/${repo}/commit/${sha}`,
  commits: (repo: string, branch: string) => `https://github.com/${ORG}/${repo}/commits/${branch}`,
  actions: (repo: string, file?: string) =>
    `https://github.com/${ORG}/${repo}/actions${file ? `/workflows/${file}` : ""}`,
  deployments: (repo: string) => `https://github.com/${ORG}/${repo}/deployments`,
  orgRepos: () => `https://github.com/orgs/${ORG}/repositories`,
  issueSearch: (query: string) => `https://github.com/search?type=issues&q=${encodeURIComponent(query)}`,
};
