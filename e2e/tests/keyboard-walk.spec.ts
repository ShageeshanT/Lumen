import { expect, test } from "@playwright/test";

import { loadRegistry, openStill } from "../lib/gallery";

// The keyboard pass (Phase 1 §5 Keyboard & accessibility), automated: Tab
// through every gallery page and check that focus never falls back to <body>
// mid-page and that every stop looks different while focused. The look is
// compared with the same element after focus has moved on (outline, shadow,
// background, border, color, on the element and its parent, which carries the
// HUD frame for text inputs), so a component that suppresses the ring without
// drawing its own indicator fails.
const SHARDS = 4;
const MAX_STOPS = 40;

interface Stop {
  label: string;
  focusedLook: string;
  forced: boolean;
}

test.describe("keyboard walk", () => {
  test.describe.configure({ timeout: 300_000 });

  for (let shard = 0; shard < SHARDS; shard += 1) {
    test(`every focus stop is visible (shard ${String(shard + 1)} of ${String(SHARDS)})`, async ({
      page,
    }) => {
      const registry = await loadRegistry(page);
      // Forced-open modals trap focus by design; their pages are walked by the overlay specs.
      const pages = registry.pages.filter(
        (slug, index) => index % SHARDS === shard && !registry.modalPages.includes(slug),
      );
      const invisible: string[] = [];
      for (const slug of pages) {
        await openStill(page, `/dev/components/${slug}`);
        // Start from the page body, after the gallery chrome.
        await page.locator("main h1").first().click();
        let previous: Stop | null = null;
        for (let step = 0; step < MAX_STOPS; step += 1) {
          await page.keyboard.press("Tab");
          const current = await page.evaluate(() => {
            const look = (element: Element | null): string => {
              if (element === null) {
                return "";
              }
              const s = getComputedStyle(element);
              return [
                s.outlineStyle,
                s.outlineWidth,
                s.outlineColor,
                s.boxShadow,
                s.backgroundColor,
                s.borderColor,
                s.color,
                s.textDecorationLine,
              ].join("|");
            };
            const active = document.activeElement;
            if (active === null || active === document.body) {
              return null;
            }
            active.setAttribute("data-walk", "current");
            // Gallery examples that force the focused look show it with or without focus.
            const forced = active.closest('[data-force~="focus"]') !== null;
            const name =
              active.getAttribute("aria-label") ?? active.textContent.trim().slice(0, 40);
            return {
              label: `${active.tagName.toLowerCase()} "${name}"`,
              focusedLook: look(active) + "//" + look(active.parentElement),
              forced,
            };
          });
          if (previous !== null) {
            const blurredLook = await page.evaluate(() => {
              const element = document.querySelector('[data-walk="previous"]');
              if (element === null) {
                return null;
              }
              element.removeAttribute("data-walk");
              const s = (e: Element | null) => {
                if (e === null) {
                  return "";
                }
                const c = getComputedStyle(e);
                return [
                  c.outlineStyle,
                  c.outlineWidth,
                  c.outlineColor,
                  c.boxShadow,
                  c.backgroundColor,
                  c.borderColor,
                  c.color,
                  c.textDecorationLine,
                ].join("|");
              };
              return s(element) + "//" + s(element.parentElement);
            });
            if (!previous.forced && blurredLook !== null && blurredLook === previous.focusedLook) {
              invisible.push(`${slug}: ${previous.label}`);
            }
          }
          if (current === null) {
            break;
          }
          await page.evaluate(() => {
            document.querySelector('[data-walk="current"]')?.setAttribute("data-walk", "previous");
          });
          previous = current;
          // Leave the page's content (focus reached the end or left <main>).
          const inMain = await page.evaluate(
            () => document.activeElement?.closest("main") !== null,
          );
          if (!inMain) {
            break;
          }
        }
      }
      expect(invisible, invisible.join("\n")).toEqual([]);
    });
  }
});
