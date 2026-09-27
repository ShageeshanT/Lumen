import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../lib/a11y";
import { loadRegistry, openStill } from "../lib/gallery";

// Phase 1 §5: WCAG 2.2 AA plus axe best practices on every gallery page, in
// every width × theme project. The pages are split into shards so the walk
// runs in parallel instead of as one long test.
const SHARDS = 4;

test.describe("gallery accessibility", () => {
  test.describe.configure({ timeout: 300_000 });

  for (let shard = 0; shard < SHARDS; shard += 1) {
    test(`pages are axe-clean (shard ${String(shard + 1)} of ${String(SHARDS)})`, async ({
      page,
    }) => {
      const registry = await loadRegistry(page);
      const pages = registry.pages.filter((_, index) => index % SHARDS === shard);
      expect(pages.length).toBeGreaterThan(0);
      for (const slug of pages) {
        await openStill(page, `/dev/components/${slug}`);
        await expect(page.locator("main h1").first()).toBeVisible();
        await test.step(slug, async () => {
          // A forced-open modal hides the rest of the page from assistive tech by design.
          await expectNoA11yViolations(page, {
            bestPractice: true,
            ...(registry.modalPages.includes(slug) ? { disableRules: ["aria-hidden-focus"] } : {}),
          });
        });
      }
    });
  }
});
