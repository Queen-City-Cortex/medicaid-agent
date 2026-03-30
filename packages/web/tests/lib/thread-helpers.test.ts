import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate, getThreadTitle } from '../../src/lib/thread-helpers';

describe('formatDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns time string for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));

    const result = formatDate('2026-03-30T10:30:00');
    // Should be a time like "10:30 AM" — contains digits and colon
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns Yesterday for yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));

    expect(formatDate('2026-03-29T10:00:00')).toBe('Yesterday');
  });

  it('returns weekday name for 3 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));

    const result = formatDate('2026-03-27T10:00:00');
    // Should be a short weekday like "Fri"
    expect(result).toMatch(/^[A-Z][a-z]{2}/);
  });

  it('returns month and day for 10+ days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));

    const result = formatDate('2026-03-15T10:00:00');
    // Should be like "Mar 15"
    expect(result).toMatch(/[A-Z][a-z]{2}\s+\d{1,2}/);
  });

  it('accepts Date objects', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));

    expect(formatDate(new Date('2026-03-29T10:00:00'))).toBe('Yesterday');
  });
});

describe('getThreadTitle', () => {
  it('returns thread title when present', () => {
    expect(getThreadTitle({ title: 'My conversation' } as any)).toBe('My conversation');
  });

  it('truncates long titles to 50 chars with ellipsis', () => {
    const longTitle = 'A'.repeat(60);
    const result = getThreadTitle({ title: longTitle } as any);
    expect(result).toBe('A'.repeat(50) + '...');
    expect(result.length).toBe(53);
  });

  it('returns "New conversation" for empty title', () => {
    expect(getThreadTitle({ title: '' } as any)).toBe('New conversation');
  });

  it('returns "New conversation" for whitespace-only title', () => {
    expect(getThreadTitle({ title: '   ' } as any)).toBe('New conversation');
  });

  it('returns "New conversation" for missing title', () => {
    expect(getThreadTitle({} as any)).toBe('New conversation');
  });
});
