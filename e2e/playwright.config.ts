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
  webServer: {
    command: "pnpm dev",
    cwd: "..",
    url: "http://localhost:3000",
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
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
