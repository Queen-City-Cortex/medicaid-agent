import { describe, it, expect, vi, afterEach } from 'vitest';
import { UNVERIFIED_HISTORY, VERIFICATION_PART, WITHHELD_ANSWER } from '@nc-medicaid/contracts';
import { coalesceThreadMessages } from '../../src/lib/parse-message';
import {
  buildThreadDisplayTitles,
  buildThreadMarkdown,
  deriveThreadTitleFromMessages,
  deriveThreadTitleFromText,
  formatDate,
  getThreadDisplayTitle,
  getThreadTitle,
} from '../../src/lib/thread-helpers';
import type { Thread } from '../../src/lib/thread-helpers';

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

  it('returns Yesterday for yesterday evening even when less than 24h ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T08:00:00'));

    // Only 10 hours ago, but a different calendar day — must NOT render as a
    // bare time, which would imply "today".
    expect(formatDate('2026-03-29T22:00:00')).toBe('Yesterday');
  });

  it('returns a weekday for the day before yesterday even when barely over 24h ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T01:00:00'));

    // 27 hours ago: the old 24h-window logic bucketed this as "Yesterday",
    // but it is two calendar days back.
    expect(formatDate('2026-03-28T22:00:00')).toMatch(/^[A-Z][a-z]{2}/);
    expect(formatDate('2026-03-28T22:00:00')).not.toBe('Yesterday');
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
  function asThread(thread: Partial<Thread>): Thread {
    return thread as Thread;
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
  function asThread(thread: Partial<Thread>): Thread {
    return thread as Thread;
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
  function makeThread(id: string, overrides: Partial<Thread> = {}): Thread {
    const now = new Date().toISOString();
    return {
      id,
      title: null,
      resourceId: 'r',
      createdAt: now,
      updatedAt: now,
      metadata: null,
      ...overrides,
    } as Thread;
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
      makeThread('t1', { updatedAt: '2026-03-10T10:00:00Z' }),
      makeThread('t2', { updatedAt: '2026-04-01T10:00:00Z' }),
      makeThread('t3', { updatedAt: '2026-04-05T10:00:00Z' }),
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

describe('buildThreadMarkdown', () => {
  const POLICY_1F = 'https://medicaid.ncdhhs.gov/1f/download';
  const POLICY_3A = 'https://medicaid.ncdhhs.gov/3a/download';
  const DRAFT = 'DRAFT: coverage is unlimited.';
  const verification = (status: string) => ({ type: VERIFICATION_PART, data: { status, passCount: 1 } });
  const search = (id: string, sections: unknown[]) => ({
    type: 'tool-invocation',
    toolInvocation: { toolCallId: id, toolName: 'searchSections', state: 'result', args: {}, result: { sections } },
  });
  const section = (policyNumber: string, sectionNumber: string, url: string) =>
    ({ id: `${policyNumber}-${sectionNumber}`, title: 'Section', sectionNumber, policyNumber, url });
  const row = (id: string, role: string, minute: number, parts: unknown[]) => ({
    id,
    role,
    // Midday UTC, so the date reads the same in every time zone.
    createdAt: `2026-06-22T12:${String(minute).padStart(2, '0')}:00Z`,
    content: { format: 2, parts },
  });

  // Stored the way the agent stores turns: the answer row is written before
  // the tool-call row that holds its sources.
  const stored = [
    row('u1', 'user', 0, [{ type: 'text', text: 'Is chiropractic care covered?' }]),
    row('a1', 'assistant', 1, [
      { type: 'text', text: `Yes, up to 8 visits a year [Policy 1F § 5.6](${POLICY_1F}). See the [provider portal](https://example.org/portal).` },
      verification('passed'),
    ]),
    row('t1', 'assistant', 2, [search('c1', [section('3A', '2.1', POLICY_3A), section('1F', '5.6', POLICY_1F)])]),

    row('u2', 'user', 10, [{ type: 'text', text: 'Is prior approval needed?' }]),
    row('t2', 'assistant', 11, [search('c2', [section('1F', '5.6', POLICY_1F)])]),
    row('a2', 'assistant', 12, [
      { type: 'text', text: `Not for the first visits [Policy 1F § 5.6](${POLICY_1F}).` },
      verification('corrected'),
    ]),

    row('u3', 'user', 20, [{ type: 'text', text: 'Are home visits covered?' }]),
    row('t3', 'assistant', 21, [search('c3', [section('1F', '5.6', POLICY_1F)])]),
    row('a3', 'assistant', 22, [{ type: 'text', text: DRAFT }, verification('withheld')]),

    // A row with no verification record: stored before answers were checked.
    row('u4', 'user', 30, [{ type: 'text', text: 'What about acupuncture?' }]),
    row('a4', 'assistant', 31, [{ type: 'text', text: `${DRAFT} Second draft.` }]),
  ];

  const markdown = buildThreadMarkdown({
    title: 'Chiropractic coverage',
    exportedAt: new Date('2026-06-23T12:00:00Z'),
    messages: coalesceThreadMessages(stored),
  });
  /** The export from one question up to the next. */
  const turn = (question: string) => {
    const from = markdown.indexOf(question);
    const next = markdown.indexOf('## Question', from);
    return markdown.slice(from, next === -1 ? undefined : next);
  };

  it('keeps each citation link, numbers it, and lists the sources under the same numbers', () => {
    const cited = turn('Is chiropractic care covered?');

    expect(cited).toContain('## Answer');
    // The cited section is source 1 although the search returned it second.
    expect(cited).toContain(`[Policy 1F § 5.6](${POLICY_1F}) [1]`);
    expect(cited).toContain(`1. [Policy 1F § 5.6](${POLICY_1F})`);
    expect(cited).toContain(`2. [Policy 3A § 2.1](${POLICY_3A})`);
    expect(cited.indexOf('**Sources**')).toBeLessThan(cited.indexOf('Also consulted'));
    expect(cited.indexOf('Also consulted')).toBeLessThan(cited.indexOf('2. [Policy 3A'));
  });

  it('keeps the URL of a link that matches no source, without a number', () => {
    const cited = turn('Is chiropractic care covered?');

    expect(cited).toContain('[provider portal](https://example.org/portal).');
    expect(cited).not.toContain('[provider portal](https://example.org/portal) [');
  });

  it('states how each answer was verified, and when', () => {
    expect(turn('Is chiropractic care covered?')).toContain('*Verified against cited sources · June 22, 2026');
    expect(turn('Is prior approval needed?')).toContain('*Corrected and verified against cited sources · June 22, 2026');
  });

  it('exports a withheld answer as its notice, with no answer heading, draft text or sources', () => {
    const withheld = turn('Are home visits covered?');

    expect(withheld).toContain('## Answer withheld');
    expect(withheld).toContain(WITHHELD_ANSWER);
    expect(withheld).toContain('*Withheld: not verified · June 22, 2026');
    expect(withheld).not.toMatch(/^## Answer$/m);
    expect(withheld).not.toContain('Sources');
    expect(withheld).not.toContain(POLICY_1F);
  });

  it('exports an unverified stored row as its notice', () => {
    const unverified = turn('What about acupuncture?');

    expect(unverified).toContain('## Answer withheld');
    expect(unverified).toContain(UNVERIFIED_HISTORY);
    expect(unverified).not.toMatch(/^## Answer$/m);
  });

  it('never writes draft text', () => {
    expect(markdown).not.toContain('DRAFT');
    expect(markdown.match(/^## Answer$/gm)).toHaveLength(2);
    expect(markdown.match(/^## Answer withheld$/gm)).toHaveLength(2);
  });

  it('says so when a turn ended without an answer', () => {
    const unfinished = buildThreadMarkdown({
      title: 'Unfinished',
      exportedAt: new Date('2026-06-23T12:00:00Z'),
      messages: coalesceThreadMessages([
        row('u1', 'user', 0, [{ type: 'text', text: 'Is dental covered?' }]),
        row('t1', 'assistant', 1, [search('c1', [section('1F', '5.6', POLICY_1F)])]),
      ]),
    });

    expect(unfinished).toContain('## No answer');
    expect(unfinished).toContain('This answer ended before it was finished.');
    expect(unfinished).not.toMatch(/^## Answer$/m);
  });
});
