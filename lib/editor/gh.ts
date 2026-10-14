import "server-only";
import { spawn } from "node:child_process";
import { editorMode } from "@/lib/editor/mode";

// The settings editor's only way to GitHub when it runs on a person's own machine: their own `gh`
// login. This process never reads, stores or prints the token; `gh` makes each request itself.
// The dashboard's GITHUB_TOKEN (and any other token in the environment) is removed from what gh
// sees, so an edit is always made as the person who is signed in to gh, never as the dashboard.

const TOKEN_VARS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_HOST"];
const TIMEOUT_MS = 30_000;
const REASON_MAX = 200;

export type GhResult = { ok: true; stdout: string } | { ok: false; reason: string };

function ghEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1" };
  for (const name of TOKEN_VARS) delete env[name];
  return env;
}

/** gh's own one-line error, cut short. gh never prints the token, and neither does this. */
function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > REASON_MAX ? `${line.slice(0, REASON_MAX - 1)}…` : line;
}

function run(args: string[], input?: string): Promise<GhResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (result: GhResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    let child;
    try {
      child = spawn("gh", args, { env: ghEnv(), stdio: ["pipe", "pipe", "pipe"], timeout: TIMEOUT_MS });
    } catch (error) {
      done({ ok: false, reason: `could not run gh: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (error: NodeJS.ErrnoException) => {
      done({ ok: false, reason: error.code === "ENOENT" ? "gh is not installed (https://cli.github.com)" : `could not run gh: ${error.message}` });
    });
    child.on("close", (code, signal) => {
      if (code === 0) done({ ok: true, stdout });
      else if (signal) done({ ok: false, reason: `gh was stopped (${signal}); it may have timed out after ${TIMEOUT_MS / 1000} s` });
      else done({ ok: false, reason: `gh: ${firstLine(stderr) || `exited with ${code}`}` });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input ?? "");
  });
}

function parse<T>(result: GhResult): { ok: true; data: T } | { ok: false; reason: string } {
  if (!result.ok) return result;
  // A 204 (setting a property) answers with no body.
  if (result.stdout.trim() === "") return { ok: true, data: null as T };
  try {
    return { ok: true, data: JSON.parse(result.stdout) as T };
  } catch {
    return { ok: false, reason: "gh: the answer was not JSON" };
  }
}

/** GET a REST path through gh as JSON. Reads are allowed in either editor mode only through gh. */
export async function ghRead<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  return parse<T>(await run(["api", "--hostname", "github.com", "--method", "GET", path]));
}

export type WriteMethod = "POST" | "PUT" | "PATCH";

/**
 * Send one write through gh. Only the local editor may: on Vercel, or without
 * MONITORING_EDITOR=gh, this refuses before anything runs.
 */
export async function ghWrite<T>(method: WriteMethod, path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  if (editorMode() !== "gh") return { ok: false, reason: "this server does not write: run the editor on your own machine with pnpm editor" };
  return parse<T>(await run(["api", "--hostname", "github.com", "--method", method, path, "--input", "-"], JSON.stringify(body)));
}

/** The login gh is signed in as, or why there is none. */
export async function ghLogin(): Promise<{ ok: true; login: string } | { ok: false; reason: string }> {
  const user = await ghRead<{ login?: unknown }>("user");
  if (!user.ok) return { ok: false, reason: `${user.reason}. Sign in with: gh auth login` };
  return typeof user.data.login === "string" ? { ok: true, login: user.data.login } : { ok: false, reason: "gh: no login in the answer" };
}
