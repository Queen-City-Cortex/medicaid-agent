import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { DiscoveredDocument, Fetcher } from './types.js';

/**
 * Parse the DHHS Policies Repository page for Health Benefits / NC Medicaid documents.
 *
 * The page is rendered by the WordPress "Document Library Pro" plugin and contains
 * a DataTables-powered table where every document is a `<tr id="post-row-N">` row.
 *
 * Relevant row structure:
 *   <tr id="post-row-6636" class="post-row ...">
 *     <td>
 *       <a href="https://policies.ncdhhs.gov/document/…/">Title text</a>
 *     </td>
 *     <td>
 *       <a … data-column="doc_categories">
 *         <span data-slug="sub-category">Sub-category Name</span>
 *       </a>
 *       , …
 *     </td>
 *     <td>…type…</td>
 *     <td>…format…</td>
 *     <td>…size…</td>
 *     <td>
 *       <div class="dlp-table-document-link-wrap">
 *         <a href="https://policies.ncdhhs.gov/wp-content/uploads/filename.pdf"
 *            class="dlp-download-link …">Open</a>
 *         …
 *       </div>
 *     </td>
 *     …
 *   </tr>
 *
 * Key observations:
 *   - The download URL is the `href` of `a.dlp-download-link`.
 *   - The document title is the text of the first `<a>` in the first `<td>`.
 *   - The sub-category comes from the first `<span data-slug>` that is NOT the
 *     top-level "health-benefits-nc-medicaid" slug.
 *   - Every row on this page belongs to the health-benefits-nc-medicaid section;
 *     no additional sub-page fetching is required.
 */
export function parseDhhsPoliciesPage(
  html: string,
  pageUrl: string,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();

  // Every document row carries the id prefix "post-row-"
  $('tr[id^="post-row-"]').each((_i, row) => {
    // ── Download URL ────────────────────────────────────────────────────────
    const downloadAnchor = $(row).find('a.dlp-download-link').first();
    const href = downloadAnchor.attr('href');
    if (!href || href === 'javascript:void(0)') return;

    const source_url = href.startsWith('http')
      ? href
      : `https://policies.ncdhhs.gov${href}`;

    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    // ── Title ────────────────────────────────────────────────────────────────
    // The title link is the first anchor in the first <td>
    const titleAnchor = $(row).find('td').first().find('a').first();
    const rawTitle = titleAnchor.text().trim();
    const title = rawTitle || null;

    // ── Category ─────────────────────────────────────────────────────────────
    // Pick the first span[data-slug] whose slug is not the top-level section
    const TOP_LEVEL_SLUGS = new Set([
      'health-benefits-nc-medicaid',
      // type tags that appear in the categories column
      'administrative-letter',
      'change-notice',
      'manual',
      'policy',
      'form',
      'forms',
    ]);

    let category: string | null = null;
    $(row)
      .find('span[data-slug]')
      .each((_j, span) => {
        if (category) return; // already found one
        const slug = $(span).attr('data-slug') ?? '';
        if (!TOP_LEVEL_SLUGS.has(slug)) {
          category = $(span).text().trim() || null;
        }
      });

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'dhhs_policy',
      title,
      policy_number: null,
      category,
    });
  });

  logger.debug(`parseDhhsPoliciesPage: found ${docs.length} documents`);
  return docs;
}

export const dhhsPoliciesSource = {
  async discover(fetcher: Fetcher): Promise<DiscoveredDocument[]> {
    const indexUrl = config.sources.dhhs_policy.indexUrl;
    logger.info(`dhhs-policies: fetching index ${indexUrl}`);

    const { body, statusCode } = await fetcher.fetchHtml(indexUrl);
    if (statusCode !== 200) {
      logger.warn(
        `dhhs-policies: unexpected status ${statusCode} for ${indexUrl}`,
      );
      return [];
    }

    const docs = parseDhhsPoliciesPage(body, indexUrl);
    logger.info(`dhhs-policies: discovered ${docs.length} documents`);
    return docs;
  },
};
