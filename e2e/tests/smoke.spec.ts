import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../lib/a11y";

test("the shell loads with a healthy API", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lumen" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("API: ok");
  // No stored preference means "system", so the theme follows the project's color scheme.
  const expectedTheme = testInfo.project.use.colorScheme === "light" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await expectNoA11yViolations(page);
  await expect(page).toHaveScreenshot("home.png");
});
