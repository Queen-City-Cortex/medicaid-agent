import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GetHelp } from '../../src/components/GetHelp';
import { CRISIS_LINE, GET_HELP_CONTACTS, GET_HELP_LAST_VERIFIED } from '../../src/lib/get-help';

describe('GetHelp', () => {
  it('lists the county DSS directory, the Ombudsman and Legal Aid with their links', () => {
    render(<GetHelp />);
    const block = screen.getByTestId('get-help');

    const dss = within(block).getByTestId('get-help-county-dss');
    expect(within(dss).getByRole('link', { name: 'Find your county DSS office' })).toHaveAttribute(
      'href',
      'https://www.ncdhhs.gov/divisions/social-services/local-dss-directory',
    );

    const ombudsman = within(block).getByTestId('get-help-ombudsman');
    expect(ombudsman).toHaveTextContent('NC Medicaid Ombudsman');
    expect(within(ombudsman).getByRole('link', { name: '1-877-201-3750' })).toHaveAttribute('href', 'tel:+18772013750');

    const legalAid = within(block).getByTestId('get-help-legal-aid');
    expect(legalAid).toHaveTextContent('Legal Aid of North Carolina Helpline');
    expect(within(legalAid).getByRole('link', { name: '1-866-219-5262' })).toHaveAttribute('href', 'tel:+18662195262');
  });

  it('ends with the 911 and 988 line', () => {
    render(<GetHelp />);
    expect(screen.getByTestId('get-help-crisis-line')).toHaveTextContent(CRISIS_LINE);
    expect(CRISIS_LINE).toBe('In an emergency call 911. Thinking about suicide or in crisis? Call or text 988.');
  });

  // The printed number and the dialled number are separate fields; a typo in
  // one must not send a caller somewhere else.
  it('dials the same digits it prints, and records when the contacts were checked', () => {
    for (const contact of GET_HELP_CONTACTS) {
      if (!contact.phone) continue;
      expect(contact.tel).toBe(`+${contact.phone.replace(/\D/g, '')}`);
    }
    expect(GET_HELP_LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
