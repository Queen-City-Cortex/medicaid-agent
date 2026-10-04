import { classifyJev, JEV_MODEL, JevError, type JevQuestion } from '@nc-medicaid/policy-corpus';
import { log } from '../logger.js';
export function scopeQuestions(instructions: string): Record<string, JevQuestion> {
  return { scope: {
    type: 'choice', instructions,
    criteria: {
      on_topic: 'The latest message concerns NC Medicaid or related public benefits, including interactions with other programs.',
      ambiguous: 'Could plausibly relate to benefits, including messy problems, emotional concerns, multilingual questions, or contextual follow-ups. Allow uncertainty.',
      off_topic: 'Clearly unrelated to Medicaid or public benefits. Only select this when no plausible connection exists.',
    },
  } };
}
export async function classifyScopeWithJev(window: string, instructions: string): Promise<{ verdict: 'off_topic' | 'ambiguous'; reason: string }> {
  const questions = scopeQuestions(instructions);
  const started = performance.now();
  try {
    const result = await classifyJev(window, questions, { apiKey: process.env.TYPESAFE_API_KEY, timeoutMs: 500 });
    const answer = result.answers.scope;
    if (answer.type !== 'choice') throw new JevError('response');
    log.info('scope_gate.jev', { model: JEV_MODEL, probabilities: answer.probabilities, usage: result.usage, latencyMs: performance.now() - started, fallback: false });
    return { verdict: answer.choice === 'off_topic' && answer.probabilities.off_topic >= 0.95 ? 'off_topic' : 'ambiguous', reason: 'jev_scope_off_topic' };
  } catch (error) {
    // Fixed codes only: never log request/response text or transport exceptions.
    log.info('scope_gate.jev', { model: JEV_MODEL, latencyMs: performance.now() - started, fallback: true, code: error instanceof JevError ? error.code : 'network' });
    return { verdict: 'ambiguous', reason: 'jev_scope_failed_open' };
  }
}
