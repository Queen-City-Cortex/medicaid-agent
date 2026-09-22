import { describe, expect, it } from 'vitest';
import { extractSources, extractSourcesFromToolResults } from '../../src/processors/verifier/evidence.js';
import { validateAnswerQuotes } from '../../src/processors/verifier/answer-validation.js';
import { makeFrame, makeSection } from '../helpers/answer-frame-fixtures.js';

const section = makeSection({ id: 'income', content: 'The enrollment fee is $50 per certification period.',
  url: 'https://example.gov/policy', citationLink: '[Income](https://example.gov/policy)',
  reason: 'Routing advice must not become source text.' });
const frame = makeFrame({ primarySections: [section], supportingSections: [section] });
const tool = { toolName: 'resolveAnswerFrame', toolCallId: 'frame', result: { frame } };

describe('retrieved sections inside answer frames', () => {
  it.each(['CLI', 'chat'])('separates corpus evidence from routing advice for %s', path => {
    const sources = path === 'CLI' ? extractSourcesFromToolResults([tool]) : extractSources([{ content: {
      parts: [{ type: 'tool-invocation', toolInvocation: { ...tool, state: 'result' } }],
    } }]);
    const routing = sources.filter(s => s.toolName === 'resolveAnswerFrame');
    const evidence = sources.filter(s => s.toolName === 'resolveAnswerFrame:section');
    expect(routing).toHaveLength(1);
    expect(routing[0].text).not.toContain(section.content);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].key).toBe(section.id);
    expect(evidence[0].text).toContain(section.content);
    expect(evidence[0].text).not.toContain(section.reason);
    expect(evidence[0].link).toBe(section.url);
    expect(validateAnswerQuotes(`"${section.content}"`, evidence).unknownQuotes).toEqual([]);
  });
});
