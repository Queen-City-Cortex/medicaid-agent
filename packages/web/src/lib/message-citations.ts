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

/** Parse a source/citation label like "Policy 3G-1 § 5.2.1" into its parts. */
function parsePolicySection(label: string): { policy: string; section: string } | null {
  const m = label.match(/^Policy\s+(\S+)\s*§\s*([\d.]+)/i);
  if (!m) return null;
  return { policy: m[1], section: m[2].replace(/\.+$/, '') };
}

/** True when `prefix` is a strict dotted-segment ancestor of `full` (5.2 ⊏ 5.2.1). */
function isDottedAncestor(prefix: string, full: string): boolean {
  const p = prefix.split('.');
  const f = full.split('.');
  if (p.length >= f.length) return false;
  return p.every((seg, i) => seg === f[i]);
}

/**
 * Resolve an inline markdown citation to its 1-based Sources-panel row.
 *
 * Every section of one policy PDF shares a single download URL (e.g. all of
 * Policy 1F's sections point at `…/1f-chiropractic-services/download`), so a
 * URL-only lookup collapses "§ 3.2.1", "§ 5.6", etc. onto whichever row landed
 * first — the footnote then misroutes the reader to the wrong section. We
 * resolve in three tiers:
 *   1. Exact label match — the source LABEL ("Policy 1F § 5.6") is unique per
 *      row (disambiguateLabels guarantees it) and the agent emits exactly that
 *      label as the link text.
 *   2. Deepest same-policy ancestor — the agent often cites a finer subsection
 *      ("§ 5.2.1") than the row it actually retrieved ("§ 5.2"); point at that
 *      ancestor row rather than the unrelated first row of the PDF.
 *   3. URL fallback — for doc-level links or prose phrases whose text isn't a
 *      section label.
 */
export function buildCitationResolver(sources: MessageSource[]): CitationResolver {
  const byLabel = new Map<string, number>();
  const byUrl = new Map<string, number>();
  const sectionRows: Array<{ policy: string; section: string; index: number }> = [];
  sources.forEach((source, i) => {
    const n = i + 1;
    if (!byLabel.has(source.label)) byLabel.set(source.label, n);
    const normalized = normalizeCitationUrl(source.url);
    if (normalized && !byUrl.has(normalized)) byUrl.set(normalized, n);
    const ps = parsePolicySection(source.label);
    if (ps) sectionRows.push({ ...ps, index: n });
  });
  return (label, href) => {
    const trimmed = label?.trim();
    if (trimmed) {
      const byExact = byLabel.get(trimmed);
      if (byExact !== undefined) return byExact;
      const cite = parsePolicySection(trimmed);
      if (cite) {
        let best: number | undefined;
        let bestDepth = -1;
        for (const row of sectionRows) {
          if (row.policy !== cite.policy) continue;
          if (isDottedAncestor(row.section, cite.section)) {
            const depth = row.section.split('.').length;
            if (depth > bestDepth) {
              bestDepth = depth;
              best = row.index;
            }
          }
        }
        if (best !== undefined) return best;
      }
    }
    const normalized = normalizeCitationUrl(href ?? null);
    return normalized ? byUrl.get(normalized) : undefined;
  };
}

// ─── Cited vs consulted ──────────────────────────────────────────────────────

const MARKDOWN_LINK_URL_RE = /\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;

/**
 * Normalized URLs of every markdown link in the message's text parts — i.e.
 * the sources the answer actually cites inline. Everything else in the
 * Sources panel was merely consulted (mostly search hits), and presenting
 * "12 sources" when 9 are unread search results undermines verifiability.
 */
export function extractCitedUrls(msg: UIMessage): Set<string> {
  const cited = new Set<string>();
  for (const part of msg.parts ?? []) {
    if (!isTextPart(part)) continue;
    for (const match of part.text.matchAll(MARKDOWN_LINK_URL_RE)) {
      const normalized = normalizeCitationUrl(match[1]);
      if (normalized) cited.add(normalized);
    }
  }
  return cited;
}

/**
 * Order sources cited-first (preserving natural section order within each
 * group) and return the split point. The Sources panel renders group
 * headers; footnote numbers stay continuous across the boundary.
 */
export function splitSourcesByCited(
  sources: MessageSource[],
  citedUrls: Set<string>,
): { ordered: MessageSource[]; citedCount: number } {
  const cited: MessageSource[] = [];
  const consulted: MessageSource[] = [];
  for (const source of sources) {
    const normalized = normalizeCitationUrl(source.url);
    (normalized && citedUrls.has(normalized) ? cited : consulted).push(source);
  }
  return { ordered: [...cited, ...consulted], citedCount: cited.length };
}

// ─── Clipboard text ──────────────────────────────────────────────────────────

/**
 * Render the answer for the clipboard: inline markdown citations become
 * "label [n]" footnote references and a numbered source list is appended.
 * Raw markdown link syntax pasted into an email reads as noise to the
 * case managers and attorneys this is built for.
 */
export function buildAnswerClipboardText(answerText: string, orderedSources: MessageSource[]): string {
  if (!answerText.trim()) return answerText;
  const resolve = buildCitationResolver(orderedSources);

  const body = answerText.replace(
    /\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g,
    (_match, label: string, url: string) => {
      const sourceNumber = resolve(label, url);
      return sourceNumber !== undefined ? `${label} [${sourceNumber}]` : label;
    },
  );

  if (orderedSources.length === 0) return body;

  const sourceLines = orderedSources.map(
    (source, i) => `[${i + 1}] ${source.label} — ${source.url}`,
  );
  return `${body}\n\nSources:\n${sourceLines.join('\n')}`;
}
