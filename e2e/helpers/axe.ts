import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** A violation that is already tracked: one axe rule on one part of the page. */
export interface KnownViolation {
  rule: string;
  /** CSS selector; a failing node is excused when it matches or sits inside it. */
  selector: string;
}

const WCAG_A_AND_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Scan the page against the WCAG 2.1 A and AA rules and fail on every
 * violation that is not listed in `known`. An exclusion covers one rule on
 * one selector, so the same rule failing anywhere else still fails the test.
 */
export async function expectNoNewViolations(page: Page, known: KnownViolation[] = []): Promise<void> {
  // Entrance animations fade content in; a scan mid-fade measures blended
  // colours. Wait for the finite ones (the loading pulse never finishes).
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)),
  ));

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AND_AA).analyze();

  const unexpected: string[] = [];
  for (const violation of violations) {
    const selectors = known.filter((entry) => entry.rule === violation.id).map((entry) => entry.selector);
    for (const node of violation.nodes) {
      const target = node.target.map(String).join(' ');
      const excused = selectors.length > 0 && await page.evaluate(
        ([nodeSelector, knownSelectors]) => {
          const element = document.querySelector(nodeSelector as string);
          return !!element && (knownSelectors as string[]).some((selector) => element.closest(selector));
        },
        [String(node.target[0]), selectors] as const,
      );
      if (!excused) {
        const detail = node.any[0]?.message ?? node.all[0]?.message ?? node.none[0]?.message ?? violation.help;
        unexpected.push(`${violation.id} [${violation.impact}] ${target}\n    ${detail}`);
      }
    }
  }

  expect(unexpected, 'Accessibility violations not covered by a known exclusion').toEqual([]);
}
