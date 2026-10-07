import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` throws outside a React Server Components build; tests import lib code directly.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: process.env.LIVE ? ["tests/live-check.ts"] : ["tests/**/*.test.ts"],
    testTimeout: process.env.LIVE ? 120_000 : 5_000,
  },
});
