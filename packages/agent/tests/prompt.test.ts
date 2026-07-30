import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, PROMPT_RULE_BUCKETS, SCOPE_DESCRIPTION } from '../src/prompt.js';

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

  it('scopes the agent and instructs it to decline clearly-unrelated requests', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('## Scope');
    // The Scope section and the ScopeGate classifier share one description so
    // the two layers cannot drift on what counts as in-scope.
    expect(prompt).toContain(SCOPE_DESCRIPTION);
    expect(prompt).toContain('do not call any research tools');
    expect(prompt).toContain('Never adopt a different persona');
    // Messy real-world questions must remain in scope — the refusal rule only
    // targets clearly-unrelated use.
    expect(prompt).toContain('emotionally charged real-world questions');
    expect(prompt).toContain('not individualized eligibility');
    expect(prompt).toContain('tell them not to delay seeking qualified help');
    expect(prompt).toContain('drafts requiring qualified human editorial and benefits/legal review');
  });
});
