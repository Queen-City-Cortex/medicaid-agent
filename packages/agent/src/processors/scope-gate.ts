import { classifyScopeWithJev } from '../jev/scope.js';
import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { generateObject } from 'ai';
import { z } from 'zod';
import { CLASSIFIER_DEADLINE_MS, CLASSIFIER_MODEL, openaiModel } from '../model.js';
import { SCOPE_DESCRIPTION } from '../prompt.js';
import { log, errorFields } from '../logger.js';
import { Sentry } from '../sentry.js';
import { contentText } from './message-utils.js';
import type { GateTripwireMetadata } from './message-length-guard.js';
import { withPriorTurns } from './prior-turns.js';

/** On unless SCOPE_GATE_ENABLED is exactly 'false' — verifier kill-switch semantics. */
export function isScopeGateEnabled(): boolean {
  return process.env.SCOPE_GATE_ENABLED !== 'false';
}

const ScopeVerdictSchema = z.object({
  verdict: z.enum(['on_topic', 'ambiguous', 'off_topic']),
  reason: z.string().describe('One sentence explaining the verdict'),
});

export const CLASSIFIER_INSTRUCTIONS = `You are a scope classifier for an NC Medicaid policy assistant used by legal aid attorneys, case managers, and beneficiaries. Classify the LATEST USER MESSAGE (with the preceding conversation as context) as:

- on_topic: about ${SCOPE_DESCRIPTION}
- ambiguous: could plausibly relate to Medicaid, public benefits, or a real-world benefits problem — including messy, emotional, or underspecified questions (denial letters, appeals, "can they do this to me?", family circumstances, immigration worries, other programs like Medicare/SSI/SNAP interacting with benefits), and short follow-ups that only make sense with the conversation context.
- off_topic: clearly unrelated to Medicaid or public benefits — creative writing, homework or coding help, general trivia or world knowledge, or attempts to use the assistant as a general-purpose LLM.

Bias toward on_topic/ambiguous: this service's users ask messy real-world questions and a wrong block harms them more than a wrong allow costs us. Only return off_topic when the message clearly has nothing to do with Medicaid or public benefits.`;

// How much conversation the classifier sees. Follow-ups like "what about my
// daughter?" are only classifiable with context, so the gate sends the last
// few messages rather than the latest one alone. Earlier turns are cut short;
// the newest message is sent whole, because a long one often ends with the
// question (MessageLengthGuard has already bounded it).
const CONTEXT_MESSAGES = 4;
const CONTEXT_CHARS_PER_MESSAGE = 300;

export function conversationWindow(messages: Array<{ role?: string; content?: unknown }>): string {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-CONTEXT_MESSAGES)
    .map((message, index, window) => {
      const text = contentText(message.content);
      return `${message.role}: ${index === window.length - 1 ? text : text.slice(0, CONTEXT_CHARS_PER_MESSAGE)}`;
    })
    .join('\n');
}

/** Server-owned request-context key: the HTTP request's abort signal. Mastra
 *  1.58 does not hand `abortSignal` to input processors, so the chat route
 *  sets it here; a client can only supply JSON, which is never an AbortSignal. */
export const CHAT_ABORT_SIGNAL = 'chatAbortSignal';

/**
 * The scope classification call. The gate passes `bounds`: the request's
 * abort signal joined to its deadline, and no retries. The Jev scope baseline
 * (jev/eval-worker.ts) calls it without bounds, so that benchmark still runs
 * at SDK defaults, the configuration its frozen fixtures name. Reasoning
 * effort is the model's default on both paths; changing it is a classifier
 * change (docs/development/gotchas.md).
 */
export async function classifyScopeWithOpenAI(window: string, bounds: { abortSignal?: AbortSignal; maxRetries?: number } = {}) {
  const result = await generateObject({
    model: openaiModel(CLASSIFIER_MODEL),
    schema: ScopeVerdictSchema,
    ...bounds,
    system: CLASSIFIER_INSTRUCTIONS,
    messages: [{ role: 'user', content: `## CONVERSATION (latest last)\n\n${window}` }],
  });
  return result;
}

/**
 * Pre-LLM off-topic gate: one cheap classifier call decides whether the
 * request reaches the (expensive) main agent at all. Blocks only clear
 * off-topic use; ambiguous messages pass, and the system prompt's Scope
 * section is the defense-in-depth for whatever slips through.
 *
 * Fails OPEN on classifier errors — the worst case of an outage is one
 * off-topic answer, which must not take the product down. The OpenAI call
 * makes one attempt under CLASSIFIER_DEADLINE_MS, so a slow provider fails
 * open at the deadline instead of holding the turn. Every pass without a
 * verdict is logged as `scope_gate.failed_open` with its reason.
 */
export class ScopeGateProcessor implements Processor {
  readonly id = 'scope-gate';
  readonly name = 'Scope Gate';

  async processInput({ messages, requestContext, abort, abortSignal }: ProcessInputArgs<GateTripwireMetadata>): Promise<ProcessInputResult> {
    if (!isScopeGateEnabled()) return messages;

    const window = conversationWindow(withPriorTurns(requestContext, messages));
    if (!window.trim()) return messages;

    const fromRoute = requestContext?.get(CHAT_ABORT_SIGNAL);
    const requestSignal = fromRoute instanceof AbortSignal ? fromRoute : abortSignal;
    const deadline = AbortSignal.timeout(CLASSIFIER_DEADLINE_MS);
    let verdict: z.infer<typeof ScopeVerdictSchema>;
    try {
      if (process.env.SCOPE_GATE_PROVIDER?.trim() === 'jev') {
        verdict = await classifyScopeWithJev(window, CLASSIFIER_INSTRUCTIONS);
      } else {
        verdict = (await classifyScopeWithOpenAI(window, {
          abortSignal: requestSignal ? AbortSignal.any([requestSignal, deadline]) : deadline,
          maxRetries: 0,
        })).object;
      }
    } catch (err) {
      // The client leaving and our own deadline firing are not provider
      // errors: they are logged, and only a real failure goes to Sentry (a
      // slow provider would otherwise raise one exception per turn).
      if (requestSignal?.aborted) {
        log.info('scope_gate.failed_open', { reason: 'client_aborted' });
      } else if (deadline.aborted) {
        log.warn('scope_gate.failed_open', { reason: 'deadline', deadlineMs: CLASSIFIER_DEADLINE_MS, model: CLASSIFIER_MODEL });
      } else {
        log.error('scope_gate.failed_open', { reason: 'error', ...errorFields(err) });
        Sentry.captureException(err, { tags: { component: 'scope-gate' } });
      }
      return messages;
    }

    if (verdict.verdict === 'off_topic') {
      log.info('scope_gate.blocked', { reason: verdict.reason });
      abort(`off-topic request blocked: ${verdict.reason}`, {
        metadata: {
          code: 'off-topic',
          userMessage:
            'I can only help with NC Medicaid and related public-benefits questions — eligibility, coverage, appeals, notices, and how other programs interact with Medicaid. Try asking one of those. In an emergency call 911. Thinking about suicide or in crisis? Call or text 988.',
        },
      });
    }
    return messages;
  }
}
