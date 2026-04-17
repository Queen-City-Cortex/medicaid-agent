import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { MEDICAID_BASE_URL, absoluteMedicaidUrl, collectDrupalDocumentLinks } from './medicaid-page-documents.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

const MAX_LISTING_PAGES = 20;

export function parseFeeScheduleListingPage(
  html: string,
  pageUrl: string,
): { detailUrls: string[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const detailUrls = new Set<string>();

  $('table a[href], .views-row a[href], .view-content a[href]').each((_i, anchor) => {
    const href = $(anchor).attr('href');
    if (!href) return;
    const url = absoluteMedicaidUrl(href, pageUrl);
    if (!url) return;
    if (url.includes('/open') || url.includes('/download')) return;
    if (!url.startsWith(MEDICAID_BASE_URL)) return;
    if (!/fee-schedule|fee-schedules/i.test(url)) return;
    detailUrls.add(url);
  });

  const nextHref =
    $('a[rel="next"]').attr('href') ||
    $('li.pager__item--next a').attr('href') ||
    $('a[title="Go to next page"]').attr('href') ||
    null;

  return {
    detailUrls: [...detailUrls],
    nextPageUrl: nextHref ? absoluteMedicaidUrl(nextHref, pageUrl) : null,
  };
}

export function parseFeeScheduleDetailPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  return collectDrupalDocumentLinks(html, pageUrl, 'fee_schedule', 'Fee Schedules');
}

export const feeSchedulesSource = {
  // sinceYear ignored: the fee schedule index lists the full history; dated pruning
  // is handled at the variant-selection stage, not at discovery.
  async discover(fetcher: Fetcher, _sinceYear: number): Promise<DiscoveredDocument[]> {
    const docs: DiscoveredDocument[] = [];
    const visitedListingUrls = new Set<string>();
    const visitedDetailUrls = new Set<string>();
    const seenDocumentUrls = new Set<string>();

    for (const listingUrl of config.sources.fee_schedule.landingPages) {
      let currentUrl: string | null = listingUrl;
      let pageCount = 0;

      while (currentUrl && pageCount < MAX_LISTING_PAGES && !visitedListingUrls.has(currentUrl)) {
        visitedListingUrls.add(currentUrl);
        pageCount += 1;
        logger.info(`fee-schedules: fetching listing ${currentUrl}`);
        const { body, statusCode } = await fetcher.fetchHtml(currentUrl);
        if (statusCode !== 200) {
          logger.warn(`fee-schedules: unexpected status ${statusCode} for ${currentUrl}`);
          break;
        }

        for (const doc of collectDrupalDocumentLinks(body, currentUrl, 'fee_schedule', 'Fee Schedules')) {
          if (seenDocumentUrls.has(doc.source_url)) continue;
          seenDocumentUrls.add(doc.source_url);
          docs.push(doc);
        }

        const { detailUrls, nextPageUrl } = parseFeeScheduleListingPage(body, currentUrl);
        for (const detailUrl of detailUrls) {
          if (visitedDetailUrls.has(detailUrl)) continue;
          visitedDetailUrls.add(detailUrl);
          const detailResponse = await fetcher.fetchHtml(detailUrl);
          if (detailResponse.statusCode !== 200) continue;
          for (const doc of parseFeeScheduleDetailPage(detailResponse.body, detailUrl)) {
            if (seenDocumentUrls.has(doc.source_url)) continue;
            seenDocumentUrls.add(doc.source_url);
            docs.push(doc);
          }
        }

        currentUrl = nextPageUrl;
      }
    }

    logger.info(`fee-schedules: discovered ${docs.length} documents`);
    return docs;
  },
};
