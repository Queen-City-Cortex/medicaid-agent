import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisclaimerNotice } from '../../src/components/DisclaimerNotice';

const STORAGE_KEY = 'disclaimer-acknowledged-v1';

// This jsdom setup has no real localStorage — stub it the same way
// use-sidebar-state.test.ts does.
let storage: Map<string, string>;

describe('DisclaimerNotice', () => {
  beforeEach(() => {
    storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
      },
    });
  });

  it('shows the not-legal-advice notice with a terms link on first visit', () => {
    render(<DisclaimerNotice />);
    const notice = screen.getByTestId('disclaimer-notice');
    expect(notice).toHaveTextContent(/not legal advice/i);
    expect(notice).toHaveTextContent(/AI-generated/i);
    expect(notice).toHaveTextContent(/NC DHHS/);
    expect(screen.getByRole('link', { name: /terms of use/i })).toHaveAttribute('href', '/terms');
  });

  it('dismisses on acknowledgment and persists the flag', async () => {
    render(<DisclaimerNotice />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('disclaimer-dismiss'));
    expect(screen.queryByTestId('disclaimer-notice')).not.toBeInTheDocument();
    expect(storage.get(STORAGE_KEY)).toBe('true');
  });

  it('stays hidden once acknowledged', () => {
    storage.set(STORAGE_KEY, 'true');
    render(<DisclaimerNotice />);
    expect(screen.queryByTestId('disclaimer-notice')).not.toBeInTheDocument();
  });
});
