import * as cheerio from 'cheerio';
import type { DiscoveredDocument, SourceType } from './types.js';

export const MEDICAID_BASE_URL = 'https://medicaid.ncdhhs.gov';

export function normalizeWhitespace(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function absoluteMedicaidUrl(
  href: string,
  baseUrl: string = MEDICAID_BASE_URL,
): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) {
      return null;
    }
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

export function looksLikeDocumentUrl(url: string): boolean {
  return (
    /\/download(?:\?attachment)?(?:$|[?#])/i.test(url) ||
    /\/open(?:$|[?#])/i.test(url) ||
    /\.(pdf|docx?|xlsx?)(?:$|[?#])/i.test(url)
  );
}

function pageTitle($: cheerio.CheerioAPI): string | null {
  const h1 = normalizeWhitespace($('h1').first().text());
  if (h1) return h1;
  const title = normalizeWhitespace($('title').first().text());
  return title || null;
}

export function findNearestHeading(
  $: cheerio.CheerioAPI,
  element: unknown,
): string | null {
  let current = $(element as any);
  while (current.length > 0) {
    const heading = current
      .prevAll('h1,h2,h3,h4,h5,h6,summary,button,dt,.accordion-button')
      .first();
    const text = normalizeWhitespace(heading.text());
    if (text) return text;
    current = current.parent();
  }
  return pageTitle($);
}

export function collectDrupalDocumentLinks(
  html: string,
  pageUrl: string,
  sourceType: SourceType,
  fallbackCategory: string | null,
): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const docs: DiscoveredDocument[] = [];
  const seenUrls = new Set<string>();
  const pageHeading = pageTitle($);

  $('a[href]').each((_i, anchor) => {
    const href = $(anchor).attr('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    const source_url = absoluteMedicaidUrl(href, pageUrl);
    if (!source_url) return;
    if (!looksLikeDocumentUrl(source_url)) return;
    if (seenUrls.has(source_url)) return;
    seenUrls.add(source_url);

    const title =
      normalizeWhitespace($(anchor).attr('title')) ||
      normalizeWhitespace($(anchor).text()) ||
      pageHeading ||
      null;

    docs.push({
      source_url,
      discovered_from: pageUrl,
      source_type: sourceType,
      title,
      policy_number: null,
      category: findNearestHeading($, anchor) || fallbackCategory,
    });
  });

  return docs;
}

export function collectInternalPageLinks(
  html: string,
  pageUrl: string,
  pathPrefixes: string[],
): string[] {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const urls = new Set<string>();

  $('a[href]').each((_i, anchor) => {
    const href = $(anchor).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    const url = absoluteMedicaidUrl(href, pageUrl);
    if (!url) return;
    if (looksLikeDocumentUrl(url)) return;

    const parsed = new URL(url);
    if (parsed.hostname !== page.hostname) return;
    if (!pathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))) return;

    parsed.hash = '';
    urls.add(parsed.toString());
  });

  return [...urls];
}
