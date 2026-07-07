import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { singleIndexSource } from './crawl-helpers.js';
import type { DiscoveredDocument } from './types.js';

const BASE_URL = 'https://medicaid.ncdhhs.gov';

/**
 * Extract a policy number from link text.
 * Common formats:
 *   "1N-1, Allergy Testing"          → "1N-1"
 *   "15, Ambulance Services"         → "15"
 *   "8A, Enhanced Mental Health..."  → "8A"
 *
 * The policy number is the token before the first comma.
 * Returns null if no comma is found or the prefix looks too long (>20 chars).
 */
export function parsePolicyTitle(text: string): {
  policy_number: string | null;
  title: string;
} {
  const trimmed = text.trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1 || commaIdx > 20) {
    return { policy_number: null, title: trimmed };
  }
  const policy_number = trimmed.slice(0, commaIdx).trim();
  const title = trimmed.slice(commaIdx + 1).trim();
  return { policy_number, title };
}

/**
 * Parse the NC Medicaid clinical coverage policies index page.
 *
 * Page structure (Drupal-rendered):
 *   .field--name-field-editor .field__item
 *     <h3>Category Name</h3>
 *     <ul>
 *       <li><a href="/slug/download?attachment">Policy Number, Title</a></li>
 *       ...
 *     </ul>
 *     <h3>Next Category</h3>
 *     ...
 */
export function parseClinicalPoliciesPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];

  // Find all anchor tags with /download in their href
  $('a[href*="/download"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    // Build absolute URL
    const source_url = href.startsWith('http')
      ? href
      : `${BASE_URL}${href}`;

    // Only process links that are truly download links
    if (!source_url.includes('/download')) return;

    const linkText = $(el).text().trim();
    if (!linkText) return;

    const { policy_number, title } = parsePolicyTitle(linkText);

    // Walk up the DOM to find the nearest preceding h3 sibling for category
    // The h3 and ul are siblings inside .field__item
    let category: string | null = null;
    const parentLi = $(el).closest('li');
    const parentUl = parentLi.parent('ul');
    if (parentUl.length > 0) {
      // Look for the preceding h3 sibling of the ul
      const prevH3 = parentUl.prevAll('h3').first();
      if (prevH3.length > 0) {
        category = prevH3.text().trim() || null;
      }
    }

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'clinical_policy',
      title: title || linkText,
      policy_number,
      category,
    });
  });

  logger.debug(`parseClinicalPoliciesPage: found ${docs.length} documents`);
  return docs;
}

// sinceYear ignored: this index lists the current clinical coverage policy set;
// there is no year-level metadata on the listing page to filter on.
export const clinicalPoliciesSource = singleIndexSource({
  logPrefix: 'clinical-policies',
  indexUrl: () => config.sources.clinical_policy.indexUrl,
  parse: parseClinicalPoliciesPage,
});
