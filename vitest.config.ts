import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: process.env.LIVE ? ["tests/live-check.ts"] : ["tests/**/*.test.ts"],
    testTimeout: process.env.LIVE ? 120_000 : 5_000,
  },
});
