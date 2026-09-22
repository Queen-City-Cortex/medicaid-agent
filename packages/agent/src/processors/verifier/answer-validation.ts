import type { SourceEntry } from './evidence.js';

// ── Rendering helpers ───────────────────────────────────────────────────────

const MISSING_CITATION_MARKER = '[missing citation:';
const VERIFIER_MARKER_PREFIXES = ['[unverified:', '[wrong source:', MISSING_CITATION_MARKER];

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

/**
 * Parse `[missing citation: <content>]` markers out of the verifier's corrected
 * answer. Returns the body with markers stripped and the list of suggested
 * citations in the order they appeared.
 */
function extractMissingCitations(text: string): { body: string; citations: string[] } {
  const spans = scanMarkerSpans(text, [MISSING_CITATION_MARKER]);
  const citations = spans.map((span) => span.content).filter(Boolean);

  const segments: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    segments.push(text.slice(cursor, span.start));
    cursor = span.end;
  }
  segments.push(text.slice(cursor));

  let body = segments.join('');
  // Clean up whitespace that the marker left behind (e.g., `sentence. <gap> `).
  body = body.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();
  return { body, citations };
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

/** Hosts that legitimately appear without a backing tool output (the
 *  verification disclaimer links the NC DHHS portal root). */
const ALWAYS_ALLOWED_URLS = new Set([normalizeUrl('https://medicaid.ncdhhs.gov')]);

export interface UrlValidationResult {
  /** Answer with unknown markdown links demoted to their plain-text labels. */
  validatedAnswer: string;
  /** Original (un-normalized) URLs that appear in no retrieved source. */
  unknownUrls: string[];
  checkedUrlCount: number;
  retrievedUrlCount: number;
  allowedUrlCount: number;
}

/**
 * Deterministic URL check: every markdown link target in the answer must
 * exist somewhere in the retrieved sources (the `link` field or a URL embedded
 * in the tool-output text). The agent has no legitimate way to know a URL its
 * tools never returned — an unknown URL is a fabrication (observed with
 * h-043 in the 2026-06-12 eval: an invented `/download?attachment` link).
 * Unknown links are demoted to plain text so they are not clickable.
 */
export function validateAnswerUrls(answerText: string, sources: SourceEntry[]): UrlValidationResult {
  const retrieved = new Set<string>();
  for (const source of sources) {
    if (source.link) retrieved.add(normalizeUrl(source.link));
    for (const url of source.text.match(BARE_URL_PATTERN) ?? []) {
      retrieved.add(normalizeUrl(url));
    }
  }

  const unknownUrls: string[] = [];
  let checkedUrlCount = 0;
  let retrievedUrlCount = 0;
  let allowedUrlCount = 0;
  const check = (url: string): boolean => {
    checkedUrlCount += 1;
    const normalized = normalizeUrl(url);
    if (retrieved.has(normalized)) { retrievedUrlCount += 1; return true; }
    if (ALWAYS_ALLOWED_URLS.has(normalized)) { allowedUrlCount += 1; return true; }
    unknownUrls.push(url);
    return false;
  };
  const validatedAnswer = answerText.replace(MARKDOWN_LINK_PATTERN, (match, label: string, url: string) => {
    if (check(url)) return match;
    return label;
  });

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

  return { validatedAnswer, unknownUrls, checkedUrlCount, retrievedUrlCount, allowedUrlCount };
}

export interface QuoteValidationResult {
  /** Answer with unknown long quotes marked `[unverified quote — ...]`. */
  validatedAnswer: string;
  unknownQuotes: string[];
  checkedQuoteCount: number;
}

const QUOTE_MIN_LENGTH = 30;
const UNVERIFIED_QUOTE_MARK = ' [unverified quote — not found in retrieved sources]';

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
 * the full retrieved source text; quotes that appear nowhere get a visible
 * `[unverified quote]` mark appended (marked, not deleted — removing text the
 * answer presents as verbatim is riskier than flagging it). Short quoted
 * phrases (scare quotes like "not covered") are ignored.
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
  const validatedAnswer = answerText.replace(
    /["“]([^"“”]+)["”]/g,
    (match, inner: string) => {
      const normalized = normalizeQuotedText(inner);
      if (normalized.length < minLength) return match;
      checkedQuoteCount += 1;
      if (haystack.includes(normalized)) return match;
      unknownQuotes.push(inner);
      return `${match}${UNVERIFIED_QUOTE_MARK}`;
    },
  );

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

  return { validatedAnswer, unknownQuotes, checkedQuoteCount };
}

/**
 * Render the verifier's corrected answer for the user. `[unverified: ...]` and
 * `[wrong source: ...]` markers stay inline because they carry factual
 * uncertainty signal; `[missing citation: ...]` markers are moved to a short
 * footer because they're grammatical annotations, not content claims, and they
 * read poorly mid-sentence.
 */
export function renderCorrectedAnswer(corrected: string, fallback?: string): string {
  if (!corrected) return corrected;
  const { body, citations } = extractMissingCitations(corrected);
  if (citations.length === 0) return body;

  // If the verifier's rewrite is ENTIRELY [missing citation: ...] markers,
  // extraction leaves the body empty. Returning just the citation footer
  // produces a user-visible "answer" with no substance (observed with q-006
  // in the 2026-04-21 eval, scored 0/3). Prefer the untouched original
  // answer text when available; otherwise keep the markers inline.
  if (!body.trim()) {
    return (fallback ?? corrected).trim();
  }

  const uniqueCitations: string[] = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    if (!seen.has(citation)) {
      seen.add(citation);
      uniqueCitations.push(citation);
    }
  }
  const footer = uniqueCitations.map((citation) => `- ${citation}`).join('\n');
  return `${body}\n\n---\n\n*Suggested citations for uncited claims above:*\n${footer}`;
}
