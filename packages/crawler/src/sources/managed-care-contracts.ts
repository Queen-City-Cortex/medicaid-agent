import { config } from '../config.js';
import { pageCrawlSource } from './crawl-helpers.js';
import {
  absoluteMedicaidUrl,
  collectDrupalDocumentLinks,
  collectInternalPageLinks,
  MEDICAID_BASE_URL,
} from './medicaid-page-documents.js';
import type { DiscoveredDocument } from './types.js';

const SUBPAGE_PREFIXES = [
  '/providers/provider-contracting-health-plans',
  '/health-plan-contact-information',
  '/about-nc-medicaid/health-plans',
  '/provider-contract-templates-tailored-plans',
  '/provider-network-and-contracting-guidance-health-plans-subcontractors-and-providers',
  '/contracting-tailored-plans',
  '/tailored-plan-provider-contracting-deadlines-questions-and-answers',
  '/blog/',
];

export function parseManagedCareContractsPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  return collectDrupalDocumentLinks(
    html,
    pageUrl,
    'managed_care_contract',
    'Managed Care Contracts',
  );
}

export function extractManagedCareContractSubpageUrls(
  html: string,
  pageUrl: string,
): string[] {
  return collectInternalPageLinks(html, pageUrl, SUBPAGE_PREFIXES).filter((url) => {
    const normalized = url.toLowerCase();
    return (
      normalized.includes('contract') ||
      normalized.includes('health-plan') ||
      normalized.includes('tailored-plan') ||
      normalized.includes('provider-network')
    );
  });
}

export function deriveManagedCareContractDetailPageUrl(documentUrl: string): string | null {
  const absoluteUrl = absoluteMedicaidUrl(documentUrl, MEDICAID_BASE_URL);
  if (!absoluteUrl) return null;

  const parsed = new URL(absoluteUrl);
  parsed.hash = '';

  if (
    parsed.pathname.startsWith('/media/') ||
    /^\/(?:contract-\d|30-\d|php-amendment|tp-amendment)/i.test(parsed.pathname)
  ) {
    return null;
  }

  const pathname = parsed.pathname.replace(/\/(download|open)\/?$/i, '');
  if (pathname === parsed.pathname) {
    return null;
  }

  const slug = pathname.split('/').filter(Boolean).pop()?.toLowerCase() ?? '';
  if (
    !(
      slug.includes('provider-contract') ||
      slug.includes('contracting-tailored') ||
      slug.includes('questions-and-answers') ||
      slug.includes('approved-php-provider-contracts') ||
      slug.includes('networkandprovcontractingguidance') ||
      slug.includes('providercontractingguidanceqa')
    )
  ) {
    return null;
  }

  parsed.pathname = pathname;
  parsed.search = '';
  return parsed.toString();
}

// sinceYear ignored: managed-care contract discovery traverses current contract
// pages; amendment chains live inside the downloaded PDFs, not the index.
export const managedCareContractsSource = pageCrawlSource({
  logPrefix: 'managed-care-contracts',
  startUrls: () => config.sources.managed_care_contract.landingPages,
  parsePage: parseManagedCareContractsPage,
  extractSubpageUrls: extractManagedCareContractSubpageUrls,
  derivePageFromDocument: deriveManagedCareContractDetailPageUrl,
});
