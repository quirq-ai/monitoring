import "server-only";
import { timingSafeEqual } from "node:crypto";

// Two ways to run the settings editor:
//
// - "script" (the deployed site, and `pnpm dev`): it reads the settings and shows what an edit
//   would change, then hands the person a `gh` script that opens the pull requests with their own
//   login. The server writes nothing.
// - "gh" (`pnpm editor` on the person's own machine): the server opens the pull requests itself,
//   through the person's own `gh` login. It answers only on loopback, and only to the tab that
//   opened the link `pnpm editor` printed (its key is in the link's #fragment).

export type EditorMode = "gh" | "script";

export function editorMode(): EditorMode {
  // Vercel sets VERCEL on every build and function: a deployed site never writes.
  if (process.env.VERCEL) return "script";
  return process.env.MONITORING_EDITOR === "gh" ? "gh" : "script";
}

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

/**
 * Why a request to the local editor is refused before anything renders, or undefined. In gh mode
 * every page reads through the person's own gh login, so a page on another site that resolves its
 * own name to 127.0.0.1 (DNS rebinding) must not get even a read: it arrives with that name in
 * Host, not a loopback one. Elsewhere nothing is read as the person, so nothing is refused.
 */
export function refuseRead(host: string | null): string | undefined {
  if (editorMode() !== "gh") return undefined;
  return host && LOOPBACK_HOST.test(host) ? undefined : "the local editor answers only at 127.0.0.1";
}

/**
 * Why a write request is refused, or undefined when it may go ahead. `host` is the request's Host
 * header: a page on another site that resolves its own name to 127.0.0.1 (DNS rebinding) arrives
 * with that name, not a loopback one, and is refused. `key` is what the tab sent.
 */
export function refuseWrite(host: string | null, key: unknown): string | undefined {
  if (editorMode() !== "gh") return "this server does not write: run the editor on your own machine with pnpm editor";
  if (refuseRead(host)) return "the editor writes only when opened at 127.0.0.1";
  const expected = process.env.MONITORING_EDITOR_KEY ?? "";
  if (expected.length < 32) return "the editor was not started with pnpm editor (no key)";
  if (typeof key !== "string" || !sameSecret(key, expected)) return "open the link pnpm editor printed: this tab does not have its key";
  return undefined;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
