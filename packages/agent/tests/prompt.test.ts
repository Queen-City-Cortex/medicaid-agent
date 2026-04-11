import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, PROMPT_RULE_BUCKETS } from '../src/prompt.js';

describe('buildSystemPrompt', () => {
  it('keeps only evergreen and workflow guidance in the prompt surface', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('resolveAnswerFrame');
    expect(prompt).toContain('## Evergreen rules');
    expect(prompt).toContain('## Workflow rules');
    expect(prompt).toContain('Start the user-facing answer with the conclusion');
    expect(prompt).not.toContain('After every batch of tool calls');
    expect(prompt).not.toContain('call resolveAnswerFrame early');
    expect(prompt).not.toContain('For telehealth questions');
    expect(prompt).not.toContain('For MLR questions');
    expect(prompt).not.toContain('For outpatient therapy/EPSDT questions under Policy 10A');
    expect(prompt).not.toContain('For pharmacy prior-authorization questions');
  });

  it('exposes the audited prompt buckets for regression tests', () => {
    expect(PROMPT_RULE_BUCKETS.evergreen.length).toBeGreaterThan(0);
    expect(PROMPT_RULE_BUCKETS.workflow.length).toBeGreaterThan(0);
  });
});
