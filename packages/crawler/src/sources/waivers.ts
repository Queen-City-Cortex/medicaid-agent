import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

const BASE_URL = 'https://medicaid.ncdhhs.gov';

/**
 * Infer a waiver category from the seed page URL.
 *
 * Mapping:
 *   .../nc-innovations-waiver/...   → "NC Innovations Waiver"
 *   .../1915i                        → "1915(i) HCBS"
 *   .../cap-da                       → "CAP/DA"
 *   .../cap-c                        → "CAP/C"
 *   (fallback)                       → "Waiver"
 */
export function inferWaiverCategory(pageUrl: string): string {
  if (/nc-innovations-waiver/i.test(pageUrl)) {
    return 'NC Innovations Waiver';
  }
  if (/\/1915i/i.test(pageUrl)) {
    return '1915(i) HCBS';
  }
  if (/cap[/-]?da/i.test(pageUrl)) {
    return 'CAP/DA';
  }
  if (/cap[/-]?c/i.test(pageUrl)) {
    return 'CAP/C';
  }
  return 'Waiver';
}

/**
 * Parse a waiver seed page and return all discovered documents.
 *
 * Document links are anchor tags with /download in their href.
 * All links are normalised to absolute URLs (medicaid.ncdhhs.gov base).
 *
 * The category is derived from the page URL via inferWaiverCategory.
 */
export function parseWaiverPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  const category = inferWaiverCategory(pageUrl);

  $('a[href*="/download"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    if (!source_url.includes('/download')) return;
    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    const linkText = $(el).text().trim();
    if (!linkText) return;

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'waiver',
      title: linkText,
      policy_number: null,
      category,
    });
  });

  logger.debug(`parseWaiverPage: found ${docs.length} documents at ${pageUrl}`);
  return docs;
}

/**
 * Main discovery function for waivers.
 *
 * Iterates over the configured seed URLs, fetches each page, and collects
 * all download link documents.
 */
export const waiversSource = {
  // sinceYear ignored: waiver landing pages always list the current waivers and
  // their most recent amendments.
  async discover(fetcher: Fetcher, _sinceYear: number): Promise<DiscoveredDocument[]> {
    const seedUrls = config.sources.waiver.seedUrls as readonly string[];
    const allDocs: DiscoveredDocument[] = [];

    for (const seedUrl of seedUrls) {
      logger.info(`waivers: fetching seed page ${seedUrl}`);
      const { body, statusCode } = await fetcher.fetchHtml(seedUrl);

      if (statusCode !== 200) {
        logger.warn(
          `waivers: unexpected status ${statusCode} for seed page ${seedUrl}`,
        );
        continue;
      }

      const docs = parseWaiverPage(body, seedUrl);
      logger.info(
        `waivers: found ${docs.length} documents at ${seedUrl}`,
      );
      allDocs.push(...docs);
    }

    logger.info(`waivers: total discovered ${allDocs.length} documents`);
    return allDocs;
  },
};
