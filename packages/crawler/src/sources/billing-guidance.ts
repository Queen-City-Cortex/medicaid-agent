import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { collectDrupalDocumentLinks } from './medicaid-page-documents.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

export function parseBillingGuidancePage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  return collectDrupalDocumentLinks(
    html,
    pageUrl,
    'billing_guidance',
    'Billing Guidance',
  );
}

export const billingGuidanceSource = {
  async discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
    const docs: DiscoveredDocument[] = [];
    const seenUrls = new Set<string>();

    for (const pageUrl of config.sources.billing_guidance.landingPages) {
      logger.info(`billing-guidance: fetching ${pageUrl}`);
      const { body, statusCode } = await fetcher.fetchHtml(pageUrl);
      if (statusCode !== 200) {
        logger.warn(`billing-guidance: unexpected status ${statusCode} for ${pageUrl}`);
        continue;
      }

      for (const doc of parseBillingGuidancePage(body, pageUrl)) {
        if (seenUrls.has(doc.source_url)) continue;
        seenUrls.add(doc.source_url);
        docs.push(doc);
      }
    }

    logger.info(`billing-guidance: discovered ${docs.length} documents`);
    return docs;
  },
};
