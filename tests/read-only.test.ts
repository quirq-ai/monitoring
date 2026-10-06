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

const appFiles = ["app", "lib", "components", "config"].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx)$/.test(f));

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
