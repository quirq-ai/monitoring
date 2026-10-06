import "server-only";
import { z } from "zod";
import { readAt } from "@/lib/signal";

// Every network read in the app goes through this file or lib/github.ts. Pages never fetch.

export const ORG = process.env.MONITORING_ORG?.trim() || "quirq-ai";

/** 10 s per request, whatever the source. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Base for state-branch and config files. Tests point it at a local fixture server. */
export function rawBase(): string {
  return (process.env.MONITORING_RAW_BASE?.trim() || "https://raw.githubusercontent.com").replace(
    /\/+$/,
    "",
  );
}

/** The `refs/heads/` form means a tag named like the branch is never served. */
export function rawUrl(repo: string, branch: string, path: string): string {
  return `${rawBase()}/${ORG}/${repo}/refs/heads/${branch}/${path}`;
}

/** The link a person opens: the file on GitHub. */
export function blobUrl(repo: string, branch: string, path: string): string {
  return `https://github.com/${ORG}/${repo}/blob/${branch}/${path}`;
}

export function treeUrl(repo: string, branch: string, path = ""): string {
  return `https://github.com/${ORG}/${repo}/tree/${branch}${path ? `/${path}` : ""}`;
}

export type RawResult =
  | { ok: true; text: string; status: number; fetchedAt: string; maxAge: number }
  | { ok: false; status?: number; reason: string; fetchedAt: string; maxAge: number };

// Next caches only 200s, so a missing file would be fetched again on every render. A 404 is
// remembered here for the same window instead (per server process; on Vercel, per instance).
const missing = new Map<string, number>();

export function rememberMissing(url: string, seconds: number): void {
  missing.set(url, Date.now() + seconds * 1000);
  if (missing.size > 500) for (const [key, until] of missing) if (until < Date.now()) missing.delete(key);
}

export function isRememberedMissing(url: string): boolean {
  const until = missing.get(url);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  missing.delete(url);
  return false;
}

/** Tests call this between cases; nothing else should. */
export function forgetMissing(): void {
  missing.clear();
}

/**
 * Read a file from a state branch or main. `revalidate` is the Next.js data-cache window in
 * seconds; raw itself answers with `cache-control: max-age=300`, so a file can be up to five
 * minutes old whatever we ask for.
 */
export async function fetchRaw(
  repo: string,
  branch: string,
  path: string,
  revalidate: number,
): Promise<RawResult> {
  const url = rawUrl(repo, branch, path);
  const maxAge = revalidate;
  if (isRememberedMissing(url)) {
    return { ok: false, status: 404, reason: `${repo}:${branch} ${path} returned 404`, fetchedAt: new Date().toISOString(), maxAge };
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate },
    });
    const fetchedAt = readAt(res.headers);
    if (!res.ok) {
      if (res.status === 404) rememberMissing(url, revalidate);
      return { ok: false, status: res.status, reason: `${repo}:${branch} ${path} returned ${res.status}`, fetchedAt, maxAge };
    }
    return { ok: true, text: await res.text(), status: res.status, fetchedAt, maxAge };
  } catch (error) {
    return { ok: false, reason: `${repo}:${branch} ${path}: ${describeError(error)}`, fetchedAt: new Date().toISOString(), maxAge };
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `timed out after ${REQUEST_TIMEOUT_MS / 1000} s`;
    }
    return error.message;
  }
  return String(error);
}

/** Parse JSON text against a zod schema; the result is a one-line reason, never a partial value. */
export function parseJson<T>(
  schema: z.ZodType<T>,
  text: string,
  what: string,
): { ok: true; value: T } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: `${what}: not JSON` };
  }
  return parseValue(schema, data, what);
}

export function parseValue<T>(
  schema: z.ZodType<T>,
  data: unknown,
  what: string,
): { ok: true; value: T } | { ok: false; reason: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, reason: `${what}: ${summarizeZod(result.error)}` };
}

export function summarizeZod(error: z.ZodError): string {
  const first = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length ? issue.path.map(String).join(".") : "(root)";
    return `${path} ${issue.message}`;
  });
  const more = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : "";
  return `does not match schema: ${first.join("; ")}${more}`;
}

/**
 * Files that carry a `schema` id must carry the one this dashboard understands. A newer id
 * means the writer changed its format and the dashboard needs updating, so say that.
 */
export function schemaReason(what: string, found: unknown, expected: string): string {
  return `${what}: schema ${String(found)} is not ${expected}; the dashboard needs updating for it`;
}
