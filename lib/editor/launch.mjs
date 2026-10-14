// `pnpm editor`: run the dashboard on this machine with the settings editor able to open pull
// requests, as you, through your own gh login.
//
//   pnpm editor               # builds, then serves http://127.0.0.1:3020/settings
//   pnpm editor --port N      # another port
//
// It checks gh is installed and signed in (and runs `gh auth login` for you if not), then starts
// `next start` on 127.0.0.1 only, with a fresh random key. The printed link carries the key in its
// #fragment, which browsers never send to a server; the page keeps it for that tab and sends it
// with each write, so another program on this machine that finds the port cannot write as you.
// No token is read, stored or printed: gh makes every request itself.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOKEN_VARS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_HOST"];

function ghEnv() {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  for (const name of TOKEN_VARS) delete env[name];
  return env;
}

function login() {
  const r = spawnSync("gh", ["api", "--hostname", "github.com", "user", "--jq", ".login"], { env: ghEnv(), encoding: "utf8" });
  if (r.error) return { missing: true };
  return r.status === 0 ? { login: r.stdout.trim() } : {};
}

function port() {
  const i = process.argv.indexOf("--port");
  const value = i >= 0 ? Number(process.argv[i + 1]) : 3020;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    console.error("--port takes a number from 1024 to 65535");
    process.exit(2);
  }
  return value;
}

const p = port();
if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  console.error("No build found: run pnpm editor (it builds first), or pnpm build.");
  process.exit(1);
}

let who = login();
if (who.missing) {
  console.error("gh is not installed. Install it from https://cli.github.com, then run pnpm editor again.");
  process.exit(1);
}
if (!who.login) {
  console.log("Connect GitHub: gh is not signed in, so this runs `gh auth login` now (Ctrl-C to stop).");
  const env = { ...ghEnv() };
  delete env.GH_PROMPT_DISABLED;
  const r = spawnSync("gh", ["auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"], { env, stdio: "inherit" });
  who = r.status === 0 ? login() : {};
  if (!who.login) {
    console.error("Still not signed in to gh. Run gh auth login, then pnpm editor again.");
    process.exit(1);
  }
}
for (const name of TOKEN_VARS.slice(0, 4)) {
  if (process.env[name]) console.log(`Note: ${name} is set; the editor ignores it and acts only as your gh login.`);
}

const key = randomBytes(32).toString("base64url");
const next = join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const child = spawn(next, ["start", "-H", "127.0.0.1", "-p", String(p)], {
  cwd: root,
  env: { ...process.env, MONITORING_EDITOR: "gh", MONITORING_EDITOR_KEY: key },
  stdio: ["ignore", "inherit", "inherit"],
});
console.log(`\nSettings editor, signed in to gh as ${who.login}. Open this link; it carries this run's key, so keep it to yourself:\n\n  http://127.0.0.1:${p}/settings#key=${key}\n\nCtrl-C stops it.\n`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 130 : (code ?? 0)));
