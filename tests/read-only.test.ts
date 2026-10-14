import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WRITERS } from "@/config/freshness";
import { ghGet } from "@/lib/github";
import { readOpenPulls } from "@/lib/sources/pulls";
import { readReleaseChannels } from "@/lib/sources/release-channels";
import { readWriterRuns } from "@/lib/sources/writer-runs";
import { FIXTURE_TOKEN, withFixtures } from "./helpers/fixtures";

// The dashboard is read-only and the token never leaves api.github.com. These tests hold that
// at the source level (the code) and at the wire (the fixture server counts every request).

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const appFiles = [...["app", "lib", "components", "config"].flatMap((d) => walk(d)), "proxy.ts"].filter((f) => /\.(ts|tsx|mjs)$/.test(f));

describe("read-only", () => {
  it("only lib/fetch.ts and lib/github.ts call fetch, and only with GET", () => {
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      const calls = text.match(/\bfetch\(/g) ?? [];
      if (file.endsWith("lib/fetch.ts") || file.endsWith("lib/github.ts")) {
        expect(calls.length, file).toBeGreaterThan(0);
        expect(text, file).toContain('method: "GET"');
        expect(text, file).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
      } else {
        expect(calls.length, `${file} must not fetch`).toBe(0);
      }
      expect(text.toLowerCase(), `${file} must not use GraphQL`).not.toContain("mutation ");
      expect(text, `${file} must not render fetched HTML`).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("only the settings editor writes, only through gh, and only from apply", () => {
    // The dashboard's own code never writes. The settings editor's writes go through one function,
    // ghWrite in lib/editor/gh.ts, which refuses unless the editor runs locally (pnpm editor), and
    // only lib/editor/apply.ts calls it. Nothing else may start a process, except the `pnpm editor`
    // launcher, which runs `gh auth login` and `next start` and is not part of the app.
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      const gh = file.endsWith("lib/editor/gh.ts");
      expect(/child_process/.test(text), `${file} must not start processes`).toBe(gh || file.endsWith("lib/editor/launch.mjs"));
      // Any mention at all, so a generic call (ghWrite<T>(...)) or an aliased import is caught too.
      if (!gh && !file.endsWith("lib/editor/apply.ts")) expect(text, `${file} must not use ghWrite`).not.toMatch(/\bghWrite\b/);
      // gh.ts only by name: no namespace import (aliased or relative) and no dynamic import.
      expect(text, `${file} must import gh.ts by name`).not.toMatch(/import\s*\*\s*as\s+\w+\s+from\s+["'][^"']*\/gh(\.ts)?["']/);
      expect(text, `${file} must not import gh.ts dynamically`).not.toMatch(/import\(\s*["'][^"']*\/gh(\.ts)?["']\s*\)/);
    }
    expect(readFileSync("lib/editor/apply.ts", "utf8")).toMatch(/import \{[^}]*\bghWrite\b[^}]*\} from "@\/lib\/editor\/gh";/);
    const gh = readFileSync("lib/editor/gh.ts", "utf8");
    expect(gh.match(/spawn\(/g)).toHaveLength(1);
    expect(gh).toContain('spawn("gh", args');
    expect(gh).toMatch(/export async function ghWrite[\s\S]*?if \(editorMode\(\) !== "gh"\) return/);
  });

  it("sends no request that is not a GET and no token to raw", async () => {
    const fixtures = await withFixtures();
    await Promise.all([readReleaseChannels(), readOpenPulls(), ...WRITERS.map((w) => readWriterRuns(w))]);
    expect(fixtures.log.requests).toBeGreaterThan(5);
    expect(fixtures.log.nonGet).toBe(0);
    expect(fixtures.log.authorizationOnRaw).toBe(0);
  });

  it("does not send the token anywhere but api.github.com or loopback", async () => {
    await withFixtures();
    process.env.MONITORING_API_BASE = "https://example.com";
    const result = await ghGet("repos/quirq-ai/monitoring", { revalidate: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no token");
  });

  it("never puts the token in a result", async () => {
    await withFixtures();
    const result = await ghGet("repos/quirq-ai/monitoring/commits/main/check-runs", { revalidate: 0 });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_TOKEN);
  });
});
