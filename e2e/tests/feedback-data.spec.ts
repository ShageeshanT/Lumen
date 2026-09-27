import { expect, test } from "@playwright/test";

// Behaviour checks for the Phase 1 feedback and data-display components, on
// the real gallery pages. Screenshots and axe live in gallery.spec.ts.

test.describe("toasts", () => {
  test("stack three at most and dismiss on their timers (fake clock)", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-26T12:00:00Z") });
    await page.goto("/dev/components/toast");
    // Closed toasts keep playing their exit animation; count the open ones.
    const toasts = page.locator('[data-toast-id][data-state="open"]');
    const save = page.getByRole("button", { name: "Save variables" });
    const warn = page.getByRole("button", { name: "Warn", exact: true });

    await save.click();
    await page.clock.runFor(1000);
    await warn.click();
    await page.clock.runFor(1000);
    await save.click();
    await page.clock.runFor(1000);
    await warn.click();
    await expect(toasts).toHaveCount(3);
    // Newest at the bottom.
    await expect(toasts.last()).toContainText("Server is running low on disk");

    // Hovering the newest pauses it while the others run out.
    await toasts.last().hover();
    await page.clock.runFor(9000);
    await expect(toasts).toHaveCount(1);
    await page.mouse.move(0, 0);
    await page.clock.runFor(9000);
    await expect(toasts).toHaveCount(0);
  });

  test("F8 focuses the newest toast and Escape closes it", async ({ page }) => {
    await page.goto("/dev/components/toast");
    await page.getByRole("button", { name: "Delete a variable" }).click();
    await page.keyboard.press("F8");
    const newest = page.locator("[data-toast-id]").last();
    await expect(newest).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-toast-id][data-state="open"]')).toHaveCount(0);
  });

  test("danger toasts are alerts inside a polite region", async ({ page }) => {
    await page.goto("/dev/components/toast");
    await page.getByRole("button", { name: "Fail a deploy" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Deploy failed" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Notifications" }).locator("ol")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

test.describe("data table", () => {
  test("sorts from the keyboard and moves between rows with arrows", async ({ page }) => {
    await page.goto("/dev/components/data-table");
    const table = page.getByRole("table", { name: "Deployments" }).first();
    const duration = table.getByRole("button", { name: /Duration/ });
    await duration.focus();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toHaveAttribute(
      "aria-sort",
      /ascending|descending/,
    );
    await expect(table.getByRole("columnheader", { name: /When/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );

    const rows = table.locator("tbody tr[data-row-index]");
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "View logs" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("the 5,000-row audit log keeps only a window of rows in the DOM", async ({ page }) => {
    await page.goto("/dev/components/data-table");
    const table = page.getByRole("table", { name: "Audit log" });
    await expect(table).toHaveAttribute("aria-rowcount", "5001");
    const rendered = await table.locator("tbody tr[data-row-index]").count();
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(80);
    const scroller = table.locator("xpath=..");
    // Retry until hydration has attached the virtualizer's scroll listener.
    await expect(async () => {
      await scroller.evaluate((element) => {
        element.scrollTop = 0;
        element.scrollTop = element.scrollHeight;
      });
      await expect(table.locator('tbody tr[aria-rowindex="5001"]')).toBeAttached({ timeout: 500 });
    }).toPass();
  });
});

test.describe("chart", () => {
  test("has a summary and a keyboard crosshair", async ({ page }) => {
    await page.goto("/dev/components/chart");
    const chart = page.getByRole("img", { name: /^CPU, last 1 hour: minimum/ }).first();
    await expect(chart).toBeVisible();
    await chart.focus();
    await page.keyboard.press("End");
    await expect(chart.locator("xpath=..").getByRole("status")).toContainText("CPU");
    await page.keyboard.press("Escape");
  });
});
