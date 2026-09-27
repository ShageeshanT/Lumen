import { expect, test } from "@playwright/test";

// The resizable inspector exists at 1280 px and up (docked) and 1024–1279
// (overlay); phones get a sheet. The width contract is tested where it docks.
test.describe("side panel", () => {
  test.beforeEach(({ viewport }) => {
    test.skip((viewport?.width ?? 0) < 1280, "the panel docks at 1280 px and up");
  });

  const example = '[data-gallery-example="side-panel/interactive"]';

  test("drag resizes and the width survives a reload", async ({ page }) => {
    await page.goto("/dev/components/side-panel");
    await page.waitForLoadState("networkidle");
    const handle = page.locator(example).getByRole("separator", { name: "Resize panel" });
    const panel = page.locator(example).getByRole("complementary", { name: "Service inspector" });
    await expect(handle).toHaveAttribute("aria-valuenow", "560");

    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 4 });
    await page.mouse.move(x - 120, y, { steps: 4 });
    // While dragging the page cannot select text and shows the resize cursor.
    await expect(page.locator("body")).toHaveCSS("cursor", "col-resize");
    await page.mouse.up();

    await expect(handle).toHaveAttribute("aria-valuenow", "680");
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(680);
    expect(await page.evaluate(() => localStorage.getItem("lumen.panel.width"))).toBe("680");

    await page.reload();
    await expect(handle).toHaveAttribute("aria-valuenow", "680");
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(680);
  });

  test("the separator resizes from the keyboard within 480–880", async ({ page }) => {
    await page.goto("/dev/components/side-panel");
    await page.waitForLoadState("networkidle");
    const handle = page.locator(example).getByRole("separator", { name: "Resize panel" });
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "576");
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "880");
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "880");
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "480");

    await page.reload();
    await expect(handle).toHaveAttribute("aria-valuenow", "480");
  });

  test("Escape closes, reopening focuses the title, focus returns to the opener", async ({
    page,
  }) => {
    await page.goto("/dev/components/side-panel");
    await page.waitForLoadState("networkidle");
    const scope = page.locator(example);
    const panel = scope.getByRole("complementary", { name: "Service inspector" });
    await scope.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toBeHidden();

    const opener = scope.getByRole("button", { name: "Open inspector" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "api" })).toBeFocused();
    // Not a dialog: Tab can leave the panel for the canvas.
    await expect(panel).not.toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
