// Screenshots the three design-direction pages at 1440×900 in both themes.
// Usage (from the repository root): node e2e/scripts/direction-screenshots.mjs
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "../..");
const dir = resolve(root, "docs/design/directions");
const outDir = resolve(dir, "screenshots");
mkdirSync(outDir, { recursive: true });

const pages = ["a-instrument", "b-studio", "c-console", "d-signal"];
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

for (const name of pages) {
  await page.goto(pathToFileURL(resolve(dir, `${name}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.waitForTimeout(1200);
    const file = resolve(outDir, `${name}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
    console.log("wrote", file);
  }
}

await browser.close();
