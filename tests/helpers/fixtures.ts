import { afterEach } from "vitest";
import { forgetBackoff } from "@/lib/github";
import { createFixtureServer, type FixtureLog, type FixtureRoute } from "../fixtures/server.mjs";

// Start a fixture server for one test and point the sources at it through the same environment
// variables a Playwright run uses. The token is a dummy that only ever reaches loopback.

export const FIXTURE_TOKEN = "fixture-token-never-real";

export type Fixtures = { url: string; log: FixtureLog; close: () => Promise<void> };

const open: Fixtures[] = [];

export async function withFixtures(routes: FixtureRoute[] = []): Promise<Fixtures> {
  forgetBackoff();
  const server = createFixtureServer({ routes });
  const url = await server.listen(0);
  process.env.MONITORING_RAW_BASE = `${url}/raw`;
  process.env.MONITORING_API_BASE = `${url}/api`;
  process.env.GITHUB_TOKEN = FIXTURE_TOKEN;
  const fixtures = { url, log: server.log, close: server.close };
  open.push(fixtures);
  return fixtures;
}

afterEach(async () => {
  for (const f of open.splice(0)) await f.close();
  delete process.env.MONITORING_RAW_BASE;
  delete process.env.MONITORING_API_BASE;
  delete process.env.GITHUB_TOKEN;
});

/** The reason text, or the value's JSON, must never carry the token. */
export function assertNoToken(value: unknown): void {
  const text = JSON.stringify(value);
  if (text.includes(FIXTURE_TOKEN)) throw new Error("token leaked into a signal");
}
