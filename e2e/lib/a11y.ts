import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Floating content (menus, popovers, tooltips) that Radix portals into <body>. */
const PORTALED = "[data-radix-popper-content-wrapper]";

export interface A11yOptions {
  disableRules?: string[];
  /** Also run axe's best-practice rules (Phase 1 §5). */
  bestPractice?: boolean;
  /**
   * Floating content portalled into <body> sits outside every landmark by
   * design, as it will in the app. It is still checked by every other rule;
   * only `region` ("all content is inside a landmark") skips it.
   */
  allowPortalsOutsideLandmarks?: boolean;
}

/** Fails the test with the full violation list when axe finds a WCAG 2.2 AA problem (SPEC C11). */
export async function expectNoA11yViolations(page: Page, options: A11yOptions = {}): Promise<void> {
  const tags = options.bestPractice === true ? [...WCAG_TAGS, "best-practice"] : WCAG_TAGS;
  const disabled = options.disableRules ?? [];
  const splitRegion = options.allowPortalsOutsideLandmarks === true && !disabled.includes("region");

  const main = await new AxeBuilder({ page })
    .withTags(tags)
    .disableRules(splitRegion ? [...disabled, "region"] : disabled)
    .analyze();
  const violations = [...main.violations];

  if (splitRegion && options.bestPractice === true) {
    const region = await new AxeBuilder({ page }).withRules(["region"]).exclude(PORTALED).analyze();
    violations.push(...region.violations);
  }

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}
