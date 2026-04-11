import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  absoluteMedicaidUrl,
  collectDrupalDocumentLinks,
  collectInternalPageLinks,
  MEDICAID_BASE_URL,
} from './medicaid-page-documents.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

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

export const managedCareContractsSource = {
  async discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
    const docs: DiscoveredDocument[] = [];
    const seenDocs = new Set<string>();
    const visitedPages = new Set<string>();
    const queuedPages = new Set<string>();
    const queue = [...config.sources.managed_care_contract.landingPages];

    for (const pageUrl of queue) {
      queuedPages.add(pageUrl);
    }

    while (queue.length > 0) {
      const pageUrl = queue.shift();
      if (!pageUrl || visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);

      logger.info(`managed-care-contracts: fetching ${pageUrl}`);
      const { body, statusCode } = await fetcher.fetchHtml(pageUrl);
      if (statusCode !== 200) {
        logger.warn(`managed-care-contracts: unexpected status ${statusCode} for ${pageUrl}`);
        continue;
      }

      for (const doc of parseManagedCareContractsPage(body, pageUrl)) {
        if (seenDocs.has(doc.source_url)) continue;
        seenDocs.add(doc.source_url);
        docs.push(doc);

        const detailPageUrl = deriveManagedCareContractDetailPageUrl(doc.source_url);
        if (detailPageUrl && !visitedPages.has(detailPageUrl) && !queuedPages.has(detailPageUrl)) {
          queuedPages.add(detailPageUrl);
          queue.push(detailPageUrl);
        }
      }

      for (const subpageUrl of extractManagedCareContractSubpageUrls(body, pageUrl)) {
        if (!visitedPages.has(subpageUrl) && !queuedPages.has(subpageUrl)) {
          queuedPages.add(subpageUrl);
          queue.push(subpageUrl);
        }
      }
    }

    logger.info(`managed-care-contracts: discovered ${docs.length} documents`);
    return docs;
  },
};
