import { expect, test } from "@playwright/test";

import { loadRegistry, openStill } from "../lib/gallery";

test.describe("component gallery", () => {
  // The screenshot test walks every gallery page; give it room under parallel load.
  test.describe.configure({ timeout: 600_000 });

  test("every example matches its screenshot", async ({ page }, testInfo) => {
    const registry = await loadRegistry(page);
    const bySlug = new Map<string, string[]>();
    for (const id of registry.examples) {
      const [slug] = id.split("/");
      if (slug !== undefined) {
        bySlug.set(slug, [...(bySlug.get(slug) ?? []), id]);
      }
    }
    let count = 0;
    for (const [slug, ids] of bySlug) {
      await openStill(page, `/dev/components/${slug}`);
      for (const id of ids) {
        const example = page.locator(`[data-gallery-example="${id}"]`);
        await expect(example).toBeVisible();
        // An example taller than the viewport never settles: each screenshot
        // retry scrolls it to a different alignment. Grow the viewport's height
        // (never its width, so the layout is unchanged) for that one capture.
        const viewport = page.viewportSize();
        const box = await example.boundingBox();
        const tall = viewport !== null && box !== null && box.height + 48 > viewport.height;
        if (tall) {
          await page.setViewportSize({ width: viewport.width, height: Math.ceil(box.height) + 96 });
        }
        await expect(example).toHaveScreenshot(`${id.replace("/", "--")}.png`, {
          animations: "disabled",
          caret: "hide",
        });
        if (tall) {
          await page.setViewportSize(viewport);
        }
        count += 1;
      }
    }
    testInfo.annotations.push({ type: "screenshots", description: String(count) });
    expect(count).toBe(registry.examples.length);
  });

  test("tooltips open on keyboard focus", async ({ page }) => {
    await openStill(page, "/dev/components/icon-button");
    const button = page.getByRole("button", { name: "Copy URL" }).first();
    await button.focus();
    await expect(page.getByRole("tooltip")).toContainText("Copy URL");
  });

  test("status markers stop blinking under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/components/status-tag");
    const marker = page.locator('[data-status-marker="building"]').first();
    await expect(marker).toHaveCSS("animation-name", "none");
    await expect(page.locator('[data-status="building"]').first()).toContainText("Building");
  });
});
