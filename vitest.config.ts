import { defineConfig } from "vitest/config";

// Root config so `pnpm vitest` runs every package's suite; each package also
// runs on its own through `turbo run test`.
export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "apps/api/vitest.config.ts",
      "apps/web/vitest.config.ts",
    ],
  },
});
