import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../lib/a11y";

test("the shell loads with a healthy API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lumen" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("API: ok");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await expectNoA11yViolations(page);
  await expect(page).toHaveScreenshot("home.png");
});
