import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { EDITOR_KEY, editorOrigin, FAKE_GH_LOG, origin } from "./tests/e2e/origin";

const chromiumPath = process.env.PW_CHROMIUM_PATH;
const fixtures = "http://127.0.0.1:3011";

// The pages run against the fixture server, never GitHub: real shapes, no network, a dummy token
// that only ever reaches loopback.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: origin,
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  webServer: [
    {
      command: "node tests/fixtures/server.mjs 3011",
      url: `${fixtures}/raw/quirq-ai/wiki/refs/heads/main/.quirq-wiki-manifest.json`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm exec next start -p 3010 -H 127.0.0.1",
      url: origin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MONITORING_RAW_BASE: `${fixtures}/raw`,
        MONITORING_API_BASE: `${fixtures}/api`,
        GITHUB_TOKEN: "fixture-token-never-real",
      },
    },
    {
      // The settings editor as `pnpm editor` runs it, with tests/fake-gh/gh standing in for gh:
      // it answers from the fixtures and logs every write instead of sending it.
      command: "pnpm exec next start -p 3012 -H 127.0.0.1",
      url: editorOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MONITORING_RAW_BASE: `${fixtures}/raw`,
        MONITORING_API_BASE: `${fixtures}/api`,
        GITHUB_TOKEN: "fixture-token-never-real",
        MONITORING_EDITOR: "gh",
        MONITORING_EDITOR_KEY: EDITOR_KEY,
        FAKE_GH_LOG,
        PATH: `${resolve("tests/fake-gh")}:${process.env.PATH ?? ""}`,
      },
    },
  ],
});
