import { expect, test, type Page } from "@playwright/test";

const DARK_BG = "rgb(13, 15, 18)";
const LIGHT_BG = "rgb(247, 247, 245)";

async function storedPreference(page: Page, value: string | null) {
  await page.addInitScript((stored) => {
    if (stored === null) {
      localStorage.removeItem("lumen.theme");
    } else {
      localStorage.setItem("lumen.theme", stored);
    }
  }, value);
}

async function throttleCpu(page: Page, rate: number) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate });
}

async function firstPaintState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return page.evaluate(() => ({
    theme: document.documentElement.dataset["theme"],
    colorScheme: document.documentElement.style.colorScheme,
    // The page background lives on <html> (packages/ui/src/styles/reset.css).
    bodyBackground: getComputedStyle(document.documentElement).backgroundColor,
    bgToken: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
  }));
}

test.describe("theme", () => {
  test("stored dark renders dark on the first painted frame at 6× CPU throttle", async ({
    page,
  }) => {
    await storedPreference(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await throttleCpu(page, 6);
    const state = await firstPaintState(page);
    expect(state.theme).toBe("dark");
    expect(state.colorScheme).toBe("dark");
    expect(state.bodyBackground).toBe(DARK_BG);
    expect(state.bgToken).toBe("#0d0f12");
  });

  test("stored light renders light on the first painted frame", async ({ page }) => {
    await storedPreference(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await throttleCpu(page, 6);
    const state = await firstPaintState(page);
    expect(state.theme).toBe("light");
    expect(state.bodyBackground).toBe(LIGHT_BG);
    expect(state.bgToken).toBe("#f7f7f5");
  });

  test("system follows the OS and updates live without a reload", async ({ page }) => {
    await storedPreference(page, "system");
    await page.emulateMedia({ colorScheme: "light" });
    const state = await firstPaintState(page);
    expect(state.theme).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
      .toBe(DARK_BG);
  });

  test("no stored preference behaves as system", async ({ page }) => {
    await storedPreference(page, null);
    await page.emulateMedia({ colorScheme: "light" });
    const state = await firstPaintState(page);
    expect(state.theme).toBe("light");
  });

  test("Tailwind utilities resolve to the token values", async ({ page }) => {
    await storedPreference(page, "dark");
    await page.goto("/dev/components/tokens");
    const swatch = page.locator('[data-gallery-page="tokens"] li').first().locator("span").first();
    await expect(swatch).toHaveCSS("background-color", DARK_BG);
    const surface = page.locator('[data-gallery-page="tokens"] li').first();
    await expect(surface).toHaveCSS("background-color", "rgb(20, 23, 27)");
    await expect(surface).toHaveCSS("border-top-left-radius", "10px");
  });
});
