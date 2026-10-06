/**
 * Seeded faults for the verifier benchmark (issue #268). Each function takes a
 * captured answer and returns a copy with exactly one error of one kind, plus
 * a record of what changed so a catch can be attributed to it. All of them are
 * pure and deterministic: the first eligible place in the answer is used, and
 * `null` means the answer has no place where that kind of error can be seeded.
 */
import { normalizeUrl } from '../../src/processors/verifier/answer-validation.js';
import type { SourceEntry } from '../../src/processors/verifier/evidence.js';

export const SEED_KINDS = ['figure', 'date', 'qualifier', 'section_label'] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

export interface SeedChange {
  kind: SeedKind;
  /** Offset of `original` in the unseeded answer and of `replacement` in the seeded one. */
  offset: number;
  original: string;
  replacement: string;
  /** The line of the seeded answer that holds the change. */
  seededLine: string;
  /** Section labels only: whether the turn retrieved the section now named. */
  siblingRetrieved?: boolean;
}

export interface SeededAnswer {
  text: string;
  change: SeedChange;
}

type Range = [start: number, end: number];

const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;
const BARE_URL = /https?:\/\/[^\s)\]'"<>]+/g;
const QUOTED = /["“][^"“”\n]+["”]/g;
const BLOCKQUOTE_LINE = /^[ \t]*>.*$/gm;
const VERIFIER_MARKER = /\[(?:unverified|wrong source|missing citation):[^\]]*\]/gi;

/** Spans a seed must not touch: links (the URL check would catch a changed
 *  URL), quotations (the quotation check would catch a changed quote) and
 *  verifier markers. What is left is the answer's own prose. */
function protectedRanges(answer: string): Range[] {
  const ranges: Range[] = [];
  for (const pattern of [MARKDOWN_LINK, BARE_URL, QUOTED, BLOCKQUOTE_LINE, VERIFIER_MARKER]) {
    for (const match of answer.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

const overlaps = (ranges: Range[], start: number, end: number) => ranges.some(([a, b]) => start < b && end > a);

function lineAt(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const end = text.indexOf('\n', offset);
  return text.slice(start, end === -1 ? text.length : end).trim();
}

function replaceAt(answer: string, offset: number, original: string, replacement: string, kind: SeedKind, extra: Partial<SeedChange> = {}): SeededAnswer {
  const text = answer.slice(0, offset) + replacement + answer.slice(offset + original.length);
  return { text, change: { kind, offset, original, replacement, seededLine: lineAt(text, offset), ...extra } };
}

/** Text of the entries that can support a claim; the routing hint cannot. */
function evidenceText(sources: SourceEntry[]): string {
  return sources.filter(source => source.toolName !== 'resolveAnswerFrame').map(source => source.text).join('\n');
}

// ── Figure ───────────────────────────────────────────────────────────────────

const UNIT = '(?:calendar |business |working |consecutive )?(?:days?|hours?|visits?|units?|months?|weeks?|years?|minutes?|sessions?)\\b';
// A dollar amount, a percentage, or a count with a unit. The capture is the number.
const FIGURE = new RegExp(`\\$\\s?(\\d[\\d,]*(?:\\.\\d+)?)|\\b(\\d[\\d,]*(?:\\.\\d+)?)\\s?(?:%|percent\\b)|\\b(\\d[\\d,]*(?:\\.\\d+)?)(?=[ -]${UNIT})`, 'gi');

/** True when `number` occurs in `text` as a whole number, ignoring thousands separators. */
export function hasNumber(text: string, number: string): boolean {
  const plain = number.replace(/,/g, '').replace(/\./g, '\\.');
  return new RegExp(`(?<![\\d.])${plain}(?![\\d]|\\.\\d)`).test(text.replace(/(\d),(?=\d{3})/g, '$1'));
}

/** Different plausible values for a number, most plausible slip first: the
 *  last two digits transposed, then half as much again, then one more. */
function figureCandidates(number: string): string[] {
  const grouped = number.includes(',');
  const [whole, fraction] = number.replace(/,/g, '').split('.');
  const format = (value: string) => (grouped ? Number(value).toLocaleString('en-US') : value) + (fraction === undefined ? '' : `.${fraction}`);
  const candidates: string[] = [];
  if (whole.length >= 2) {
    const swapped = whole.slice(0, -2) + whole[whole.length - 1] + whole[whole.length - 2];
    if (swapped !== whole && !swapped.startsWith('0')) candidates.push(swapped);
  }
  const value = Number(whole);
  candidates.push(String(value + Math.max(1, Math.round(value / 2))), String(value + 1), String(value + 2));
  return candidates.map(format);
}

/** Change one dollar amount, percentage or counted quantity that the evidence
 *  states to a value the evidence does not state. */
export function seedFigure(answer: string, sources: SourceEntry[]): SeededAnswer | null {
  const evidence = evidenceText(sources);
  const off = protectedRanges(answer);
  for (const match of answer.matchAll(FIGURE)) {
    const number = match[1] ?? match[2] ?? match[3];
    const offset = match.index + match[0].indexOf(number);
    if (overlaps(off, offset, offset + number.length) || !hasNumber(evidence, number)) continue;
    const replacement = figureCandidates(number).find(candidate => !hasNumber(evidence, candidate));
    if (replacement) return replaceAt(answer, offset, number, replacement, 'figure');
  }
  return null;
}

// ── Date ─────────────────────────────────────────────────────────────────────

const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
// Month D, YYYY; Month YYYY; M/D/YYYY; YYYY-MM-DD. The capture is the year.
const DATE = new RegExp(`\\b${MONTH} (?:\\d{1,2}, )?((?:19|20)\\d{2})\\b|\\b\\d{1,2}/\\d{1,2}/((?:19|20)\\d{2})\\b|\\b((?:19|20)\\d{2})-\\d{2}-\\d{2}\\b`, 'g');

/** Move one date to another year: the next year, or the previous one when the
 *  evidence or the answer already has that date. */
export function seedDate(answer: string, sources: SourceEntry[]): SeededAnswer | null {
  const evidence = evidenceText(sources).toLowerCase();
  const off = protectedRanges(answer);
  for (const match of answer.matchAll(DATE)) {
    if (overlaps(off, match.index, match.index + match[0].length)) continue;
    const year = match[1] ?? match[2] ?? match[3];
    const yearAt = match[0].lastIndexOf(year);
    for (const delta of [1, -1, 2]) {
      const shifted = match[0].slice(0, yearAt) + String(Number(year) + delta) + match[0].slice(yearAt + year.length);
      if (evidence.includes(shifted.toLowerCase()) || answer.includes(shifted)) continue;
      return replaceAt(answer, match.index, match[0], shifted, 'date');
    }
  }
  return null;
}

// ── Qualifier ────────────────────────────────────────────────────────────────

// Each pair turns a rule into a different rule. Longer phrases come first so
// that "is not covered" is read whole, not as "covered".
const QUALIFIER_FLIPS: Array<[RegExp, string]> = [
  [/\bunder age 21\b/i, 'age 21 and over'],
  [/\bunder 21 years of age\b/i, '21 years of age and over'],
  [/\bunder 21\b/i, '21 and over'],
  [/\b21 years of age (?:and|or) (?:over|older)\b/i, 'under 21 years of age'],
  [/\b21 (?:and|or) (?:over|older)\b/i, 'under 21'],
  [/\bis not covered\b/i, 'is covered'],
  [/\bare not covered\b/i, 'are covered'],
  [/\bnot covered\b/i, 'covered'],
  [/\bis covered\b/i, 'is not covered'],
  [/\bare covered\b/i, 'are not covered'],
  [/\bdoes not cover\b/i, 'covers'],
  [/\bis not required\b/i, 'is required'],
  [/\bare not required\b/i, 'are required'],
  [/\bis required\b/i, 'is not required'],
  [/\bare required\b/i, 'are not required'],
  [/\bdoes not require\b/i, 'requires'],
  [/\bmust not\b/i, 'may'],
  [/\bmay not\b/i, 'may'],
  [/\bcannot\b/i, 'can'],
  [/\bmust\b/i, 'may'],
  [/\bat least\b/i, 'at most'],
  [/\bno more than\b/i, 'at least'],
  [/\bup to\b/i, 'at least'],
];

/** Flip the first qualifier in the answer's prose, for example "must" to
 *  "may", "under 21" to "21 and over" or "not covered" to "covered". */
export function seedQualifier(answer: string): SeededAnswer | null {
  const off = protectedRanges(answer);
  let best: { offset: number; original: string; replacement: string } | null = null;
  for (const [pattern, flipped] of QUALIFIER_FLIPS) {
    for (const match of answer.matchAll(new RegExp(pattern.source, 'gi'))) {
      if (overlaps(off, match.index, match.index + match[0].length)) continue;
      // Earliest place wins; at the same place the first (longest) pattern wins.
      if (!best || match.index < best.offset) {
        const capital = /^[A-Z]/.test(match[0]);
        best = { offset: match.index, original: match[0], replacement: capital ? flipped[0].toUpperCase() + flipped.slice(1) : flipped };
      }
      break;
    }
  }
  return best ? replaceAt(answer, best.offset, best.original, best.replacement, 'qualifier') : null;
}

// ── Section label ────────────────────────────────────────────────────────────

const SECTION_IN_LABEL = /§\s*(\d[A-Za-z0-9.-]*(?:\([A-Za-z0-9]+\))*)/;

const segments = (sectionNumber: string) => sectionNumber.toLowerCase().split(/[.()]+/).filter(Boolean);
const related = (a: string[], b: string[]) => a.slice(0, Math.min(a.length, b.length)).every((segment, i) => segment === b[i]);

/** Move one citation label to a sibling section of the same document: another
 *  section the turn retrieved from that document when there is one, otherwise
 *  the next section number. The link is left alone, so the URL check passes. */
export function seedSectionLabel(answer: string, sources: SourceEntry[]): SeededAnswer | null {
  const cited = new Set([...answer.matchAll(MARKDOWN_LINK)].map(match => match[1].match(SECTION_IN_LABEL)?.[1]).filter(Boolean));
  for (const match of answer.matchAll(MARKDOWN_LINK)) {
    const [, label, rawUrl] = match;
    const section = label.match(SECTION_IN_LABEL);
    if (!section) continue;
    const number = section[1].replace(/[.-]+$/, '');
    const offset = match.index + 1 + section.index! + section[0].indexOf(number);
    const url = normalizeUrl(rawUrl);
    const own = segments(number);
    const retrieved = sources
      .filter(source => source.sectionNumber && source.link && normalizeUrl(source.link) === url)
      .map(source => source.sectionNumber!)
      .find(candidate => !cited.has(candidate) && !related(segments(candidate), own));
    if (retrieved) return replaceAt(answer, offset, number, retrieved, 'section_label', { siblingRetrieved: true });
    const next = number.match(/^(.*?)(\d+)$/);
    if (!next) continue;
    const sibling = next[1] + String(Number(next[2]) + 1);
    if (cited.has(sibling)) continue;
    const siblingRetrieved = sources.some(source => source.sectionNumber === sibling && !!source.link && normalizeUrl(source.link) === url);
    return replaceAt(answer, offset, number, sibling, 'section_label', { siblingRetrieved });
  }
  return null;
}

export function seedFault(kind: SeedKind, answer: string, sources: SourceEntry[]): SeededAnswer | null {
  switch (kind) {
    case 'figure': return seedFigure(answer, sources);
    case 'date': return seedDate(answer, sources);
    case 'qualifier': return seedQualifier(answer);
    case 'section_label': return seedSectionLabel(answer, sources);
  }
}

/**
 * Whether a seeded error is still in `text` (a correction, or the final
 * answer). The change counts as present when the words around it are intact,
 * or, for a figure, date or section number the unseeded answer never used,
 * when that value appears anywhere. A correction that rewords the sentence
 * and keeps a flipped qualifier is not detected: read corrected seeded runs
 * in the report before trusting a qualifier catch.
 */
export function seedSurvives(seeded: SeededAnswer, originalAnswer: string, text: string): boolean {
  const { offset, replacement, kind } = seeded.change;
  const lineStart = seeded.text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = seeded.text.indexOf('\n', offset);
  const context = seeded.text.slice(Math.max(lineStart, offset - 15), Math.min(lineEnd === -1 ? seeded.text.length : lineEnd, offset + replacement.length + 15));
  if (text.includes(context)) return true;
  if (kind === 'qualifier') return false;
  const present = (value: string, where: string) => (kind === 'figure' ? hasNumber(where, value) : where.includes(value));
  return !present(replacement, originalAnswer) && present(replacement, text);
}
