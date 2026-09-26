// Records Direction D's boot-in, decode, hover and theme switch as a WebM.
// Usage (from the repository root): node e2e/scripts/direction-video.mjs
import { mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "../..");
const dir = resolve(root, "docs/design/directions");
const outDir = resolve(dir, "screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.goto(pathToFileURL(resolve(dir, "d-signal.html")).href);
await page.waitForTimeout(1800);
for (const selector of [
  ".node.sel",
  '[aria-label="postgres, Active"]',
  ".staged .btn.primary",
  "aside .btn.primary",
]) {
  await page.hover(selector);
  await page.waitForTimeout(700);
}
await page.click("#tabs button:nth-child(3)");
await page.waitForTimeout(600);
await page.click("#tabs button:nth-child(1)");
await page.waitForTimeout(600);
await page.click("#theme");
await page.waitForTimeout(1200);
await page.reload();
await page.waitForTimeout(1800);
const video = page.video();
await context.close();
await browser.close();
if (video) {
  const file = resolve(outDir, "d-signal-motion.webm");
  renameSync(await video.path(), file);
  console.log("wrote", file);
}
