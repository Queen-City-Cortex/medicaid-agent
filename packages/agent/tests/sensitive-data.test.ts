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
    ['My Medicaid ID is 945123456K', 'member_id'],
    ['medicaid id 900123456K', 'member_id'],
    ['Is Medicaid ID ABC-12345 eligible for PCS?', 'member_id'],
    ['beneficiary no. 900123456', 'member_id'],
    ['Recipient # 12345-6789', 'member_id'],
    ['ssn 123456789', 'ssn'],
    ['My social security number is 123456789', 'ssn'],
    ['birthdate: 03-04-1960', 'date_of_birth'],
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
    'Medicaid no cubre',
    'Medicaid no cubre los lentes',
    'Medicaid no quiere pagar',
    'Does Medicaid non-emergency transportation require prior approval?',
    'Where can a beneficiary find their Medicaid ID number?',
    'What must a Medicaid notification of adverse action include?',
    'Which Medicaid non-covered services can a provider bill the beneficiary for?',
    'What is on the Medicaid identification card?',
    'How many beneficiary notices are required before termination?',
    'What is the Medicaid no-show policy?',
    'A hearing request must be filed no later than 30 days after the notice',
    'Medicaid number of visits allowed is 22 per year',
    'What is my member number 2026 renewal deadline?',
    'Is CPT 99213 covered under Policy 1A-23?',
  ])('does not flag ordinary Medicaid wording: %s', (text) => {
    expect(findSensitiveIdentifiers(text)).toEqual([]);
  });

  // Behaviour on main today that PRIV-1 (#293) changes. That card redacts
  // phone numbers and e-mail addresses instead of rejecting the message, and
  // lets the date-of-birth label take an "is". Update these rows with it.
  it.each([
    // PRIV-1 flips these to redacted, not rejected.
    ['Call me at 919-555-1212', ['phone']],
    ['+1 (919) 555-1212', ['phone']],
    ['My notice says to call 866-219-5262 for free legal help. Should I?', ['phone']],
    ['Email me at client@example.com', ['email']],
    // PRIV-1 flips this to rejected: a real date of birth passes today.
    ['My date of birth is 03/04/1960', []],
  ])('matches main until PRIV-1 changes it: %s', (text, kinds) => {
    expect(findSensitiveIdentifiers(text)).toEqual(kinds);
  });
});
