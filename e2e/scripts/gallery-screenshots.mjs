// Captures gallery pages in both themes for docs/evidence. Expects `pnpm dev` to
// be running. Usage (from the repository root):
//   node e2e/scripts/gallery-screenshots.mjs phase-01 tokens typography
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const [phase = "phase-01", ...pages] = process.argv.slice(2);
if (pages.length === 0) {
  console.error("usage: node e2e/scripts/gallery-screenshots.mjs <phase> <page> [page…]");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../..");
const outDir = resolve(root, "docs/evidence", phase);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: theme,
  });
  const page = await context.newPage();
  for (const name of pages) {
    await page.goto(`http://localhost:3000/dev/components/${name}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const file = resolve(outDir, `gallery-${name}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
    console.log("wrote", file);
  }
  await context.close();
}
await browser.close();
