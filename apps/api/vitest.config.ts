import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 60_000,
    // Suites share one Postgres (schemas per suite) and LISTEN/NOTIFY; running
    // files one at a time keeps the 2 s health-check budget meaningful.
    fileParallelism: false,
  },
});
