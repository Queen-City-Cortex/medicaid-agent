import { describe, expect, it } from 'vitest';
import { findSensitiveIdentifiers } from '../src/sensitive-data.js';

describe('findSensitiveIdentifiers', () => {
  it.each([
    ['My SSN is 123-45-6789', 'ssn'],
    ['DOB: 04/05/1980', 'date_of_birth'],
    ['Email me at client@example.com', 'email'],
    ['Phone: (919) 555-1212', 'phone'],
    ['Medicaid ID: ABC-12345', 'member_id'],
    ['member number # ZX987654', 'member_id'],
  ])('detects direct identifier in %s', (text, kind) => {
    expect(findSensitiveIdentifiers(text)).toContain(kind);
  });

  it('does not block policy numbers or unlabeled dates', () => {
    expect(findSensitiveIdentifiers('Compare Policy 3L on 07/01/2026')).toEqual([]);
  });
});
