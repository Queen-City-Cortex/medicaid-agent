export type SensitiveIdentifierKind =
  | 'ssn'
  | 'date_of_birth'
  | 'email'
  | 'phone'
  | 'member_id';

const RULES: ReadonlyArray<readonly [SensitiveIdentifierKind, RegExp]> = [
  // A labelled number may be written without separators. An unlabelled one is
  // matched when hyphenated, or when spaced 3-2-4 and standing apart from other
  // digit groups, so a ZIP+4 (5-4) and longer runs of codes do not match.
  ['ssn', /\b(?:ssn|social\s+security(?:\s+number)?)\s*(?:is\s+)?[:#-]?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b|(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)|(?<!\d ?)\d{3} \d{2} \d{4}(?! ?\d)/i],
  ['date_of_birth', /\b(?:dob|date\s+of\s+birth|birth\s*date)\s*[:#-]?\s*(?:\d{1,2}[/-]){2}\d{2,4}\b/i],
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['phone', /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\d)/],
  // The label must end at a word boundary and the value must contain a digit,
  // so "Medicaid non-emergency" and "beneficiary no longer" are not identifiers.
  ['member_id', /\b(?:medicaid|member|beneficiary|recipient)\s*(?:id|number|no\.?|#)(?![A-Za-z])\s*(?:number\s+)?(?:is\s+)?[:#-]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,32}\b/i],
];

export function findSensitiveIdentifiers(text: string): SensitiveIdentifierKind[] {
  return RULES
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}
