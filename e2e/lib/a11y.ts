import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails the test with the full violation list when axe finds a WCAG 2.2 AA problem (SPEC C11). */
export async function expectNoA11yViolations(
  page: Page,
  options: { disableRules?: string[] } = {},
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(options.disableRules ?? [])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
