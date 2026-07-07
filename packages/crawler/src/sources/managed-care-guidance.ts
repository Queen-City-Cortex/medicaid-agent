import { config } from '../config.js';
import { pageCrawlSource } from './crawl-helpers.js';
import {
  collectDrupalDocumentLinks,
  collectInternalPageLinks,
} from './medicaid-page-documents.js';
import type { DiscoveredDocument } from './types.js';

const SUBPAGE_PREFIXES = [
  '/providers/provider-playbook-medicaid-managed-care',
  '/providers/provider-playbook-nc-medicaid-managed-care',
];

export function parseManagedCareGuidancePage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  return collectDrupalDocumentLinks(
    html,
    pageUrl,
    'managed_care_guidance',
    'Managed Care Guidance',
  );
}

export function extractManagedCareGuidanceSubpageUrls(
  html: string,
  pageUrl: string,
): string[] {
  return collectInternalPageLinks(html, pageUrl, SUBPAGE_PREFIXES);
}

// sinceYear ignored: managed-care guidance pages expose only the current set.
export const managedCareGuidanceSource = pageCrawlSource({
  logPrefix: 'managed-care-guidance',
  startUrls: () => config.sources.managed_care_guidance.landingPages,
  parsePage: parseManagedCareGuidancePage,
  extractSubpageUrls: extractManagedCareGuidanceSubpageUrls,
});
