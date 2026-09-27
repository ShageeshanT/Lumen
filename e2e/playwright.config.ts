import { defineConfig, devices } from "@playwright/test";

// The three widths every phase screenshots (SPEC C12, C15) × both color schemes.
const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

const schemes = ["dark", "light"] as const;

const isCi = process.env["CI"] !== undefined;

// Overridable so several checkouts (git worktrees) can run suites side by side
// without reusing each other's servers.
const webPort = process.env["E2E_WEB_PORT"] ?? "3000";
const apiPort = process.env["E2E_API_PORT"] ?? "4000";
// The gallery needs no API; visual runs in a container skip it (and Postgres).
const webOnly = process.env["E2E_WEB_ONLY"] === "1";

export default defineConfig({
  testDir: "./tests",
  // Fonts rasterise differently per OS, so each platform keeps its own
  // baselines: win32 for local Windows runs, linux for CI and the Docker
  // script (scripts/visual-linux.sh) that generates them.
  snapshotPathTemplate:
    "{testDir}/../__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  // Both servers are started (or reused when already running). The API entry
  // waits for /v1/health to answer 200, so tests never start against a server
  // whose database is still coming up (503 keeps Playwright waiting).
  webServer: [
    ...(webOnly
      ? []
      : [
          {
            command: "pnpm --filter @lumen/api dev",
            cwd: "..",
            env: { API_PORT: apiPort, WEB_ORIGIN: `http://localhost:${webPort}` },
            url: `http://localhost:${apiPort}/v1/health`,
            reuseExistingServer: !isCi,
            timeout: 180_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
          },
        ]),
    {
      command: `pnpm --filter @lumen/web exec next dev --port ${webPort}`,
      cwd: "..",
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}` },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !isCi,
      timeout: 180_000,
      stderr: "pipe",
    },
  ],
  projects: Object.entries(viewports).flatMap(([size, viewport]) =>
    schemes.map((colorScheme) => ({
      name: `${size}-${colorScheme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport,
        colorScheme,
        ...(size === "mobile" ? { isMobile: true, hasTouch: true } : {}),
      },
    })),
  ),
});
