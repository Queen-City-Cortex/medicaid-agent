export type SensitiveIdentifierKind =
  | 'ssn'
  | 'date_of_birth'
  | 'email'
  | 'phone'
  | 'member_id';

const RULES: ReadonlyArray<readonly [SensitiveIdentifierKind, RegExp]> = [
  ['ssn', /\b(?:ssn|social\s+security(?:\s+number)?)?\s*[:#-]?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b/i],
  ['date_of_birth', /\b(?:dob|date\s+of\s+birth|birth\s*date)\s*[:#-]?\s*(?:\d{1,2}[/-]){2}\d{2,4}\b/i],
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['phone', /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\d)/],
  ['member_id', /\b(?:medicaid|member|beneficiary|recipient)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9-]{5,32}\b/i],
];

export function findSensitiveIdentifiers(text: string): SensitiveIdentifierKind[] {
  return RULES
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

export function extractText(value: unknown, depth = 0): string {
  if (depth > 6 || value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => extractText(item, depth + 1)).join('\n');
  }
  if (typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/token|authorization|password|secret/i.test(key))
    .map(([, child]) => extractText(child, depth + 1))
    .join('\n');
}
