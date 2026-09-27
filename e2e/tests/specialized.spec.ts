import { expect, test } from "@playwright/test";

// Behaviour of the Specialized components in a real browser: follow mode and
// "Jump to live" against a streaming 50,000-line log, keyboard paths, and the
// reduced-motion contract for edge flow and the title decode.

test.describe("log viewer", () => {
  test.describe.configure({ timeout: 120_000 });

  test("pauses on scroll-up, marks new lines, and jumps back to live", async ({ page }) => {
    await page.goto("/dev/components/logs-perf");
    const list = page.getByRole("list", { name: "Live logs" });
    await expect(list).toBeVisible();
    // Hydrated once the stream has appended a line.
    await expect(page.locator("[data-line-count]")).not.toHaveAttribute("data-line-count", "50000");
    const viewer = page.locator("[data-following]").filter({ has: list });
    await expect(viewer).toHaveAttribute("data-following", "true");

    await list.hover();
    await page.mouse.wheel(0, -2000);
    await expect(viewer).toHaveAttribute("data-following", "false");
    const jump = page.getByRole("button", { name: "Jump to live" });
    await expect(jump).toBeVisible();

    // Lines keep streaming while paused; the boundary marks where they begin.
    // Let the smooth wheel scroll settle before moving the list programmatically.
    await page.waitForTimeout(500);
    await expect(page.locator("[data-log-boundary]")).toHaveCount(0);
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(viewer).toHaveAttribute("data-following", "true");
    await list.hover();
    await page.mouse.wheel(0, -400);
    await expect(viewer).toHaveAttribute("data-following", "false");
    await page.waitForTimeout(600);
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 60;
    });
    await expect(page.locator("[data-log-boundary]")).toHaveCount(1);

    await page.getByRole("button", { name: "Jump to live" }).click();
    await expect(viewer).toHaveAttribute("data-following", "true");
    await expect(jump).toBeHidden();
    const distance = await list.evaluate(
      (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
    );
    expect(distance).toBeLessThan(4);
    expect(await list.locator('[role="listitem"]').count()).toBeLessThan(120);
  });

  test("is keyboard operable: arrows, Space, End", async ({ page }) => {
    await page.goto("/dev/components/log-viewer");
    const list = page.getByRole("list", { name: "Logs" }).first();
    await list.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[role="listitem"]:focus')).toHaveCount(1);
    const viewer = page.locator("[data-following]").first();
    await expect(viewer).toHaveAttribute("data-following", "false");
    await page.keyboard.press("End");
    await expect(viewer).toHaveAttribute("data-following", "true");
    await page.keyboard.press("Space");
    await expect(viewer).toHaveAttribute("data-following", "false");
  });
});

test.describe("canvas and wizard pieces", () => {
  test("a node renames with F2 and cancels with Escape", async ({ page }) => {
    await page.goto("/dev/components/canvas-node");
    const open = page.getByRole("button", { name: "Open admin" });
    const input = page.getByRole("textbox", { name: "Rename admin" });
    // Retry until hydration has attached the key handler (dev server under load).
    await expect(async () => {
      await open.focus();
      await page.keyboard.press("F2");
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("the canvas renders nodes, a group and edges inside React Flow", async ({ page }) => {
    await page.goto("/dev/components/canvas");
    const canvas = page.locator("[data-canvas-flow]").first();
    await expect(canvas.locator(".react-flow__node")).toHaveCount(6);
    await expect(canvas.getByRole("group", { name: "Backend, 2 services" })).toBeVisible();
    await expect(canvas.locator("[data-canvas-edge]")).toHaveCount(4);
  });

  test("the stepper marks the current step and only finished steps are buttons", async ({
    page,
  }) => {
    await page.goto("/dev/components/stepper");
    const nav = page.getByRole("navigation", { name: "Setup progress", exact: true }).first();
    await expect(nav.locator('[aria-current="step"]')).toContainText("Github", {
      ignoreCase: true,
    });
    await expect(nav.getByRole("button")).toHaveCount(3);
  });

  test("a blocked port discloses its fix", async ({ page }) => {
    await page.goto("/dev/components/port-check-card");
    const toggle = page.getByRole("button", { name: /443\/tcp.*Blocked/ }).last();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("sudo ufw allow 443/tcp")).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test("edge flow stops and titles appear without decoding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/components/canvas-edge");
    await expect(page.locator(".edge-flow").first()).toHaveCSS("animation-name", "none");
    await expect(page.locator("main h1").first()).not.toHaveAttribute("data-decoding");
  });

  test("the title decodes once and settles on its text", async ({ page }) => {
    await page.goto("/dev/components/stepper");
    const title = page.locator("main h1").first();
    await expect(title).not.toHaveAttribute("data-decoding", { timeout: 2000 });
    await expect(title).toHaveText("Stepper");
  });
});
