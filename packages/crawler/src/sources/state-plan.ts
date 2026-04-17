import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

const BASE_URL = 'https://medicaid.ncdhhs.gov';

/**
 * Extract a SPA number from link text or surrounding text.
 *
 * Common formats found on the NC Medicaid site:
 *   "SPA 26-0001 10-Day Public Notice ..."  → "SPA 26-0001"
 *   "SPA NC 24-0001 ..."                    → "SPA NC 24-0001"
 *   "NC-24-0001 ..."                         → "NC-24-0001"
 *   "24-0001 ..."                            → "24-0001"
 *
 * Returns null if no recognisable SPA number is found.
 */
export function parseSpaNumber(text: string): string | null {
  // Match "SPA [NC] YY-NNNN" patterns
  const spaMatch = text.match(/\bSPA\s+(?:NC[\s-]+)?(\d{2}[\s-]\d{4})\b/i);
  if (spaMatch) {
    return `SPA ${spaMatch[1].replace(/\s+/, '-')}`;
  }

  // Match bare "YY-NNNN" (two digit year dash four digit number) at start of text
  const bareMatch = text.match(/^((?:NC-?)?\d{2}-\d{4})\b/);
  if (bareMatch) {
    return bareMatch[1];
  }

  return null;
}

/**
 * Parse the NC Medicaid State Plan public-notices index page.
 *
 * Returns:
 *  - documents: direct download links found on the index page itself
 *  - subPageUrls: links to yearly sub-pages (proposed notices, 10-day postings, etc.)
 *    Only medicaid.ncdhhs.gov URLs are included; old dma.ncdhhs.gov links are skipped.
 *
 * Sub-page URL patterns we track:
 *   proposed-public-notices, ten-day-postings?, proposed-amendments-sent, spa-updates
 */
export function parseStatePlanIndexPage(
  html: string,
  pageUrl: string,
): { subPageUrls: string[]; documents: DiscoveredDocument[] } {
  const $ = cheerio.load(html);
  const documents: DiscoveredDocument[] = [];
  const subPageUrls: string[] = [];
  const seenUrls = new Set<string>();

  const SPA_SUBPAGE_RE =
    /proposed-public-notices|ten-day-postings?|proposed-amendments-sent|spa-updates/;

  // ── Direct download links ────────────────────────────────────────────────
  $('a[href*="/download"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    if (!source_url.includes('/download')) return;
    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    const linkText = $(el).text().trim();
    if (!linkText) return;

    const policy_number = parseSpaNumber(linkText);

    // Walk up to find the nearest h2/h3 for category
    let category: string | null = null;
    const parents = $(el).parents();
    parents.each((_j, parent) => {
      if (category) return;
      const prevHeading = $(parent).prevAll('h2, h3').first();
      if (prevHeading.length > 0) {
        category = prevHeading.text().trim() || null;
      }
    });

    documents.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'state_plan_amendment',
      title: linkText,
      policy_number,
      category,
    });
  });

  // ── /open document links (used for some SPA files) ────────────────────────
  $('a[href*="/open"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    // Filter to medicaid.ncdhhs.gov /open links only (not nc.gov budget etc.)
    if (!source_url.includes('medicaid.ncdhhs.gov')) return;
    if (!source_url.endsWith('/open') && !source_url.includes('/open?')) return;
    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    const linkText = $(el).text().trim();
    if (!linkText) return;

    const policy_number = parseSpaNumber(linkText);

    documents.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'state_plan_amendment',
      title: linkText,
      policy_number,
      category: null,
    });
  });

  // ── Sub-page discovery ───────────────────────────────────────────────────
  const seenSubPages = new Set<string>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || href.includes('/download')) return;

    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Only follow medicaid.ncdhhs.gov sub-pages (not legacy dma.ncdhhs.gov)
    if (!url.includes('medicaid.ncdhhs.gov')) return;
    if (!SPA_SUBPAGE_RE.test(url)) return;
    if (seenSubPages.has(url)) return;

    seenSubPages.add(url);
    subPageUrls.push(url);
  });

  logger.debug(
    `parseStatePlanIndexPage: ${documents.length} direct docs, ${subPageUrls.length} sub-pages`,
  );
  return { documents, subPageUrls };
}

/**
 * Parse a yearly SPA sub-page (e.g. "2026 Proposed Public Notices").
 *
 * These pages list SPA documents as:
 *  - <a href="...download?attachment"> links
 *  - <a href=".../open"> links (direct document viewer)
 *
 * Returns an array of DiscoveredDocument.
 */
export function parseSubPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  // ── Download links ──────────────────────────────────────────────────────
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
      source_type: 'state_plan_amendment',
      title: linkText,
      policy_number: parseSpaNumber(linkText),
      category: null,
    });
  });

  // ── /open document links ─────────────────────────────────────────────────
  $('a[href*="/open"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    if (!source_url.includes('medicaid.ncdhhs.gov')) return;
    if (!source_url.endsWith('/open') && !source_url.includes('/open?')) return;
    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    const linkText = $(el).text().trim();
    if (!linkText) return;

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'state_plan_amendment',
      title: linkText,
      policy_number: parseSpaNumber(linkText),
      category: null,
    });
  });

  logger.debug(`parseSubPage: found ${docs.length} documents at ${pageUrl}`);
  return docs;
}

/**
 * Main discovery function for state plan amendments.
 *
 * 1. Fetches the index page and collects direct documents + sub-page URLs.
 * 2. Fetches each sub-page (yearly proposed-notices, 10-day postings, sent-to-CMS).
 * 3. Returns all discovered documents deduplicated by source_url.
 */
export const statePlanSource = {
  // TODO: SPA pages carry filing dates; once the pagination becomes year-aware we
  // can skip SPAs older than sinceYear. For now the signature accepts the arg so
  // every SourceModule has a uniform shape.
  async discover(fetcher: Fetcher, _sinceYear: number): Promise<DiscoveredDocument[]> {
    const indexUrl = config.sources.state_plan_amendment.indexUrl;
    logger.info(`state-plan: fetching index ${indexUrl}`);

    const { body: indexHtml, statusCode: indexStatus } =
      await fetcher.fetchHtml(indexUrl);
    if (indexStatus !== 200) {
      logger.warn(
        `state-plan: unexpected status ${indexStatus} for index ${indexUrl}`,
      );
      return [];
    }

    const { documents: indexDocs, subPageUrls } = parseStatePlanIndexPage(
      indexHtml,
      indexUrl,
    );
    logger.info(
      `state-plan: ${indexDocs.length} direct docs, ${subPageUrls.length} sub-pages`,
    );

    const allDocs: DiscoveredDocument[] = [...indexDocs];
    const seenUrls = new Set<string>(indexDocs.map((d) => d.source_url));

    // Fetch each sub-page
    for (const subPageUrl of subPageUrls) {
      logger.info(`state-plan: fetching sub-page ${subPageUrl}`);
      const { body: subHtml, statusCode: subStatus } =
        await fetcher.fetchHtml(subPageUrl);

      if (subStatus !== 200) {
        logger.warn(
          `state-plan: unexpected status ${subStatus} for sub-page ${subPageUrl}`,
        );
        continue;
      }

      const subDocs = parseSubPage(subHtml, subPageUrl);
      for (const doc of subDocs) {
        if (!seenUrls.has(doc.source_url)) {
          seenUrls.add(doc.source_url);
          allDocs.push(doc);
        }
      }
    }

    logger.info(`state-plan: total discovered ${allDocs.length} documents`);
    return allDocs;
  },
};
