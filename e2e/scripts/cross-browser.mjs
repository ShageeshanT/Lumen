// Phase 1 §7 manual check, scripted: focus ring and font rendering in Windows
// Chromium and Firefox. Captures the typography page and a keyboard-focused
// primary button in both themes; the images go to docs/evidence/phase-01/cross-browser/.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox } from "@playwright/test";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/evidence/phase-01/cross-browser",
);
mkdirSync(out, { recursive: true });
const base = `http://localhost:${process.env.E2E_WEB_PORT ?? "3000"}`;

for (const [name, type] of [
  ["chromium", chromium],
  ["firefox", firefox],
]) {
  const browser = await type.launch();
  for (const scheme of ["dark", "light"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      colorScheme: scheme,
    });
    await page.goto(`${base}/dev/components/typography`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.locator("main").screenshot({ path: join(out, `typography-${name}-${scheme}.png`) });
    await page.goto(`${base}/dev/components/button`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.locator("main h1").first().click();
    const target = page.locator("main button").first();
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    const box = await target.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(out, `focus-ring-${name}-${scheme}.png`),
        clip: {
          x: Math.max(box.x - 24, 0),
          y: Math.max(box.y - 24, 0),
          width: box.width + 48,
          height: box.height + 48,
        },
      });
    }
    await page.close();
  }
  await browser.close();
  console.log(`${name} captured`);
}
