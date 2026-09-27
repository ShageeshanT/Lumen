import { expect, type Page } from "@playwright/test";

export interface Registry {
  pages: string[];
  modalPages: string[];
  examples: string[];
}

export async function loadRegistry(page: Page): Promise<Registry> {
  const response = await page.request.get("/dev/components/registry.json");
  expect(response.ok()).toBe(true);
  return (await response.json()) as Registry;
}

export async function openStill(page: Page, path: string) {
  // Freeze time so blinking markers and spinners screenshot at a fixed frame.
  await page.clock.install({ time: new Date("2026-09-26T12:00:00Z") });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  // Let queued frames run so boot-in entrances start, then let them finish.
  await page.clock.runFor(1000);
  await page.waitForTimeout(800);
}
