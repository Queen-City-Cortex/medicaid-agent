import { logger } from '../utils/logger.js';
import type { DiscoveredDocument, SourceModule } from './types.js';

type ParsePage = (html: string, pageUrl: string) => DiscoveredDocument[];

/**
 * Append `incoming` documents to `target`, skipping any whose `source_url`
 * has already been seen. Mutates `seenUrls` and `target`.
 */
export function pushNewDocuments(
  seenUrls: Set<string>,
  target: DiscoveredDocument[],
  incoming: DiscoveredDocument[],
): void {
  for (const doc of incoming) {
    if (seenUrls.has(doc.source_url)) continue;
    seenUrls.add(doc.source_url);
    target.push(doc);
  }
}

/**
 * Throw unless a configured entry page (index, seed, landing or start URL)
 * answered 200. A blocked or missing entry page means the family's listing is
 * unknown, so its discovery must fail rather than report an empty result.
 */
export function requireEntryPage(
  logPrefix: string,
  pageUrl: string,
  statusCode: number,
): void {
  if (statusCode !== 200) {
    throw new Error(`${logPrefix}: status ${statusCode} for configured page ${pageUrl}`);
  }
}

/**
 * Build a SourceModule that discovers documents from a single index page:
 * fetch the index URL, throw on a non-200 response or an index that parses to
 * no documents, and otherwise return what the supplied parser finds.
 *
 * Sources built this way ignore `sinceYear` — they enumerate whatever the
 * index currently lists and have no year metadata to filter on.
 */
export function singleIndexSource(options: {
  logPrefix: string;
  indexUrl: () => string;
  parse: ParsePage;
}): SourceModule {
  const { logPrefix, indexUrl: getIndexUrl, parse } = options;

  return {
    async discover(fetcher, _sinceYear): Promise<DiscoveredDocument[]> {
      const indexUrl = getIndexUrl();
      logger.info(`${logPrefix}: fetching index ${indexUrl}`);

      const { body, statusCode } = await fetcher.fetchHtml(indexUrl);
      requireEntryPage(logPrefix, indexUrl, statusCode);

      const docs = parse(body, indexUrl);
      if (docs.length === 0) {
        throw new Error(`${logPrefix}: no documents parsed from ${indexUrl}`);
      }
      logger.info(`${logPrefix}: discovered ${docs.length} documents`);
      return docs;
    },
  };
}

/**
 * Build a SourceModule that crawls a set of landing pages (breadth-first),
 * collecting documents from each page via `parsePage` and deduplicating them
 * by `source_url`.
 *
 * - `extractSubpageUrls` (optional) enqueues additional pages found on each
 *   fetched page; without it the crawl is a flat pass over `startUrls`.
 * - `derivePageFromDocument` (optional) enqueues an extra page derived from
 *   each newly discovered document URL (e.g. a document's detail/wrapper page).
 *
 * A non-200 start URL throws; non-200 sub-pages and detail pages are logged
 * and skipped. Each page is visited at most once.
 * Sources built this way ignore `sinceYear` — they surface only the current
 * document set.
 */
export function pageCrawlSource(options: {
  logPrefix: string;
  startUrls: () => readonly string[];
  parsePage: ParsePage;
  extractSubpageUrls?: (html: string, pageUrl: string) => string[];
  derivePageFromDocument?: (documentUrl: string) => string | null;
}): SourceModule {
  const { logPrefix, startUrls, parsePage, extractSubpageUrls, derivePageFromDocument } = options;

  return {
    async discover(fetcher, _sinceYear): Promise<DiscoveredDocument[]> {
      const docs: DiscoveredDocument[] = [];
      const seenDocs = new Set<string>();
      const visitedPages = new Set<string>();
      const queuedPages = new Set<string>();
      const queue: string[] = [];

      const enqueue = (pageUrl: string): void => {
        if (visitedPages.has(pageUrl) || queuedPages.has(pageUrl)) return;
        queuedPages.add(pageUrl);
        queue.push(pageUrl);
      };

      const entryPages = new Set(startUrls());
      for (const pageUrl of entryPages) {
        enqueue(pageUrl);
      }

      while (queue.length > 0) {
        const pageUrl = queue.shift();
        if (!pageUrl || visitedPages.has(pageUrl)) continue;
        visitedPages.add(pageUrl);

        logger.info(`${logPrefix}: fetching ${pageUrl}`);
        const { body, statusCode } = await fetcher.fetchHtml(pageUrl);
        if (entryPages.has(pageUrl)) {
          requireEntryPage(logPrefix, pageUrl, statusCode);
        } else if (statusCode !== 200) {
          logger.warn(`${logPrefix}: unexpected status ${statusCode} for ${pageUrl}`);
          continue;
        }

        for (const doc of parsePage(body, pageUrl)) {
          if (seenDocs.has(doc.source_url)) continue;
          seenDocs.add(doc.source_url);
          docs.push(doc);

          const detailPageUrl = derivePageFromDocument?.(doc.source_url);
          if (detailPageUrl) {
            enqueue(detailPageUrl);
          }
        }

        for (const subpageUrl of extractSubpageUrls?.(body, pageUrl) ?? []) {
          enqueue(subpageUrl);
        }
      }

      logger.info(`${logPrefix}: discovered ${docs.length} documents`);
      return docs;
    },
  };
}
