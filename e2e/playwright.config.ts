import { defineConfig, devices } from "@playwright/test";

// The three widths every phase screenshots (SPEC C12, C15) × both color schemes.
const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

const schemes = ["dark", "light"] as const;

const isCi = process.env["CI"] !== undefined;

export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate: "{testDir}/../__screenshots__/{testFileName}/{arg}-{projectName}{ext}",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  // Both servers are started (or reused when already running). The API entry
  // waits for /v1/health to answer 200, so tests never start against a server
  // whose database is still coming up (503 keeps Playwright waiting).
  webServer: [
    {
      command: "pnpm --filter @lumen/api dev",
      cwd: "..",
      url: "http://localhost:4000/v1/health",
      reuseExistingServer: !isCi,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @lumen/web dev",
      cwd: "..",
      url: "http://localhost:3000",
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
