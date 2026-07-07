import { config } from '../config.js';
import { pageCrawlSource } from './crawl-helpers.js';
import { collectDrupalDocumentLinks } from './medicaid-page-documents.js';
import type { DiscoveredDocument } from './types.js';

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

// sinceYear ignored: billing guidance pages list only the current documents.
export const billingGuidanceSource = pageCrawlSource({
  logPrefix: 'billing-guidance',
  startUrls: () => config.sources.billing_guidance.landingPages,
  parsePage: parseBillingGuidancePage,
});
