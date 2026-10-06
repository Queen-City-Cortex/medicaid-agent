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
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
// classifyJev refuses a body over 30,000 UTF-8 bytes, and the gate fails open on
// a refusal. Stay under it with a margin so size is never a way through.
const JEV_BODY_BYTES = 29_000;

/** The window cut to fit one classifier request. A window that is too large
 *  keeps its first third (the earlier turns and the opening of the newest
 *  message) and its last two thirds (where the question usually is). */
export function fitScopeWindow(window: string, questions: Record<string, JevQuestion>): string {
  const room = JEV_BODY_BYTES - bytes({ model: JEV_MODEL, state: '', questions });
  if (bytes(window) - 2 <= room) return window;
  const points = Array.from(window);
  const cut = (kept: number) => {
    const head = Math.floor(kept / 3);
    return `${points.slice(0, head).join('')}\n[…]\n${points.slice(points.length - (kept - head)).join('')}`;
  };
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bytes(cut(middle)) - 2 <= room) low = middle; else high = middle - 1;
  }
  return cut(low);
}
export async function classifyScopeWithJev(window: string, instructions: string): Promise<{ verdict: 'off_topic' | 'ambiguous'; reason: string }> {
  const questions = scopeQuestions(instructions);
  const started = performance.now();
  try {
    const result = await classifyJev(fitScopeWindow(window, questions), questions, { apiKey: process.env.TYPESAFE_API_KEY, timeoutMs: 500 });
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
