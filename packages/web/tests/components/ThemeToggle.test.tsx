import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThemeToggle } from '../../src/components/ThemeToggle';

const setTheme = vi.fn();

vi.mock('../../src/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    setTheme.mockReset();
  });

  it('exposes the options as menuitemradio with aria-checked on the active theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByLabelText('Toggle theme'));

    const items = await screen.findAllByRole('menuitemradio');
    expect(items).toHaveLength(3);

    const system = screen.getByRole('menuitemradio', { name: /system/i });
    expect(system).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a visible check indicator on the selected item only', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByLabelText('Toggle theme'));

    const system = await screen.findByRole('menuitemradio', { name: /system/i });
    const light = screen.getByRole('menuitemradio', { name: /light/i });
    expect(system.querySelector('[data-slot="dropdown-menu-radio-item-indicator"] svg')).not.toBeNull();
    expect(light.querySelector('[data-slot="dropdown-menu-radio-item-indicator"] svg')).toBeNull();
  });

  it('calls setTheme with the chosen value', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByLabelText('Toggle theme'));
    await user.click(await screen.findByRole('menuitemradio', { name: /dark/i }));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
