import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/editor/apply";
import { ghWrite } from "@/lib/editor/gh";
import { editorMode, refuseWrite } from "@/lib/editor/mode";
import { buildPlan } from "@/lib/editor/plan";
import { renderScript } from "@/lib/editor/script";
import type { EditRequest } from "@/lib/editor/types";
import { blobSha } from "@/lib/sources/settings";
import { withFixtures } from "../helpers/fixtures";

const KEY = "k".repeat(40);
const gateToml = readFileSync("tests/fixtures/raw/gate/main/settings/github.toml", "utf8");
const fakeGh = resolve("tests/fake-gh");
let log: string;
const saved = { ...process.env };

beforeEach(() => {
  log = join(mkdtempSync(join(tmpdir(), "fake-gh-")), "log");
  writeFileSync(log, "");
  process.env.FAKE_GH_LOG = log;
  process.env.PATH = `${fakeGh}:${saved.PATH}`;
});

afterEach(() => {
  for (const k of ["MONITORING_EDITOR", "MONITORING_EDITOR_KEY", "VERCEL", "FAKE_GH_LOG", "FAKE_GH_MOVED", "FAKE_GH_SIGNED_OUT"]) delete process.env[k];
  process.env.PATH = saved.PATH;
});

function writes(): { method: string; path: string; body: Record<string, unknown> }[] {
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const request: EditRequest = {
  files: [
    { id: "gate/settings/github.toml", toml: [{ id: "repo[0].allow_auto_merge", from: false, to: true }] },
    { id: "gate/.github/CODEOWNERS", owners: [{ op: "set", pattern: "/settings/", from: ["@sharmasuraj0123"], to: ["@sharmasuraj0123", "@sam-example"] }] },
    { id: "infra-config/config/auto_revert.toml", toml: [{ id: "policy.daily_cap", from: 10, to: 5 }] },
  ],
  properties: [
    { repo: "monitoring", name: "stage", from: null, to: "active" },
    { repo: "innernet", name: "area", from: "product", to: "infra" },
  ],
};

describe("modes", () => {
  it("writes only in gh mode, never on Vercel, only from loopback with the key", async () => {
    expect(editorMode()).toBe("script");
    expect(refuseWrite("127.0.0.1:3020", KEY)).toMatch(/does not write/);
    expect((await ghWrite("POST", "repos/quirq-ai/gate/git/refs", {})).ok).toBe(false);
    process.env.MONITORING_EDITOR = "gh";
    process.env.MONITORING_EDITOR_KEY = KEY;
    expect(refuseWrite("127.0.0.1:3020", KEY)).toBeUndefined();
    expect(refuseWrite("localhost:3020", KEY)).toBeUndefined();
    expect(refuseWrite("evil.example:3020", KEY)).toMatch(/127\.0\.0\.1/);
    expect(refuseWrite(null, KEY)).toBeDefined();
    expect(refuseWrite("127.0.0.1:3020", "nope")).toMatch(/key/);
    expect(refuseWrite("127.0.0.1:3020", undefined)).toMatch(/key/);
    process.env.MONITORING_EDITOR_KEY = "short";
    expect(refuseWrite("127.0.0.1:3020", "short")).toMatch(/pnpm editor/);
    process.env.VERCEL = "1";
    expect(editorMode()).toBe("script");
    expect(writes()).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("makes one pull request per repo from the server's own read", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const { plan } = built;
    expect(plan.prs.map((p) => [p.repo, p.files.map((f) => f.file.path)])).toEqual([
      ["gate", ["settings/github.toml", ".github/CODEOWNERS"]],
      ["infra-config", ["config/auto_revert.toml"]],
    ]);
    expect(plan.prs[0].files[0].baseSha).toBe(blobSha(gateToml));
    expect(plan.prs[1].title).toBe("Settings: [policy] daily_cap: 10 → 5");
    expect(plan.prs[0].body).toContain("that happens when an org admin runs gate's settings apply");
    expect(plan.prs[0].body).toContain("assigns these paths to @sharmasuraj0123");
    expect(plan.prs[1].reviewers).toEqual(["@sharmasuraj0123"]);
    // gate's settings ask GitHub for code-owner review on neither repo, so it is the project's rule.
    expect(plan.prs.map((p) => p.enforced)).toEqual([false, false]);
    expect(plan.prs[0].body).toContain("That is the project's rule, not a GitHub setting.");
    expect(plan.properties).toEqual([
      { repo: "monitoring", name: "stage", from: null, to: "active", endpoint: "repo" },
      { repo: "innernet", name: "area", from: "product", to: "infra", endpoint: "org" },
    ]);
    expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("says GitHub requires the code owner's review where gate's settings ask for it", async () => {
    await withFixtures();
    const built = await buildPlan({
      files: [{ id: "toolchains/.github/CODEOWNERS", owners: [{ op: "set", pattern: "/tools/", from: ["@sharmasuraj0123"], to: ["@sharmasuraj0123", "@sam-example"] }] }],
      properties: [],
    });
    if (!built.ok) throw new Error(built.reason);
    expect(built.plan.prs[0].enforced).toBe(true);
    expect(built.plan.prs[0].body).toContain("gate's settings also have GitHub require that review for this repo");
    expect(built.plan.prs[0].body).not.toContain("not a GitHub setting");
  });

  it("refuses ids it does not know, read-only manifests, stale values and bad property values", async () => {
    await withFixtures();
    const r = (req: Partial<EditRequest>) => buildPlan({ files: [], properties: [], ...req });
    expect(await r({ files: [{ id: "gate/../../etc/passwd", toml: [{ id: "a", from: 1, to: 2 }] }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/not a settings file/) });
    expect(await r({ files: [{ id: "xo-space/infra/repo.toml", toml: [{ id: "schema", from: "quirq-repo/1", to: "x" }] }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/qqsync/) });
    expect(await r({ files: [{ id: "gate/settings/github.toml", toml: [{ id: "repo[0].allow_auto_merge", from: true, to: false }] }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/changed since/) });
    expect(await r({ properties: [{ repo: "gate", name: "role", from: "tool", to: "robot" }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/not one of/) });
    expect(await r({ properties: [{ repo: "gate", name: "role", from: "tool", to: null }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/required/) });
    expect(await r({ properties: [{ repo: "gate", name: "topics-extra", from: null, to: "a" }] })).toMatchObject({ ok: false });
    expect(await r({ properties: [{ repo: "nope", name: "role", from: null, to: "tool" }] })).toMatchObject({ ok: false });
    expect(await r({})).toMatchObject({ ok: false, reason: "nothing to change" });
    // A value qqcfg generate reads would leave generated/ and the workflows stale.
    expect(await r({ files: [{ id: "infra-config/config/kinds.toml", toml: [{ id: "toolchain[1].pin", from: "24", to: "22" }] }] })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/qqcfg\.py generate/),
    });
    const gardenerPin = "bf3ad29834d85489c49aa6d41ec3c7e59474b746";
    expect(await r({ files: [{ id: "gardener/pins.toml", toml: [{ id: "infra-config.commit", from: gardenerPin, to: "main" }] }] })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/40 lowercase hex/),
    });
    expect(await r({ files: [{ id: "gardener/pins.toml", toml: [{ id: "infra-config.commit", from: gardenerPin, to: "a".repeat(40) }] }] })).toMatchObject({ ok: true });
  });
});

function runScript(script: string, answer: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "script-"));
  const file = join(dir, "settings-change.sh");
  writeFileSync(file, script);
  return spawnSync("bash", [file], { input: `${answer}\n`, encoding: "utf8", env: { ...process.env, GITHUB_TOKEN: "must-not-be-used", ...env } });
}

describe("the gh script", { timeout: 20_000 }, () => {
  it("is valid bash, and stops on anything but yes with nothing written", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const script = renderScript(built.plan);
    expect(spawnSync("bash", ["-n"], { input: script }).status).toBe(0);
    const no = runScript(script, "y");
    expect(no.stdout).toContain("Nothing was written.");
    expect(no.status).toBe(1);
    expect(writes()).toEqual([]);
  });

  it("stops before any write when main moved since the edit", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const r = runScript(renderScript(built.plan), "yes", { FAKE_GH_MOVED: "config/auto_revert.toml" });
    expect(r.stdout).toMatch(/STOP: infra-config config\/auto_revert.toml changed/);
    expect(writes()).toEqual([]);
  });

  it("opens the pull requests and sets the properties with exactly the planned content", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const r = runScript(renderScript(built.plan), "yes");
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("opened: https://github.com/quirq-ai/gate/pull/101");
    expect(r.stdout).toContain("Done.");
    checkWrites(built.plan.prs[0].files[0].after);
  });

  it("creates a CODEOWNERS where GitHub answers Not Found (gh prints that answer on stdout)", async () => {
    await withFixtures();
    const built = await buildPlan(newOwners);
    if (!built.ok) throw new Error(built.reason);
    expect(built.plan.prs[0].files[0].baseSha).toBeNull();
    const r = runScript(renderScript(built.plan), "yes");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    checkNewOwners();
  });

  it("reads the answer to yes exactly: surrounding spaces are not yes", async () => {
    await withFixtures();
    const built = await buildPlan(newOwners);
    if (!built.ok) throw new Error(built.reason);
    expect(runScript(renderScript(built.plan), " yes").stdout).toContain("Nothing was written.");
    expect(writes()).toEqual([]);
  });

  it("sends every call to github.com, whatever gh's default host", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const calls = renderScript(built.plan).split("\n").filter((l) => /\bgh api\b/.test(l));
    expect(calls).toEqual(['api() { gh api --hostname github.com "$@"; }']);
  });

  it("keeps a value with quotes and dollars as text", async () => {
    await withFixtures();
    const nasty = `it's "$HOME" \`whoami\` $(id)`;
    const built = await buildPlan({ files: [{ id: "infra-config/config/org.toml", toml: [{ id: "org.system", from: "quirq infra", to: nasty }] }], properties: [] });
    if (!built.ok) throw new Error(built.reason);
    const r = runScript(renderScript(built.plan), "yes");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const put = writes().find((w) => w.method === "PUT")!;
    expect((parse(Buffer.from(String(put.body.content), "base64").toString("utf8")) as { org: { system: string } }).org.system).toBe(nasty);
    expect(put.body.message).toContain("`whoami` $(id)");
  });
});

const newOwners: EditRequest = {
  files: [{ id: "xo-space/.github/CODEOWNERS", owners: [{ op: "add", pattern: "/infra/", to: ["@sharmasuraj0123"] }] }],
  properties: [],
};

function checkNewOwners() {
  const w = writes();
  expect(w.map((x) => `${x.method} ${x.path}`)).toEqual([
    "POST repos/quirq-ai/xo-space/git/refs",
    "PUT repos/quirq-ai/xo-space/contents/.github/CODEOWNERS",
    "POST repos/quirq-ai/xo-space/pulls",
  ]);
  expect(w[1].body.sha).toBeUndefined();
  expect(Buffer.from(String(w[1].body.content), "base64").toString("utf8")).toMatch(/^\/infra\/ +@sharmasuraj0123\n$/m);
}

function checkWrites(gateAfter: string) {
  const w = writes();
  expect(w.map((x) => `${x.method} ${x.path}`)).toEqual([
    "POST repos/quirq-ai/gate/git/refs",
    "PUT repos/quirq-ai/gate/contents/settings/github.toml",
    "PUT repos/quirq-ai/gate/contents/.github/CODEOWNERS",
    "POST repos/quirq-ai/gate/pulls",
    "POST repos/quirq-ai/infra-config/git/refs",
    "PUT repos/quirq-ai/infra-config/contents/config/auto_revert.toml",
    "POST repos/quirq-ai/infra-config/pulls",
    "PATCH repos/quirq-ai/monitoring/properties/values",
    "PATCH orgs/quirq-ai/properties/values",
  ]);
  const branch = String(w[0].body.ref).replace("refs/heads/", "");
  expect(branch).toMatch(/^settings-editor\/gate-\d{8}-\d{6}$/);
  expect(w[1].body).toMatchObject({ sha: blobSha(gateToml), branch });
  expect(Buffer.from(String(w[1].body.content), "base64").toString("utf8")).toBe(gateAfter);
  expect(w[3].body).toMatchObject({ head: branch, base: "main" });
  expect(w[7].body).toEqual({ properties: [{ property_name: "stage", value: "active" }] });
  expect(w[8].body).toEqual({ repository_names: ["innernet"], properties: [{ property_name: "area", value: "infra" }] });
}

describe("the local editor (gh mode)", { timeout: 20_000 }, () => {
  beforeEach(() => {
    process.env.MONITORING_EDITOR = "gh";
    process.env.MONITORING_EDITOR_KEY = KEY;
  });

  it("does the same writes as the script, through gh, reading main through gh", async () => {
    await withFixtures();
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    const result = await applyEdits(request, built.plan.digest);
    expect(result.reason).toBeUndefined();
    expect(result).toMatchObject({ ok: true, login: "sam-example" });
    expect(result.steps.map((s) => s.url ?? null)).toEqual(["https://github.com/quirq-ai/gate/pull/101", "https://github.com/quirq-ai/infra-config/pull/101", null, null]);
    checkWrites(built.plan.prs[0].files[0].after);
  });

  it("creates a CODEOWNERS that does not exist yet", async () => {
    await withFixtures();
    const built = await buildPlan(newOwners);
    if (!built.ok) throw new Error(built.reason);
    const result = await applyEdits(newOwners, built.plan.digest);
    expect(result).toMatchObject({ ok: true });
    checkNewOwners();
  });

  it("refuses a plan other than the one reviewed, a moved file and a signed-out gh, writing nothing", async () => {
    await withFixtures();
    expect(await applyEdits(request, "0".repeat(64))).toMatchObject({ ok: false, reason: expect.stringMatching(/not the one you reviewed/) });
    const built = await buildPlan(request);
    if (!built.ok) throw new Error(built.reason);
    process.env.FAKE_GH_MOVED = "settings/github.toml";
    expect((await applyEdits(request, built.plan.digest)).ok).toBe(false);
    delete process.env.FAKE_GH_MOVED;
    process.env.FAKE_GH_SIGNED_OUT = "1";
    expect(await applyEdits(request, built.plan.digest)).toMatchObject({ ok: false });
    expect(writes()).toEqual([]);
  });
});
