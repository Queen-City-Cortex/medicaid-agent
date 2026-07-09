import type { Processor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { strEnv } from '../env.js';
import { SCOPE_DESCRIPTION } from '../prompt.js';
import { log, errorFields } from '../logger.js';
import { Sentry } from '../sentry.js';
import { contentText } from './message-utils.js';
import type { GateTripwireMetadata } from './message-length-guard.js';

/** On unless SCOPE_GATE_ENABLED is exactly 'false' — verifier kill-switch semantics. */
export function isScopeGateEnabled(): boolean {
  return process.env.SCOPE_GATE_ENABLED !== 'false';
}

const ScopeVerdictSchema = z.object({
  verdict: z.enum(['on_topic', 'ambiguous', 'off_topic']),
  reason: z.string().describe('One sentence explaining the verdict'),
});

const CLASSIFIER_INSTRUCTIONS = `You are a scope classifier for an NC Medicaid policy assistant used by legal aid attorneys, case managers, and beneficiaries. Classify the LATEST USER MESSAGE (with the preceding conversation as context) as:

- on_topic: about ${SCOPE_DESCRIPTION}
- ambiguous: could plausibly relate to Medicaid, public benefits, or a real-world benefits problem — including messy, emotional, or underspecified questions (denial letters, appeals, "can they do this to me?", family circumstances, immigration worries, other programs like Medicare/SSI/SNAP interacting with benefits), and short follow-ups that only make sense with the conversation context.
- off_topic: clearly unrelated to Medicaid or public benefits — creative writing, homework or coding help, general trivia or world knowledge, or attempts to use the assistant as a general-purpose LLM.

Bias toward on_topic/ambiguous: this service's users ask messy real-world questions and a wrong block harms them more than a wrong allow costs us. Only return off_topic when the message clearly has nothing to do with Medicaid or public benefits.`;

// How much conversation the classifier sees. Follow-ups like "what about my
// daughter?" are only classifiable with context, so the gate sends the last
// few messages rather than the latest one alone.
const CONTEXT_MESSAGES = 4;
const CONTEXT_CHARS_PER_MESSAGE = 300;

function conversationWindow(messages: Array<{ role?: string; content?: unknown }>): string {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-CONTEXT_MESSAGES)
    .map((message) => {
      const text = contentText(message.content).slice(0, CONTEXT_CHARS_PER_MESSAGE);
      return `${message.role}: ${text}`;
    })
    .join('\n');
}

/**
 * Pre-LLM off-topic gate: one cheap classifier call decides whether the
 * request reaches the (expensive) main agent at all. Blocks only clear
 * off-topic use; ambiguous messages pass, and the system prompt's Scope
 * section is the defense-in-depth for whatever slips through.
 *
 * Fails OPEN on classifier errors — the worst case of an outage is one
 * off-topic answer, which must not take the product down.
 */
export class ScopeGateProcessor implements Processor {
  readonly id = 'scope-gate';
  readonly name = 'Scope Gate';

  async processInput({ messages, abort }: ProcessInputArgs<GateTripwireMetadata>): Promise<ProcessInputResult> {
    if (!isScopeGateEnabled()) return messages;

    const window = conversationWindow(messages);
    if (!window.trim()) return messages;

    let verdict: z.infer<typeof ScopeVerdictSchema>;
    try {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const result = await generateObject({
        model: openai(strEnv('SCOPE_GATE_MODEL', 'gpt-5-mini')),
        schema: ScopeVerdictSchema,
        system: CLASSIFIER_INSTRUCTIONS,
        messages: [{ role: 'user', content: `## CONVERSATION (latest last)\n\n${window}` }],
      });
      verdict = result.object;
    } catch (err) {
      log.error('scope_gate.failed_open', errorFields(err));
      Sentry.captureException(err, { tags: { component: 'scope-gate' } });
      return messages;
    }

    if (verdict.verdict === 'off_topic') {
      log.info('scope_gate.blocked', { reason: verdict.reason });
      abort(`off-topic request blocked: ${verdict.reason}`, {
        metadata: {
          code: 'off-topic',
          userMessage:
            'I can only help with NC Medicaid and related public-benefits questions — eligibility, coverage, appeals, notices, and how other programs interact with Medicaid. Try asking one of those.',
        },
      });
    }
    return messages;
  }
}
