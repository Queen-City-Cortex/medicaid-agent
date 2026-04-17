import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

const BASE_URL = 'https://medicaid.ncdhhs.gov';
const MAX_PAGES = 50;

/**
 * Parse a bulletin blog-listing page (e.g. /blog-category/bulletins?page=N).
 *
 * HTML structure (Drupal Views):
 *   .views-row
 *     h3 > a[href="/blog/YYYY/MM/DD/slug"]  ← post link
 *   ul.js-pager__items a[rel="next"]         ← next page
 */
export function parseBulletinListingPage(
  html: string,
  pageUrl: string,
): { postUrls: string[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);

  const postUrls: string[] = [];

  $('.views-row h3 a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    postUrls.push(url);
  });

  // Pagination: <a rel="next" href="...">
  const nextHref = $('a[rel="next"]').attr('href');
  let nextPageUrl: string | null = null;
  if (nextHref) {
    nextPageUrl = nextHref.startsWith('http')
      ? nextHref
      : `${BASE_URL}${nextHref}`;
  }

  logger.debug(
    `parseBulletinListingPage: ${postUrls.length} posts, next=${nextPageUrl ?? 'none'} (from ${pageUrl})`,
  );
  return { postUrls, nextPageUrl };
}

/**
 * Parse the Medicaid Bulletin Digests page.
 *
 * HTML structure (Bootstrap accordion tabs, one per year):
 *   button.accordion-button[data-bs-target="#Tab-YYYYMedicaidBulletinDigests-NNNN"]
 *   div#Tab-YYYYMedicaidBulletinDigests-NNNN
 *     a[href*="/download?attachment"]  ← month-year digest PDF
 *
 * We extract the year from the accordion id (Tab-YYYY...).
 * sinceYear is applied: accordions with year < sinceYear are skipped.
 */
export function parseDigestsPage(
  html: string,
  pageUrl: string,
  sinceYear: number,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];

  $('[id^="Tab-"]').each((_i, el) => {
    const id = $(el).attr('id') ?? '';
    const yearMatch = id.match(/Tab-(\d{4})/);
    if (!yearMatch) return;

    const year = parseInt(yearMatch[1], 10);
    if (year < sinceYear) return;

    $(el)
      .find('a[href*="/download?attachment"]')
      .each((_j, link) => {
        const href = $(link).attr('href');
        if (!href) return;

        const source_url = href.startsWith('http')
          ? href
          : `${BASE_URL}${href}`;

        const title = $(link).text().trim() || null;

        docs.push({
          source_url,
          discovered_from: pageUrl,
          source_type: 'bulletin',
          title: title ? `Bulletin Digest – ${title}` : null,
          policy_number: null,
          category: `${year} Medicaid Bulletin Digests`,
        });
      });
  });

  logger.debug(`parseDigestsPage: found ${docs.length} digest documents`);
  return docs;
}

/**
 * Parse an individual bulletin blog post page.
 *
 * PDF attachments appear as anchor tags with /download?attachment in the href.
 * The post title is in <h1> and the publication date lives in a <time> element.
 *
 * HTML-only posts (no /download links) are skipped — caller should log them.
 */
export function parseBulletinPostPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];

  // Extract post title
  const title = $('h1').first().text().trim() || null;

  $('a[href*="/download?attachment"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const source_url = href.startsWith('http')
      ? href
      : `${BASE_URL}${href}`;

    const linkText = $(el).text().trim();

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'bulletin',
      title: linkText || title,
      policy_number: null,
      category: null,
    });
  });

  return docs;
}

/**
 * Extract the year from a bulletin blog post URL.
 * URL pattern: /blog/YYYY/MM/DD/slug
 * Returns null if not parseable.
 */
function yearFromBlogUrl(url: string): number | null {
  const m = url.match(/\/blog\/(\d{4})\//);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Main discovery function for bulletin source.
 *
 * 1. Fetches the digests page and extracts all digest PDFs.
 * 2. Paginates through the blog listing (/blog-category/bulletins),
 *    follows each post page to find PDF attachments.
 * 3. Stops paginating when every post on a page is older than sinceYear,
 *    or after MAX_PAGES pages.
 *
 * HTML-only posts (no PDF attachment) are logged at debug level and skipped.
 */
export const bulletinsSource = {
  async discover(
    fetcher: Fetcher,
    sinceYear: number,
  ): Promise<DiscoveredDocument[]> {
    const allDocs: DiscoveredDocument[] = [];

    // ── Step 1: Digests ────────────────────────────────────────────────────
    const digestsUrl = config.sources.bulletin.digestsUrl;
    logger.info(`bulletins: fetching digests page ${digestsUrl}`);
    const { body: digestsHtml, statusCode: digestsStatus } =
      await fetcher.fetchHtml(digestsUrl);
    if (digestsStatus !== 200) {
      logger.warn(
        `bulletins: unexpected status ${digestsStatus} for digests page`,
      );
    } else {
      const digestDocs = parseDigestsPage(digestsHtml, digestsUrl, sinceYear);
      logger.info(`bulletins: discovered ${digestDocs.length} digest documents`);
      allDocs.push(...digestDocs);
    }

    // ── Step 2: Blog listing pagination ───────────────────────────────────
    const blogListingUrl = config.sources.bulletin.blogListingUrl;
    let currentUrl: string | null = blogListingUrl;
    let pageCount = 0;

    while (currentUrl !== null && pageCount < MAX_PAGES) {
      pageCount++;
      logger.info(`bulletins: fetching blog listing page ${pageCount} — ${currentUrl}`);

      const { body: listHtml, statusCode: listStatus } =
        await fetcher.fetchHtml(currentUrl);

      if (listStatus !== 200) {
        logger.warn(
          `bulletins: unexpected status ${listStatus} for listing page ${currentUrl}`,
        );
        break;
      }

      const { postUrls, nextPageUrl } = parseBulletinListingPage(
        listHtml,
        currentUrl,
      );

      if (postUrls.length === 0) {
        logger.debug(`bulletins: empty page at ${currentUrl}, stopping`);
        break;
      }

      // Check if all posts on this page are older than sinceYear cutoff
      const allOld = postUrls.every((url) => {
        const year = yearFromBlogUrl(url);
        return year !== null && year < sinceYear;
      });
      if (allOld) {
        logger.info(
          `bulletins: all posts on page ${pageCount} are before ${sinceYear}, stopping`,
        );
        break;
      }

      // ── Step 3: Fetch each post page for PDFs ─────────────────────────
      for (const postUrl of postUrls) {
        const postYear = yearFromBlogUrl(postUrl);
        if (postYear !== null && postYear < sinceYear) {
          logger.debug(`bulletins: skipping old post ${postUrl} (year ${postYear})`);
          continue;
        }

        logger.debug(`bulletins: fetching post page ${postUrl}`);
        const { body: postHtml, statusCode: postStatus } =
          await fetcher.fetchHtml(postUrl);

        if (postStatus !== 200) {
          logger.warn(
            `bulletins: unexpected status ${postStatus} for post ${postUrl}`,
          );
          continue;
        }

        const postDocs = parseBulletinPostPage(postHtml, postUrl);
        if (postDocs.length === 0) {
          logger.debug(`bulletins: no PDF attachments in post ${postUrl} (HTML-only)`);
        } else {
          logger.debug(
            `bulletins: found ${postDocs.length} PDF(s) in post ${postUrl}`,
          );
          allDocs.push(...postDocs);
        }
      }

      currentUrl = nextPageUrl;
    }

    if (pageCount >= MAX_PAGES) {
      logger.warn(`bulletins: hit page cap of ${MAX_PAGES}, stopping`);
    }

    logger.info(`bulletins: total discovered ${allDocs.length} documents`);
    return allDocs;
  },
};
