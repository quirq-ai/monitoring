import { defineConfig } from "@playwright/test";
import { origin } from "./tests/e2e/origin";

const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: origin,
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  webServer: {
    command: "pnpm exec next start -p 3010 -H 127.0.0.1",
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
