import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../lib/a11y";
import { loadRegistry, openStill } from "../lib/gallery";

// Phase 1 §5: WCAG 2.2 AA plus axe best practices on every gallery page, in
// every width × theme project. The pages are split into shards so the walk
// runs in parallel instead of as one long test.
const SHARDS = 4;

// A gallery page shows the same component several times (every state side by
// side) and nests shell demos inside the gallery's own header, so landmark
// uniqueness and banner placement cannot hold on it. Phase 5 checks those on
// real pages, where each landmark appears once.
const GALLERY_ONLY = [
  "landmark-unique",
  "landmark-no-duplicate-banner",
  "landmark-banner-is-top-level",
  "landmark-complementary-is-top-level",
];

// A forced-open modal hides the rest of the page from assistive tech by design,
// so the page-level rules see no main, no h1 and content outside landmarks.
const MODAL_PAGE = ["aria-hidden-focus", "page-has-heading-one", "landmark-one-main", "region"];

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
          await expectNoA11yViolations(page, {
            bestPractice: true,
            allowPortalsOutsideLandmarks: true,
            disableRules: [
              ...GALLERY_ONLY,
              ...(registry.modalPages.includes(slug) ? MODAL_PAGE : []),
            ],
          });
        });
      }
    });
  }
});
