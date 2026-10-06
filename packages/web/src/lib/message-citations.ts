// Owns citation plumbing: URL canonicalization, resolving inline markdown
// citations to Sources-panel footnote numbers, cited-vs-consulted splitting,
// and clipboard rendering of answers with numbered sources.

import type { UIMessage } from 'ai';
import { isTextPart } from './message-part-guards';
import type { MessageSource } from './message-sources';

/**
 * Canonicalize a citation URL so that "same document, different
 * surface-form" URLs collapse to one key. Used for both source
 * deduplication (via the key) and matching inline agent-emitted citation
 * links to their Sources-panel entry (footnote numbering).
 */
export function normalizeCitationUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    // DHHS policy PDFs sometimes carry `?attachment`; strip that flag so
    // links with and without it collapse together.
    let query = parsed.search;
    if (query === '?attachment' || query.toLowerCase() === '?format=pdf') query = '';
    return `${parsed.protocol}//${host}${path}${query}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export type CitationResolver = (
  label: string | null | undefined,
  href: string | null | undefined,
) => number | undefined;

/**
 * Section token of a citation label: the text after "§" up to the first
 * space, keeping directly attached parenthesised groups. "42 CFR § 441.302",
 * "SSA § 1915(c)" and "Policy 1F § 5.2.1" all parse; a spaced suffix such as
 * " (last revised 2024-05-10)" is dropped.
 */
function citedSectionNumber(label: string): string | null {
  const m = label.match(/§\s*([A-Za-z0-9][A-Za-z0-9.-]*(?:\([A-Za-z0-9]+\))*)/);
  return m ? m[1] : null;
}

/**
 * Split a section number on dots and parentheses: "441.301(c)(2)" becomes
 * [441, 301, c, 2]. A trailing "0" segment is dropped so a "5.0" row, which
 * carries the text of its "5.x" subsections, reads as their parent.
 */
function sectionSegments(sectionNumber: string): string[] {
  const segments = sectionNumber.toLowerCase().split(/[.()]+/).filter(Boolean);
  if (segments.length > 1 && segments[segments.length - 1] === '0') segments.pop();
  return segments;
}

/**
 * Match an inline markdown citation to its Sources-panel row.
 *
 * Every section of one document shares a single URL (all of Policy 1F's
 * sections point at `…/1f-chiropractic-services/download`, all of 42 CFR
 * part 441 at one eCFR page), so the URL alone cannot pick a row. We resolve
 * in three tiers:
 *   1. Exact label match: the source label ("Policy 1F § 5.6") is unique per
 *      row (disambiguateLabels guarantees it).
 *   2. Section match among the rows sharing the link's URL: the row whose
 *      section number equals the one cited after "§", else its deepest
 *      retrieved ancestor ("§ 5.2.1" on the "§ 5.2" row, "§ 5.6" on "§ 5.0").
 *      Scoping by URL instead of the label's wording covers federal labels
 *      ("42 CFR § 441.302" on the row "Policy 42-CFR-441 § 441.302") and
 *      spelling variants ("Policy 1-H" on "Policy 1H" rows).
 *   3. The document-level row for that URL, or its only row.
 * Anything else is unresolved and gets no footnote: pointing at a sibling
 * section's excerpt is worse than pointing at nothing.
 */
function findCitedSource(
  sources: MessageSource[],
  label: string | null | undefined,
  href: string | null | undefined,
): MessageSource | undefined {
  const trimmed = label?.trim();
  if (trimmed) {
    const exact = sources.find((source) => source.label === trimmed);
    if (exact) return exact;
  }
  const normalized = normalizeCitationUrl(href);
  if (!normalized) return undefined;
  const sameDocument = sources.filter((source) => normalizeCitationUrl(source.url) === normalized);

  const cited = trimmed ? citedSectionNumber(trimmed) : null;
  if (cited) {
    const citedSegments = sectionSegments(cited);
    let best: MessageSource | undefined;
    let bestDepth = 0;
    for (const source of sameDocument) {
      if (!source.sectionNumber) continue;
      if (source.sectionNumber === cited) return source;
      const segments = sectionSegments(source.sectionNumber);
      if (segments.length > citedSegments.length || segments.length <= bestDepth) continue;
      if (segments.every((segment, i) => segment === citedSegments[i])) {
        best = source;
        bestDepth = segments.length;
      }
    }
    if (best) return best;
  }

  const documentRows = sameDocument.filter((source) => source.sectionNumber === null);
  if (documentRows.length === 1) return documentRows[0];
  return sameDocument.length === 1 ? sameDocument[0] : undefined;
}

/** Resolve an inline markdown citation to its 1-based Sources-panel row. */
export function buildCitationResolver(sources: MessageSource[]): CitationResolver {
  return (label, href) => {
    const source = findCitedSource(sources, label, href);
    return source ? sources.indexOf(source) + 1 : undefined;
  };
}

// ─── Cited vs consulted ──────────────────────────────────────────────────────

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;

/**
 * Order sources cited-first (preserving natural section order within each
 * group) and number footnotes against that order. A row is cited only when
 * an inline link in the message resolves to it; everything else in the
 * Sources panel was merely consulted (mostly search hits), and presenting
 * "12 cited" when the answer cites three sections undermines verifiability.
 * The Sources panel renders group headers; footnote numbers stay continuous
 * across the boundary.
 */
export function resolveCitedSources(
  msg: UIMessage,
  sources: MessageSource[],
): { ordered: MessageSource[]; citedCount: number; resolveCitation: CitationResolver } {
  const citedSources = new Set<MessageSource>();
  for (const part of msg.parts ?? []) {
    if (!isTextPart(part)) continue;
    for (const [, label, url] of part.text.matchAll(MARKDOWN_LINK_RE)) {
      // Drop emphasis markers so the label matches what the rendered link
      // shows ("§ **5.6**" renders, and is footnoted, as "§ 5.6").
      const source = findCitedSource(sources, label.replace(/[*`]/g, ''), url);
      if (source) citedSources.add(source);
    }
  }
  const cited = sources.filter((source) => citedSources.has(source));
  const consulted = sources.filter((source) => !citedSources.has(source));
  const ordered = [...cited, ...consulted];
  return { ordered, citedCount: cited.length, resolveCitation: buildCitationResolver(ordered) };
}

// ─── Clipboard text ──────────────────────────────────────────────────────────

/**
 * Rewrite each inline markdown link of an answer. `render` gets the link's
 * footnote number in `orderedSources`, or undefined when it matches no row.
 */
export function mapCitationLinks(
  answerText: string,
  orderedSources: MessageSource[],
  render: (label: string, url: string, sourceNumber: number | undefined) => string,
): string {
  const resolve = buildCitationResolver(orderedSources);
  return answerText.replace(MARKDOWN_LINK_RE, (_match, label: string, url: string) =>
    // Emphasis markers are dropped for the lookup only, as on screen.
    render(label, url, resolve(label.replace(/[*`]/g, ''), url)));
}

/**
 * Render the answer for the clipboard: inline markdown citations become
 * "label [n]" footnote references and a numbered source list is appended.
 * Raw markdown link syntax pasted into an email reads as noise to the
 * case managers and attorneys this is built for. A link that matches no
 * source keeps its address, as "label (url)".
 */
export function buildAnswerClipboardText(answerText: string, orderedSources: MessageSource[]): string {
  if (!answerText.trim()) return answerText;

  const body = mapCitationLinks(answerText, orderedSources, (label, url, sourceNumber) =>
    sourceNumber !== undefined ? `${label} [${sourceNumber}]` : `${label} (${url})`);

  if (orderedSources.length === 0) return body;

  const sourceLines = orderedSources.map(
    (source, i) => `[${i + 1}] ${source.label} — ${source.url}`,
  );
  return `${body}\n\nSources:\n${sourceLines.join('\n')}`;
}
