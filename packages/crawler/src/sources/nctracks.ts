import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { singleIndexSource } from './crawl-helpers.js';
import type { DiscoveredDocument } from './types.js';

const BASE_URL = 'https://www.nctracks.nc.gov';

/**
 * Parse the NCTracks Provider Policies, Manuals, Guidelines and Forms page.
 *
 * Page structure (Magnolia/JCR-based CMS):
 *   <div class="links">
 *     <h2>Section Name</h2>
 *     <ul>
 *       <li class="download">
 *         <a href="/content/dam/jcr:UUID/Filename.pdf">Title <em>(TYPE, SIZE)</em></a>
 *       </li>
 *       <li class="external">
 *         <a href="https://...">External link title</a>
 *       </li>
 *     </ul>
 *   </div>
 *
 * Only `class="download"` list items are collected; external links are skipped.
 * The <em> suffix containing "(TYPE, SIZE)" is stripped from the title.
 */
export function parseNcTracksPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  // Iterate over each section block
  $('div.links').each((_i, section) => {
    // The h2 immediately inside the div.links is the section/category heading
    const category = $(section).find('h2').first().text().trim() || null;

    // Only download-class list items contain actual document links
    $(section).find('li.download').each((_j, li) => {
      const anchor = $(li).find('a').first();
      const href = anchor.attr('href');
      if (!href) return;

      // Build absolute URL — all download hrefs are relative paths on nctracks.nc.gov
      const source_url = href.startsWith('http')
        ? href
        : `${BASE_URL}${href}`;

      // Skip non-document links (shouldn't happen for class="download" but be safe)
      if (!source_url.includes('/content/dam/')) return;
      if (seenUrls.has(source_url)) return;
      seenUrls.add(source_url);

      // Full link text includes a trailing <em>(TYPE, SIZE KB)</em>
      // Clone and remove the em before reading text to get a clean title
      const clonedAnchor = anchor.clone();
      clonedAnchor.find('em').remove();
      const title = clonedAnchor.text().trim() || null;

      docs.push({
        source_url,
        discovered_from: pageUrl,
        source_type: 'provider_manual',
        title,
        policy_number: null,
        category,
      });
    });
  });

  logger.debug(`parseNcTracksPage: found ${docs.length} documents`);
  return docs;
}

// sinceYear ignored: NCTracks surfaces only the current provider manuals.
export const ncTracksSource = singleIndexSource({
  logPrefix: 'nctracks',
  indexUrl: () => config.sources.provider_manual.indexUrl,
  parse: parseNcTracksPage,
});
