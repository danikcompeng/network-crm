import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // The real package throws outside a Server Components build; tests
      // import server files directly, so give them an empty stand-in.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // *.test.ts only. Playwright's end-to-end tests are *.e2e.ts, so the
    // two runners never pick up each other's files.
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts", "*.test.ts"],
    // Real Postgres (PGlite) takes a moment to start in each database test file.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
