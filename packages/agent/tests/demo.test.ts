import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS, runScenario } from '../scripts/demo/scenarios.js';
import { validateAnswerQuotes, validateAnswerUrls } from '../src/processors/verifier/answer-validation.js';

// The keyless demo claims to run the production release path. These tests
// keep each scenario ending the way its walkthrough says it does.
describe('keyless demo', () => {
  it.each(SCENARIOS.map(scenario => [scenario.id, scenario] as const))('%s ends as described', async (_id, scenario) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { run, modelCalls, shown } = await runScenario(scenario);
    expect(run.outcome.status).toBe(scenario.expected.status);
    expect(modelCalls).toBe(scenario.expected.modelCalls);
    if (scenario.expected.status === 'withheld') expect(shown).not.toContain(scenario.draft);
    else expect(shown).toBe(run.finalAnswer);
  });

  it('releases only text whose links and quotations match the sample corpus', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const scenario of SCENARIOS) {
      const { run } = await runScenario(scenario);
      if (run.outcome.status === 'withheld') continue;
      expect(validateAnswerUrls(run.finalAnswer, scenario.sources).unknownUrls).toEqual([]);
      expect(validateAnswerQuotes(run.finalAnswer, scenario.sources).unknownQuotes).toEqual([]);
    }
  });

  it('shows the made-up quotation being caught by code, not only by the model', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const scenario = SCENARIOS.find(s => s.id === 'corrected')!;
    const { run } = await runScenario(scenario);
    expect(run.telemetry.fabricated_quote_count).toBe(1);
  });
});
