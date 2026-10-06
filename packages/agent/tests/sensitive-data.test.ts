import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { screenUserText } from '../src/sensitive-data.js';

const PHONE = '[phone number removed]';
const EMAIL = '[email removed]';

describe('screenUserText', () => {
  it.each([
    ['My SSN is 123-45-6789', 'ssn'],
    ['social security number 123 45 6789', 'ssn'],
    ['her number is 123-45-6789', 'ssn'],
    ['it is 123 45 6789', 'ssn'],
    ['household of 2 123-45-6789', 'ssn'],
    ['ssn 123456789', 'ssn'],
    ['My social security number is 123456789', 'ssn'],
    ['SSN: 123-45-6789', 'ssn'],
    ['DOB: 04/05/1980', 'date_of_birth'],
    ['birthdate: 03-04-1960', 'date_of_birth'],
    ['My date of birth is 03/04/1960', 'date_of_birth'],
    ['date of birth is: 3/4/60', 'date_of_birth'],
    ['Her DOB is 03/04/1960 and she lost coverage', 'date_of_birth'],
    ['birth date 03/04/1960', 'date_of_birth'],
    ['Date of Birth - 03/04/1960', 'date_of_birth'],
    ['Medicaid ID: ABC-12345', 'member_id'],
    ['Medicaid ID: 945123456K', 'member_id'],
    ['member number # ZX987654', 'member_id'],
    ['member number 123456789', 'member_id'],
    ['My Medicaid number is 9001234567', 'member_id'],
    ['Medicaid ID is 945123456K', 'member_id'],
    ['member id number 123456789A', 'member_id'],
    ['My Medicaid ID is 945123456K', 'member_id'],
    ['my medicaid id is 945123456K', 'member_id'],
    ['medicaid id 900123456K', 'member_id'],
    ['Is Medicaid ID ABC-12345 eligible for PCS?', 'member_id'],
    ['beneficiary no. 900123456', 'member_id'],
    ['Recipient # 12345-6789', 'member_id'],
    ['Medicaid ID 2026-20275', 'member_id'],
    ['Mi número de Medicaid ID es: Medicaid ID 945123456K', 'member_id'],
  ] as const)('refuses the identifier in %s', (text, kind) => {
    const screened = screenUserText(text);
    expect(screened.refused).toEqual([kind]);
    expect(screened.redacted).toEqual([]);
    expect(screened.text).toBe(text);
  });

  it.each([
    'Compare Policy 3L on 07/01/2026',
    'Does Medicaid non-emergency medical transportation cover dialysis trips?',
    'What happens when a beneficiary no longer meets the level of care?',
    'How does Medicaid identify third-party coverage?',
    'Medicaid identifies third-party coverage through data matches',
    'What is a Medicaid ID number used for?',
    'When Medicaid notifies a member, how long is the notice period?',
    'Is member notification required before a reduction in services?',
    'Mail the form to 2501 Mail Service Center, Raleigh NC 27699-2501',
    'Codes 99213 99214 99215 are billed together',
    'Call center hours are 8 to 5, reference 2026 10 05',
    'Medicaid no cubre',
    'Medicaid no cubre los lentes',
    'Medicaid no quiere',
    'Medicaid no quiere pagar',
    'Medicaid no continuará',
    'Mi Medicaid no continuará después de diciembre',
    'Does Medicaid non-emergency transportation require prior approval?',
    'Medicaid Non-Emergency',
    'Where can a beneficiary find their Medicaid ID number?',
    'What must a Medicaid notification of adverse action include?',
    'Which Medicaid non-covered services can a provider bill the beneficiary for?',
    'Medicaid non-coverage',
    'What is on the Medicaid identification card?',
    'How many beneficiary notices are required before termination?',
    'What is the Medicaid no-show policy?',
    'A hearing request must be filed no later than 30 days after the notice',
    'Medicaid number of visits allowed is 22 per year',
    'What is my member number 2026 renewal deadline?',
    'Is CPT 99213 covered under Policy 1A-23?',
    // A range of years after the label is a period, not an identifier.
    'Medicaid ID 2026-2027',
    'Which Medicaid ID 2026-2027 card changes apply to members?',
    'Medicaid number: 2025-2026 renewal cycle',
    // Dates that are not labelled as a birth date.
    'The change is effective 03/04/2025',
    'My notice dated 03/04/2025 says my coverage ends 04/30/2025',
    'My daughter is 4 years old and turns 5 on 06/01/2026',
    'A child under age 19 born after 2010 qualifies how?',
    'Is the date of birth on the application used to decide the age band?',
    'What birth date cutoff applies to Health Choice?',
    'My baby was born 03/04/2025, is she covered from birth?',
    'Medicaid ID Number: ______  Date of Birth: __/__/____',
  ])('does not refuse or change ordinary Medicaid wording: %s', (text) => {
    expect(screenUserText(text)).toEqual({ text, redacted: [], refused: [] });
  });

  it.each([
    ['Call me at 919-555-1212', `Call me at ${PHONE}`, ['phone']],
    ['+1 (919) 555-1212', PHONE, ['phone']],
    ['Phone: (919) 555-1212', `Phone: ${PHONE}`, ['phone']],
    ['my cell is (919)555-1212.', `my cell is ${PHONE}.`, ['phone']],
    ['(919)-555-1212 or (919).555.1212', `${PHONE} or ${PHONE}`, ['phone']],
    ['Write to .jane-client@example.com', `Write to ${EMAIL}`, ['email']],
    ['1-800-662-7030 or 919.555.1212', `${PHONE} or ${PHONE}`, ['phone']],
    ['My notice says to call 866-219-5262 for free legal help. Should I?',
      `My notice says to call ${PHONE} for free legal help. Should I?`, ['phone']],
    ['Email me at client@example.com', `Email me at ${EMAIL}`, ['email']],
    ['Write to Jane.Client+nc@mail.example.org, please.', `Write to ${EMAIL}, please.`, ['email']],
    ['Reach me at client@example.com or 919-555-1212', `Reach me at ${EMAIL} or ${PHONE}`, ['email', 'phone']],
    // An agency number the user calls "the Medicaid number" is a phone number.
    ['The Medicaid number is 888-245-0179, who answers it?', `The Medicaid number is ${PHONE}, who answers it?`, ['phone']],
    ['Llame al 866-219-5262 para ayuda legal gratis', `Llame al ${PHONE} para ayuda legal gratis`, ['phone']],
  ] as const)('redacts contact details and does not refuse: %s', (text, kept, redacted) => {
    expect(screenUserText(text)).toEqual({ text: kept, redacted, refused: [] });
  });

  it('redacts contact details in a message it also refuses', () => {
    expect(screenUserText('My Medicaid ID is 945123456K, call 919-555-1212')).toEqual({
      text: `My Medicaid ID is 945123456K, call ${PHONE}`, redacted: ['phone'], refused: ['member_id'],
    });
  });

  it('leaves numbers that are not phone-shaped alone', () => {
    for (const text of ['NPI 1234567893', 'Raleigh NC 27699-2501', 'claim 2026-10-05-0001', 'CPT 99213, 99214', '$1,769 a month']) {
      expect(screenUserText(text)).toEqual({ text, redacted: [], refused: [] });
    }
  });

  it('answers a pasted blank DSS-8110 notice, with its agency numbers removed', () => {
    const notice = readFileSync(new URL('./fixtures/dss-8110-changetermination-timely.md', import.meta.url), 'utf8');
    expect(notice).toContain('866-219-5262');
    const screened = screenUserText(notice.slice(0, 10_000));
    expect(screened.refused).toEqual([]);
    expect(screened.redacted).toEqual(['phone']);
    expect(screened.text).not.toMatch(/\d{3}-\d{3}-\d{4}/);
    expect(screened.text).toContain(`or call ${PHONE} toll free`);
  });

  it('screens a 10,000-character input built to make a pattern backtrack without stalling', () => {
    const size = 10_000;
    const inputs = [
      `member id${' '.repeat(size)}`,
      `ssn${' '.repeat(size)}`,
      `date of birth${' '.repeat(size)}`,
      `Medicaid ID ${'A-'.repeat(size / 2)}`,
      'medicaid id is : '.repeat(size / 17),
      `${'medicaid'}${' '.repeat(size / 2)}id${' '.repeat(size / 2)}`,
      'a.'.repeat(size / 2),
      'a@'.repeat(size / 2),
      `a@${'a.'.repeat(size / 2)}`,
      '9'.repeat(size),
      '919-555-'.repeat(size / 8),
      '(919) '.repeat(size / 6),
      '123 45 '.repeat(size / 7),
    ];
    const started = performance.now();
    for (const input of inputs) expect(screenUserText(input).refused).toEqual([]);
    // All of them take about a millisecond; the patterns this replaced took 290.
    expect(performance.now() - started).toBeLessThan(250);
  });
});
