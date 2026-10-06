import { render, screen } from '@testing-library/react';
import {
  CONVERSATION_RETENTION_DAYS,
  FEEDBACK_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_HOURS,
  USAGE_RETENTION_DAYS,
} from '@nc-medicaid/contracts';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../../src/app/privacy/page';

function item(label: string): string {
  const element = screen.getByText(label, { selector: 'strong' }).closest('li');
  return (element?.textContent ?? '').replace(/\s+/g, ' ');
}

describe('PrivacyPage', () => {
  it('keeps the draft banner', () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(/pending attorney review/i);
  });

  it('states each retention period the agent enforces, from the shared constants', () => {
    render(<PrivacyPage />);
    expect(item('Conversations')).toContain(`${CONVERSATION_RETENTION_DAYS} days without activity`);
    expect(item('Deep-research runs')).toContain(`${CONVERSATION_RETENTION_DAYS} days`);
    expect(item('Feedback')).toContain(`${FEEDBACK_RETENTION_DAYS} days`);
    expect(item('Usage records')).toContain(`${USAGE_RETENTION_DAYS} days`);
    expect(item('Rate-limit records')).toContain(`${RATE_LIMIT_RETENTION_HOURS} hours`);
    expect(document.body.textContent).not.toMatch(/kept until you delete/i);
  });

  it('says deleted data stays in backups for up to 30 days', () => {
    render(<PrivacyPage />);
    expect(item('Backups.')).toMatch(/each copy is deleted after 30 days/i);
    expect(item('Account deletion.')).toMatch(/backup copies made before the deletion .* up to 30 days/i);
  });

  it('describes assistant memory as belonging to one conversation', () => {
    render(<PrivacyPage />);
    const memory = item('Conversation summaries.');
    expect(memory).toMatch(/not carried into your other conversations/i);
    expect(document.body.textContent).not.toMatch(/across your own conversations/i);
  });
});
