type RefusedIdentifierKind = 'ssn' | 'date_of_birth' | 'member_id';
type RedactedIdentifierKind = 'email' | 'phone';

// Contact details are cut out and the message goes on: a notice the user
// quotes carries agency and legal-aid numbers, and the user's own number is
// not needed to answer. The patterns are global because they replace.
const REDACTIONS: ReadonlyArray<readonly [RedactedIdentifierKind, RegExp, string]> = [
  // The lookbehind lets a match start only at the head of a run of address
  // characters, so a long run without an "@" is scanned once.
  ['email', /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]'],
  ['phone', /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}(?!\d)/g, '[phone number removed]'],
];

// A label is followed by optional spaces, an optional "is" and an optional
// separator. Spaces repeat in one place only, so a long blank run is read once.
const REFUSALS: ReadonlyArray<readonly [RefusedIdentifierKind, RegExp]> = [
  // A labelled number may be written without separators. An unlabelled one is
  // matched when hyphenated, or when spaced 3-2-4 and standing apart from other
  // digit groups, so a ZIP+4 (5-4) and longer runs of codes do not match.
  ['ssn', /\b(?:ssn|social\s+security(?:\s+number)?)\s*(?:is\b\s*)?(?:[:#-]\s*)?\d{3}[- ]?\d{2}[- ]?\d{4}\b|(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)|(?<!\d ?)\d{3} \d{2} \d{4}(?! ?\d)/i],
  // Only a labelled date is a birth date: "effective 03/04/2025" is not.
  ['date_of_birth', /\b(?:dob|date\s+of\s+birth|birth\s*date)\s*(?:is\b\s*)?(?:[:#-]\s*)?(?:\d{1,2}[/-]){2}\d{2,4}\b/i],
  // The label must end at a word boundary and the value must contain a digit,
  // so "Medicaid non-emergency" and "beneficiary no longer" are not identifiers.
  // A range of years ("Medicaid ID 2026-2027") is not one either.
  ['member_id', /\b(?:medicaid|member|beneficiary|recipient)\s*(?:id|number|no\.?|#)(?![A-Za-z])\s*(?:number\s+)?(?:is\b\s*)?(?:[:#-]\s*)?(?!(?:19|20)\d{2}-(?:19|20)\d{2}(?![A-Z0-9-]))(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,32}\b/i],
];

/** The one screen for text a user writes: the chat question, the research
 * question and the feedback comment. `text` has every phone number and e-mail
 * address replaced by a marker; `refused` lists the identifier kinds that
 * remain, and a caller refuses the request when it is not empty. Callers
 * store and send `text`, never their own copy. Redaction runs first, so an
 * agency number written as "the Medicaid number is 888-245-0179" is removed
 * as a phone number and not refused as a member ID. */
export function screenUserText(text: string): {
  text: string;
  redacted: RedactedIdentifierKind[];
  refused: RefusedIdentifierKind[];
} {
  const redacted: RedactedIdentifierKind[] = [];
  let kept = text;
  for (const [kind, pattern, marker] of REDACTIONS) {
    const next = kept.replace(pattern, marker);
    if (next !== kept) redacted.push(kind);
    kept = next;
  }
  return {
    text: kept,
    redacted,
    refused: REFUSALS.filter(([, pattern]) => pattern.test(kept)).map(([kind]) => kind),
  };
}
