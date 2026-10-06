import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { singleIndexSource } from './crawl-helpers.js';
import type { DiscoveredDocument } from './types.js';

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
 *   - The sub-category comes from the first `<span data-slug>` in the
 *     categories column (`data-column="doc_categories"`) that is NOT the
 *     top-level "health-benefits-nc-medicaid" slug.
 *   - Tags are a separate column (`data-column="doc_tags"`): the document
 *     kind (manual, administrative-letter, form, ...) and the agency's own
 *     "archived" mark on superseded documents. They are returned as slugs in
 *     `doc_tags` and never read as a category.
 *   - Every row on this page belongs to the health-benefits-nc-medicaid section;
 *     no additional sub-page fetching is required.
 */
const TOP_LEVEL_SLUG = 'health-benefits-nc-medicaid';

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
    // First sub-category in the categories column; the top-level section
    // every row belongs to is not one.
    const category =
      $(row)
        .find('a[data-column="doc_categories"] span[data-slug]')
        .filter((_j, span) => $(span).attr('data-slug') !== TOP_LEVEL_SLUG)
        .first()
        .text()
        .trim() || null;

    // ── Tags ─────────────────────────────────────────────────────────────────
    const doc_tags = $(row)
      .find('a[data-column="doc_tags"] span[data-slug]')
      .map((_j, span) => $(span).attr('data-slug') ?? '')
      .get()
      .filter(Boolean);

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: 'dhhs_policy',
      title,
      policy_number: null,
      category,
      doc_tags,
    });
  });

  logger.debug(`parseDhhsPoliciesPage: found ${docs.length} documents`);
  return docs;
}

// sinceYear ignored: the DHHS policies landing page enumerates the current
// MA-series policies; discovery has no year metadata to filter on.
export const dhhsPoliciesSource = singleIndexSource({
  logPrefix: 'dhhs-policies',
  indexUrl: () => config.sources.dhhs_policy.indexUrl,
  parse: parseDhhsPoliciesPage,
});
