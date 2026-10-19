import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests for the data model (spec 0002). They rebuild a throwaway local
// Postgres from the migrations on every run (see `tests/db/global-setup.ts`), so
// they run one file at a time. `.env.local` is never loaded here: the app's
// database is never touched.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: `${root}tests/db/support/server-only.ts` },
      { find: /^next\/cache$/, replacement: `${root}tests/db/support/next-cache.ts` },
      { find: /^@\//, replacement: root },
    ],
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/support/global-setup.ts"],
    setupFiles: ["tests/db/support/env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
