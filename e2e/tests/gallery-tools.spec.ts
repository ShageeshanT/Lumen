import { expect, test } from "@playwright/test";

// The gallery's own tools (Phase 1 §4.15): filter, density, Run axe.
test.describe("gallery tools", () => {
  test("the filter narrows the navigation and / focuses it", async ({ page }) => {
    await page.goto("/dev/components/button");
    const nav = page.getByRole("navigation", { name: "Gallery" });
    await page.locator("main").click();
    await page.keyboard.press("/");
    const filter = nav.getByRole("searchbox", { name: "Filter components" });
    await expect(filter).toBeFocused();
    await filter.fill("dialog");
    await expect(nav.getByRole("link", { name: "Confirm dialog" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Button", exact: true })).toHaveCount(0);
    await filter.fill("zzz");
    await expect(nav.getByRole("status")).toContainText("No pages match");
  });

  test("density applies to the whole page and survives a reload", async ({ page }) => {
    await page.goto("/dev/components/data-table");
    const html = page.locator("html");
    await expect(html).not.toHaveAttribute("data-density", "compact");
    await page.getByRole("radio", { name: "Compact" }).click();
    await expect(html).toHaveAttribute("data-density", "compact");
    await expect(page.locator("[data-dense]").first()).toBeVisible();
    await page.reload();
    await expect(html).toHaveAttribute("data-density", "compact");
    await page.getByRole("radio", { name: "Comfortable" }).click();
    await expect(html).not.toHaveAttribute("data-density", "compact");
  });

  test("Run axe reports on the current page", async ({ page }) => {
    await page.goto("/dev/components/badge");
    await page.getByRole("button", { name: "Run axe" }).click();
    const dialog = page.getByRole("dialog", { name: "No violations" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Axe: clean" })).toBeVisible();
  });
});
