import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  buildAnswerClipboardText,
  extractCitedUrls,
  extractMessageSources,
  splitSourcesByCited,
  type MessageSource,
} from '../../src/lib/message-parts';

function source(overrides: Partial<MessageSource>): MessageSource {
  return {
    key: 'k',
    label: 'Policy 8C § 3.2.1',
    title: null,
    url: 'https://example.com/8c',
    originTool: 'getSection',
    sectionNumber: '3.2.1',
    snippet: null,
    ...overrides,
  };
}

function assistantMessage(parts: unknown[]): UIMessage {
  return { id: 'm1', role: 'assistant', parts } as unknown as UIMessage;
}

describe('source snippets', () => {
  it('captures an excerpt from getSection content', () => {
    const msg = assistantMessage([
      {
        type: 'tool-getSection',
        toolCallId: 'c1',
        state: 'output-available',
        input: {},
        output: {
          section: {
            id: 's1',
            title: 'Coverage',
            sectionNumber: '3.2.1',
            policyNumber: '8C',
            url: 'https://example.com/8c',
            content: 'Therapeutic leave is covered for up to 60 days per calendar year when the beneficiary…',
          },
        },
      },
    ]);

    const sources = extractMessageSources(msg);
    expect(sources).toHaveLength(1);
    expect(sources[0].snippet).toContain('Therapeutic leave is covered');
  });

  it('upgrades a snippetless search hit when getSection later reads the same section', () => {
    const section = {
      id: 's1',
      title: 'Coverage',
      sectionNumber: '3.2.1',
      policyNumber: '8C',
      url: 'https://example.com/8c',
    };
    const msg = assistantMessage([
      {
        type: 'tool-searchSections',
        toolCallId: 'c1',
        state: 'output-available',
        input: {},
        output: { sections: [section] },
      },
      {
        type: 'tool-getSection',
        toolCallId: 'c2',
        state: 'output-available',
        input: {},
        output: { section: { ...section, content: 'Full section text here.' } },
      },
    ]);

    const sources = extractMessageSources(msg);
    expect(sources).toHaveLength(1);
    expect(sources[0].snippet).toBe('Full section text here.');
  });

  it('truncates long content to a word boundary with an ellipsis', () => {
    const long = `${'policy '.repeat(80)}end`;
    const msg = assistantMessage([
      {
        type: 'tool-getSection',
        toolCallId: 'c1',
        state: 'output-available',
        input: {},
        output: {
          section: {
            id: 's1',
            title: 'T',
            sectionNumber: '1.0',
            policyNumber: '8C',
            url: 'https://example.com/8c',
            content: long,
          },
        },
      },
    ]);
    const [src] = extractMessageSources(msg);
    expect(src.snippet!.length).toBeLessThanOrEqual(301);
    expect(src.snippet!.endsWith('…')).toBe(true);
  });
});

describe('cited vs consulted split', () => {
  it('extracts normalized cited urls from answer markdown links', () => {
    const msg = assistantMessage([
      { type: 'text', text: 'Covered [Policy 8C § 3.2.1](https://Example.com/8c/?attachment) per policy.' },
    ]);
    const cited = extractCitedUrls(msg);
    expect(cited.has('https://example.com/8c')).toBe(true);
  });

  it('orders cited sources first and reports the split point', () => {
    const a = source({ key: 'a', url: 'https://example.com/uncited', label: 'Policy 1A § 1.0', sectionNumber: '1.0' });
    const b = source({ key: 'b', url: 'https://example.com/8c' });
    const { ordered, citedCount } = splitSourcesByCited([a, b], new Set(['https://example.com/8c']));
    expect(ordered.map((s) => s.key)).toEqual(['b', 'a']);
    expect(citedCount).toBe(1);
  });
});

describe('buildAnswerClipboardText', () => {
  it('replaces markdown citations with footnote refs and appends a source list', () => {
    const sources = [
      source({ key: 'a', url: 'https://example.com/8c', label: 'Policy 8C § 3.2.1' }),
      source({ key: 'b', url: 'https://example.com/1a', label: 'Policy 1A § 2.0', sectionNumber: '2.0' }),
    ];
    const text = buildAnswerClipboardText(
      'Covered per [Policy 8C § 3.2.1](https://example.com/8c).',
      sources,
    );
    expect(text).toContain('Covered per Policy 8C § 3.2.1 [1].');
    expect(text).toContain('Sources:');
    expect(text).toContain('[1] Policy 8C § 3.2.1 — https://example.com/8c');
    expect(text).toContain('[2] Policy 1A § 2.0 — https://example.com/1a');
    expect(text).not.toContain('](https');
  });

  it('returns the body unchanged when there are no sources', () => {
    expect(buildAnswerClipboardText('Plain answer.', [])).toBe('Plain answer.');
  });
});
