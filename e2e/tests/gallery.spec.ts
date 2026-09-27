import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../lib/a11y";

interface Registry {
  pages: string[];
  modalPages: string[];
  examples: string[];
}

async function loadRegistry(page: Page): Promise<Registry> {
  const response = await page.request.get("/dev/components/registry.json");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Registry;
}

async function openStill(page: Page, path: string) {
  // Freeze time so blinking markers and spinners screenshot at a fixed frame.
  await page.clock.install({ time: new Date("2026-09-26T12:00:00Z") });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // Let queued frames run so boot-in entrances start, then let them finish.
  await page.clock.runFor(1000);
  await page.waitForTimeout(800);
}

test.describe("component gallery", () => {
  // Two tests walk every gallery page; give them room under parallel load.
  test.describe.configure({ timeout: 600_000 });

  test("every page is axe-clean", async ({ page }) => {
    const registry = await loadRegistry(page);
    for (const slug of registry.pages) {
      await openStill(page, `/dev/components/${slug}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      // A forced-open modal hides the rest of the page from assistive tech by design.
      await expectNoA11yViolations(
        page,
        registry.modalPages.includes(slug) ? { disableRules: ["aria-hidden-focus"] } : {},
      );
    }
  });

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
        await expect(example).toHaveScreenshot(`${id.replace("/", "--")}.png`, {
          animations: "disabled",
          caret: "hide",
        });
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
