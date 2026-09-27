import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Keyboard contract of every overlay (Phase 1 §4.9): it opens from the
 * keyboard, is announced with a role and a name, keeps Tab inside while
 * modal, closes on Escape and hands focus back to whatever opened it.
 * Gallery pages also show overlays forced open as non-modal previews, so the
 * live modal is always located by aria-modal.
 */

/** Go to a gallery page and wait for hydration, so keys reach React handlers. */
async function visit(page: Page, slug: string) {
  await page.goto(`/dev/components/${slug}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`[data-gallery-page="${slug}"]`)).toBeVisible();
}

const modal = (page: Page) => page.locator('[aria-modal="true"]');

async function expectFocusInside(page: Page, container: Locator) {
  const inside = await container.evaluate((node) => node.contains(document.activeElement));
  expect(inside).toBe(true);
}

/** Tab (and Shift+Tab) several times; focus must never leave the container. */
async function expectTrapped(page: Page, container: Locator, presses = 8) {
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Tab");
    await expectFocusInside(page, container);
  }
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await expectFocusInside(page, container);
  }
}

test.describe("overlay keyboard", () => {
  test("modal: opens, traps focus, Escape closes, focus returns", async ({ page }) => {
    await visit(page, "modal");
    const trigger = page.getByRole("button", { name: "Review changes" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = modal(page);
    await expect(dialog).toHaveRole("dialog");
    await expect(dialog).toHaveAccessibleName("Review 3 changes");
    await expectFocusInside(page, dialog);
    await expectTrapped(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("confirm dialog: typed name unlocks delete, Escape cancels", async ({ page }) => {
    await visit(page, "confirm-dialog");
    const trigger = page
      .locator('[data-gallery-example="confirm-dialog/interactive"]')
      .getByRole("button", { name: "Delete service" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = modal(page);
    await expect(dialog).toHaveRole("alertdialog");
    await expect(dialog).toHaveAccessibleName("Delete api?");
    const field = dialog.getByRole("textbox", { name: "Type api to confirm" });
    await expect(field).toBeFocused();
    const confirm = dialog.getByRole("button", { name: "Delete service" });
    await expect(confirm).toBeDisabled();
    await page.keyboard.type("API");
    await expect(confirm).toBeDisabled();
    await field.fill("api");
    await expect(confirm).toBeEnabled();
    await expectTrapped(page, dialog, 5);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("command palette: ⌘K / Ctrl+K opens, Tab stays, Escape restores", async ({ page }) => {
    await visit(page, "command-palette");
    const search = page
      .locator('[data-gallery-example="command-palette/interactive"]')
      .getByRole("button", { name: "Search" });
    await search.focus();
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = modal(page);
    await expect(dialog).toHaveAccessibleName("Command palette");
    const input = dialog.getByRole("combobox");
    await expect(input).toBeFocused();
    await page.keyboard.type("add");
    await page.keyboard.press("ArrowDown");
    await expectTrapped(page, dialog, 3);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(search).toBeFocused();
  });

  test("dropdown menu: Enter opens, arrows move, Escape returns focus", async ({ page }) => {
    await visit(page, "dropdown-menu");
    const trigger = page.getByRole("button", { name: "Actions", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Actions", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Open shell" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Restart" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("popover: focus moves in, Escape closes and returns focus", async ({ page }) => {
    await visit(page, "popover");
    const trigger = page.getByRole("button", { name: "Last hour" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Time range" });
    await expect(dialog).toBeVisible();
    await expectFocusInside(page, dialog);
    // Focus lands on Close, whose tooltip is the top layer: the first Escape
    // hides the tooltip, the next one closes the popover.
    for (let attempt = 0; attempt < 2 && (await dialog.count()) > 0; attempt += 1) {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("sheet: opens, traps focus, Escape closes, focus returns", async ({ page }) => {
    await visit(page, "sheet");
    const trigger = page.getByRole("button", { name: "Deployment actions" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = modal(page);
    await expect(dialog).toHaveAccessibleName("Deployment a1b2c3d");
    await expectFocusInside(page, dialog);
    await expectTrapped(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("context menu: Shift+F10 opens on the focused line", async ({ page }) => {
    await visit(page, "context-menu");
    const line = page.locator('[data-log-line="error"]');
    await line.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "Copy line" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Copy line" })).toHaveCount(0);
  });
});

test.describe("navigation keyboard", () => {
  test("tabs: arrows, Home and End move and activate", async ({ page }) => {
    await visit(page, "tabs");
    const list = page
      .locator('[data-gallery-example="tabs/service"]')
      .getByRole("tablist", { name: "Service sections" });
    await list.getByRole("tab", { name: /Deployments/ }).focus();
    await page.keyboard.press("ArrowRight");
    const variables = list.getByRole("tab", { name: "Variables" });
    await expect(variables).toBeFocused();
    await expect(variables).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(list.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(list.getByRole("tab", { name: /Deployments/ })).toBeFocused();
  });

  test("rail: arrows move between destinations", async ({ page }) => {
    await visit(page, "rail");
    const rail = page
      .locator('[data-gallery-example="rail/interactive"]')
      .getByRole("navigation", { name: "Main" });
    await rail.getByRole("link", { name: "Home" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(rail.getByRole("link", { name: "Projects" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(rail.getByRole("link", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rail.getByRole("link", { name: "Home" })).toBeFocused();
  });
});
