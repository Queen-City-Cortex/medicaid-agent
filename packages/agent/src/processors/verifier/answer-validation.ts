import type { SourceEntry } from './evidence.js';

// ── Verifier markers ────────────────────────────────────────────────────────

const VERIFIER_MARKER_PREFIXES = ['[unverified:', '[wrong source:', '[missing citation:'];

interface MarkerSpan {
  start: number;
  /** Index just past the marker's closing `]`. */
  end: number;
  prefix: string;
  content: string;
}

/**
 * Find verifier marker spans (`[unverified: ...]`, `[wrong source: ...]`,
 * `[missing citation: ...]`), tracking bracket depth so payloads containing
 * markdown links like `[Policy 8C § 3.2.1](https://...)` don't stop at the
 * inner `]`. An unmatched marker yields no span (callers keep the original
 * text rather than silently dropping content).
 */
function scanMarkerSpans(text: string, markerPrefixes: string[]): MarkerSpan[] {
  const spans: MarkerSpan[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let idx = -1;
    let prefix = '';
    for (const candidate of markerPrefixes) {
      const found = text.indexOf(candidate, cursor);
      if (found !== -1 && (idx === -1 || found < idx)) {
        idx = found;
        prefix = candidate;
      }
    }
    if (idx === -1) break;

    // Find the marker's matching `]` while honoring nested brackets.
    let depth = 1;
    let j = idx + prefix.length;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (j >= text.length) break; // unmatched — stop scanning

    spans.push({
      start: idx,
      end: j + 1,
      prefix,
      content: text.slice(idx + prefix.length, j).trim(),
    });
    cursor = j + 1;
  }

  return spans;
}

// ── Deterministic rewrite guards ────────────────────────────────────────────

export interface RewriteSubstanceCheck {
  /** Non-marker chars of the corrected answer / chars of the original
   *  (whitespace-normalized). */
  ratio: number;
  lostSubstance: boolean;
}

const REWRITE_SUBSTANCE_MIN_RATIO = 0.4;

/**
 * Retain the legacy rewrite-length telemetry, excluding warning markers.
 * Length is informational: removing unsupported claims can correctly shorten
 * an answer. The release gate always rechecks the correction's actual text
 * and never restores the original based on this ratio.
 */
export function assessRewriteSubstance(
  originalAnswer: string,
  correctedAnswer: string,
  options: { minRatio?: number } = {},
): RewriteSubstanceCheck {
  const minRatio = options.minRatio ?? REWRITE_SUBSTANCE_MIN_RATIO;
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

  const spans = scanMarkerSpans(correctedAnswer, VERIFIER_MARKER_PREFIXES);
  const segments: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    segments.push(correctedAnswer.slice(cursor, span.start));
    cursor = span.end;
  }
  segments.push(correctedAnswer.slice(cursor));

  const remaining = normalize(segments.join(' ')).length;
  const original = normalize(originalAnswer).length;
  const ratio = remaining / Math.max(1, original);
  return { ratio, lostSubstance: ratio < minRatio };
}

/**
 * Normalize a URL for set membership: lowercase scheme + host, drop trailing
 * slash and fragment, KEEP the query string (`download?attachment` is a
 * meaningful distinction on medicaid.ncdhhs.gov).
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;
const BARE_URL_PATTERN = /https?:\/\/[^\s)\]'"<>]+/g;

/** Contact pages an answer may link when it tells a person where to get help
 *  with their own case: the NC Medicaid Ombudsman and the county DSS
 *  directory. The verifier prompt names the same two pages; keep both in step
 *  with the web "Get help" block (`packages/web/src/lib/get-help.ts`). */
export const REFERRAL_PAGE_URLS = [
  'https://medicaid.ncdhhs.gov/about-nc-medicaid/nc-medicaid-ombudsman',
  'https://www.ncdhhs.gov/divisions/social-services/local-dss-directory',
] as const;

/** URLs that legitimately appear without a backing tool output: the NC DHHS
 *  portal root linked by the verification disclaimer, and the referral pages.
 *  Exact matches after normalization; no other page on either host is allowed. */
const ALWAYS_ALLOWED_URLS = new Set(['https://medicaid.ncdhhs.gov', ...REFERRAL_PAGE_URLS].map(normalizeUrl));

export interface UrlValidationResult {
  /** Original (un-normalized) URLs that appear in no retrieved source. */
  unknownUrls: string[];
  checkedUrlCount: number;
  retrievedUrlCount: number;
  allowedUrlCount: number;
}

/**
 * Deterministic URL check: every markdown link target in the answer must
 * exist somewhere in the retrieved sources (the `link` field or a URL embedded
 * in the tool-output text), the routing hint excepted. The agent has no legitimate way to know a URL its
 * tools never returned — an unknown URL is a fabrication (observed with
 * h-043 in the 2026-06-12 eval: an invented `/download?attachment` link).
 * The answer text is never edited here: an unknown URL fails the release.
 */
export function validateAnswerUrls(answerText: string, sources: SourceEntry[]): UrlValidationResult {
  const retrieved = new Set<string>();
  for (const source of sources) {
    for (const url of sourceUrlSet(source)) retrieved.add(url);
  }

  const unknownUrls: string[] = [];
  let checkedUrlCount = 0;
  let retrievedUrlCount = 0;
  let allowedUrlCount = 0;
  const check = (url: string): void => {
    checkedUrlCount += 1;
    const normalized = normalizeUrl(url);
    if (retrieved.has(normalized)) retrievedUrlCount += 1;
    else if (ALWAYS_ALLOWED_URLS.has(normalized)) allowedUrlCount += 1;
    else unknownUrls.push(url);
  };
  for (const [, , url] of answerText.matchAll(MARKDOWN_LINK_PATTERN)) check(url);

  // Markdown autolinks, reference definitions and plain URLs must obey the
  // same allowlist as inline links. Check each URL once across formats.
  const seen = new Set([...answerText.matchAll(MARKDOWN_LINK_PATTERN)].map(match => normalizeUrl(match[2])));
  for (const rawUrl of answerText.match(BARE_URL_PATTERN) ?? []) {
    const url = rawUrl.replace(/[.,;:!`*]+$/, '');
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    check(url);
  }

  return { unknownUrls, checkedUrlCount, retrievedUrlCount, allowedUrlCount };
}

/** Every URL the answer uses, normalized exactly as `validateAnswerUrls`
 *  compares them (markdown link targets, autolinks and plain URLs). */
export function answerUrlSet(answerText: string): Set<string> {
  const urls = new Set([...answerText.matchAll(MARKDOWN_LINK_PATTERN)].map(match => normalizeUrl(match[2])));
  for (const rawUrl of answerText.match(BARE_URL_PATTERN) ?? []) urls.add(normalizeUrl(rawUrl.replace(/[.,;:!`*]+$/, '')));
  return urls;
}

/** The URLs a source can vouch for in `validateAnswerUrls`: its link and any
 *  URL in its text. An answer URL that matches one of them cites this source.
 *  The routing hint vouches for none: it lists documents and sections the
 *  router chose, including ones to avoid, without their text. */
export function sourceUrlSet(source: SourceEntry): Set<string> {
  if (source.toolName === 'resolveAnswerFrame') return new Set();
  const urls = new Set((source.text.match(BARE_URL_PATTERN) ?? []).map(normalizeUrl));
  if (source.link) urls.add(normalizeUrl(source.link));
  return urls;
}

export interface UnknownSection {
  /** The link label as written, emphasis markers removed. */
  label: string;
  /** The link's URL, normalized. */
  url: string;
}

export interface SectionValidationResult {
  /** Labels naming a numbered section whose text the turn did not retrieve. */
  unknownSections: UnknownSection[];
  /** Labels with a numbered section after "§"; the rest are not checked. */
  checkedSectionCount: number;
}

/** Section token of a citation label: the text after "§" up to the first
 *  space, keeping attached parenthesised groups ("5.2.1", "441.302",
 *  "1915(c)"); a spaced suffix such as " (last revised 2024-05-10)" is dropped. */
function citedSectionNumber(label: string): string | null {
  const m = label.match(/§\s*([A-Za-z0-9][A-Za-z0-9.-]*(?:\([A-Za-z0-9]+\))*)/);
  return m ? m[1] : null;
}

/** "441.301(c)(2)" becomes [441, 301, c, 2]. A trailing "0" is dropped so a
 *  "5.0" entry, which holds the text of its "5.x" subsections, is their parent. */
function sectionSegments(sectionNumber: string): string[] {
  const segments = sectionNumber.toLowerCase().split(/[.()]+/).filter(Boolean);
  if (segments.length > 1 && segments[segments.length - 1] === '0') segments.pop();
  return segments;
}

/**
 * Measure, without enforcing, whether each section an answer names was
 * retrieved. Every section of a document shares one URL, so `validateAnswerUrls`
 * accepts `[Policy 8C § 9.9.9](<8C url>)` when only § 3.2.1 was read.
 *
 * A label is matched when an entry that is one section's text (it alone
 * carries `sectionNumber`) shares the link's normalized URL and has the cited
 * number or is an ancestor of it ("§ 5.2.1" on "5.2", "§ 5.6" on "5.0"): a
 * container entry holds its children's text under its own number. A listing
 * names sections without their text and vouches for none. The policy named in
 * the label is not compared, because the URL already scopes the document
 * ("Policy 1-H" and "42 CFR" labels match on the URL of "1H" and eCFR entries).
 *
 * `citedSectionNumber` and `sectionSegments` mirror the section tier of
 * `findCitedSource` in `packages/web/src/lib/message-citations.ts`; keep them
 * in step. Two differences are deliberate: the web falls back to a document's
 * only row, which would match the § 9.9.9 above, and this check skips a label
 * whose token after "§" does not start with a digit ("§ F. Income",
 * "§ Appendix B"), since those name sections the corpus stores unnumbered.
 */
export function validateAnswerSections(answerText: string, sources: SourceEntry[]): SectionValidationResult {
  const retrieved = new Map<string, string[]>();
  for (const source of sources) {
    if (!source.sectionNumber || !source.link) continue;
    const url = normalizeUrl(source.link);
    retrieved.set(url, [...(retrieved.get(url) ?? []), source.sectionNumber]);
  }

  const unknownSections: UnknownSection[] = [];
  let checkedSectionCount = 0;
  for (const [, rawLabel, rawUrl] of answerText.matchAll(MARKDOWN_LINK_PATTERN)) {
    const label = rawLabel.replace(/[*`]/g, '').trim();
    const cited = citedSectionNumber(label);
    if (!cited || !/^\d/.test(cited)) continue;
    checkedSectionCount += 1;
    const url = normalizeUrl(rawUrl);
    const citedSegments = sectionSegments(cited);
    const matched = (retrieved.get(url) ?? []).some(sectionNumber => {
      if (sectionNumber === cited) return true;
      const segments = sectionSegments(sectionNumber);
      return segments.length > 0 && segments.length <= citedSegments.length && segments.every((segment, i) => segment === citedSegments[i]);
    });
    if (!matched) unknownSections.push({ label, url });
  }
  return { unknownSections, checkedSectionCount };
}

export interface QuoteValidationResult {
  unknownQuotes: string[];
  checkedQuoteCount: number;
}

const QUOTE_MIN_LENGTH = 30;

function normalizeQuotedText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Deterministic quote check: long double-quoted spans claim to be verbatim
 * source text. Each is searched for (whitespace/curly-quote-insensitively) in
 * the full retrieved source text; a quote that appears nowhere is reported and
 * fails the release. Short quoted phrases (scare quotes like "not covered")
 * are ignored.
 */
export function validateAnswerQuotes(
  answerText: string,
  sources: SourceEntry[],
  options: { minLength?: number } = {},
): QuoteValidationResult {
  const minLength = options.minLength ?? QUOTE_MIN_LENGTH;
  const haystack = normalizeQuotedText(sources
    .filter(source => source.toolName !== 'resolveAnswerFrame')
    .map(source => source.text).join('\n'));

  const unknownQuotes: string[] = [];
  let checkedQuoteCount = 0;
  for (const [, inner] of answerText.matchAll(/["“]([^"“”]+)["”]/g)) {
    const normalized = normalizeQuotedText(inner);
    if (normalized.length < minLength) continue;
    checkedQuoteCount += 1;
    if (!haystack.includes(normalized)) unknownQuotes.push(inner);
  }

  // A blockquote also claims to reproduce source wording. Join wrapped lines
  // and omit a trailing citation before matching the actual quotation.
  for (const block of answerText.match(/(?:^|\n)(?:[ \t]*>[^\n]*(?:\n|$))+/g) ?? []) {
    const quote = block.replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(MARKDOWN_LINK_PATTERN, '').trim();
    const normalized = normalizeQuotedText(quote);
    if (normalized.length < minLength) continue;
    checkedQuoteCount += 1;
    if (!haystack.includes(normalized) && !unknownQuotes.includes(quote)) unknownQuotes.push(quote);
  }

  return { unknownQuotes, checkedQuoteCount };
}
