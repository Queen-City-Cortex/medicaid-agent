import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StorageThreadType } from '@mastra/core/memory';
import {
  buildThreadDisplayTitles,
  deriveThreadTitleFromMessages,
  deriveThreadTitleFromText,
  formatDate,
  getThreadDisplayTitle,
  getThreadTitle,
} from '../../src/lib/thread-helpers';

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
  function asThread(thread: Partial<StorageThreadType>): StorageThreadType {
    return thread as StorageThreadType;
  }

  it('returns thread title when present', () => {
    expect(getThreadTitle(asThread({ title: 'My conversation' }))).toBe('My conversation');
  });

  it('returns full title for long titles (CSS handles overflow)', () => {
    const longTitle = 'A'.repeat(60);
    const result = getThreadTitle(asThread({ title: longTitle }));
    expect(result).toBe(longTitle);
  });

  it('returns "New conversation" for empty title', () => {
    expect(getThreadTitle(asThread({ title: '' }))).toBe('New conversation');
  });

  it('returns "New conversation" for whitespace-only title', () => {
    expect(getThreadTitle(asThread({ title: '   ' }))).toBe('New conversation');
  });

  it('returns "New conversation" for missing title', () => {
    expect(getThreadTitle(asThread({}))).toBe('New conversation');
  });
});

describe('getThreadDisplayTitle', () => {
  function asThread(thread: Partial<StorageThreadType>): StorageThreadType {
    return thread as StorageThreadType;
  }

  it('prefers the stored thread title', () => {
    expect(getThreadDisplayTitle(asThread({ title: 'Stored title' }), 'Derived title')).toBe('Stored title');
  });

  it('uses a derived title for untitled threads', () => {
    expect(getThreadDisplayTitle(asThread({ title: '   ' }), 'Derived title')).toBe('Derived title');
  });

  it('falls back to New conversation when no stored or derived title exists', () => {
    expect(getThreadDisplayTitle(asThread({}), null)).toBe('New conversation');
  });
});

describe('deriveThreadTitleFromText', () => {
  it('normalizes whitespace before deriving a title', () => {
    expect(deriveThreadTitleFromText('  What   is\nEPSDT?  ')).toBe('What is EPSDT?');
  });

  it('returns null for empty text', () => {
    expect(deriveThreadTitleFromText('   ')).toBeNull();
  });

  it('truncates long text to match new-thread titles', () => {
    const longText = 'A'.repeat(80);
    expect(deriveThreadTitleFromText(longText)).toBe('A'.repeat(60));
  });
});

describe('deriveThreadTitleFromMessages', () => {
  it('uses the first user message', () => {
    expect(deriveThreadTitleFromMessages([
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Can EPSDT cover this?' },
      { role: 'user', content: 'Another question' },
    ])).toBe('Can EPSDT cover this?');
  });

  it('extracts text from structured content', () => {
    expect(deriveThreadTitleFromMessages([
      {
        role: 'user',
        content: {
          parts: [
            { type: 'text', text: 'First line' },
            { type: 'text', text: 'Second line' },
          ],
        },
      },
    ])).toBe('First line Second line');
  });

  it('returns null when no user text exists', () => {
    expect(deriveThreadTitleFromMessages([
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: '   ' },
    ])).toBeNull();
  });
});

describe('buildThreadDisplayTitles', () => {
  function makeThread(id: string, overrides: Partial<StorageThreadType> = {}): StorageThreadType {
    const now = new Date();
    return {
      id,
      title: null,
      resourceId: 'r',
      createdAt: now,
      updatedAt: now,
      metadata: null,
      ...overrides,
    } as StorageThreadType;
  }

  it('returns derived titles unchanged when there are no collisions', () => {
    const threads = [
      makeThread('t1'),
      makeThread('t2'),
    ];
    const derived = { t1: 'What is EPSDT?', t2: 'How do I apply for CAP/DA?' };
    const titles = buildThreadDisplayTitles(threads, derived);
    expect(titles.get('t1')).toBe('What is EPSDT?');
    expect(titles.get('t2')).toBe('How do I apply for CAP/DA?');
  });

  it('appends a date suffix when auto-derived titles collide', () => {
    const threads = [
      makeThread('t1', { updatedAt: new Date('2026-03-10T10:00:00Z') }),
      makeThread('t2', { updatedAt: new Date('2026-04-01T10:00:00Z') }),
      makeThread('t3', { updatedAt: new Date('2026-04-05T10:00:00Z') }),
    ];
    const derived = { t1: 'What is EPSDT?', t2: 'What is EPSDT?', t3: 'What is EPSDT?' };
    const titles = buildThreadDisplayTitles(threads, derived);
    // Each title must include a disambiguating suffix.
    for (const id of ['t1', 't2', 't3']) {
      expect(titles.get(id)!.startsWith('What is EPSDT? (')).toBe(true);
    }
    // And the three suffixes must be distinct.
    const unique = new Set([titles.get('t1'), titles.get('t2'), titles.get('t3')]);
    expect(unique.size).toBe(3);
  });

  it('never rewrites a user-set explicit title even if it collides', () => {
    const threads = [
      makeThread('t1', { title: 'Shared Title' }),
      makeThread('t2', { title: 'Shared Title' }),
    ];
    const titles = buildThreadDisplayTitles(threads, {});
    expect(titles.get('t1')).toBe('Shared Title');
    expect(titles.get('t2')).toBe('Shared Title');
  });

  it('falls back to "New conversation" when no title or derived label exists', () => {
    const threads = [makeThread('t1')];
    const titles = buildThreadDisplayTitles(threads, {});
    expect(titles.get('t1')).toBe('New conversation');
  });
});
