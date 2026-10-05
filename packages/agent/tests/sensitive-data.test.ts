import { describe, expect, it } from 'vitest';
import { findSensitiveIdentifiers } from '../src/sensitive-data.js';

describe('findSensitiveIdentifiers', () => {
  it.each([
    ['My SSN is 123-45-6789', 'ssn'],
    ['social security number 123 45 6789', 'ssn'],
    ['her number is 123-45-6789', 'ssn'],
    ['it is 123 45 6789', 'ssn'],
    ['household of 2 123-45-6789', 'ssn'],
    ['DOB: 04/05/1980', 'date_of_birth'],
    ['Email me at client@example.com', 'email'],
    ['Phone: (919) 555-1212', 'phone'],
    ['Medicaid ID: ABC-12345', 'member_id'],
    ['member number # ZX987654', 'member_id'],
    ['My Medicaid number is 9001234567', 'member_id'],
    ['Medicaid ID is 945123456K', 'member_id'],
    ['member id number 123456789A', 'member_id'],
  ])('detects direct identifier in %s', (text, kind) => {
    expect(findSensitiveIdentifiers(text)).toContain(kind);
  });

  it('does not block policy numbers or unlabeled dates', () => {
    expect(findSensitiveIdentifiers('Compare Policy 3L on 07/01/2026')).toEqual([]);
  });

  it.each([
    'Does Medicaid non-emergency medical transportation cover dialysis trips?',
    'What happens when a beneficiary no longer meets the level of care?',
    'How does Medicaid identify third-party coverage?',
    'What is a Medicaid ID number used for?',
    'When Medicaid notifies a member, how long is the notice period?',
    'Is member notification required before a reduction in services?',
    'Mail the form to 2501 Mail Service Center, Raleigh NC 27699-2501',
    'Codes 99213 99214 99215 are billed together',
    'Call center hours are 8 to 5, reference 2026 10 05',
  ])('does not flag ordinary Medicaid wording: %s', (text) => {
    expect(findSensitiveIdentifiers(text)).toEqual([]);
  });
});
