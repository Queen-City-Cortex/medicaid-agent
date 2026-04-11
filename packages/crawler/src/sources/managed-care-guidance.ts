import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  collectDrupalDocumentLinks,
  collectInternalPageLinks,
} from './medicaid-page-documents.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

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

export const managedCareGuidanceSource = {
  async discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
    const docs: DiscoveredDocument[] = [];
    const seenDocs = new Set<string>();
    const visitedPages = new Set<string>();
    const queue = [...config.sources.managed_care_guidance.landingPages];

    while (queue.length > 0) {
      const pageUrl = queue.shift();
      if (!pageUrl || visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);

      logger.info(`managed-care-guidance: fetching ${pageUrl}`);
      const { body, statusCode } = await fetcher.fetchHtml(pageUrl);
      if (statusCode !== 200) {
        logger.warn(`managed-care-guidance: unexpected status ${statusCode} for ${pageUrl}`);
        continue;
      }

      for (const doc of parseManagedCareGuidancePage(body, pageUrl)) {
        if (seenDocs.has(doc.source_url)) continue;
        seenDocs.add(doc.source_url);
        docs.push(doc);
      }

      for (const subpageUrl of extractManagedCareGuidanceSubpageUrls(body, pageUrl)) {
        if (!visitedPages.has(subpageUrl)) {
          queue.push(subpageUrl);
        }
      }
    }

    logger.info(`managed-care-guidance: discovered ${docs.length} documents`);
    return docs;
  },
};
