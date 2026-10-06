import type { AgentExecutionOptions } from '@mastra/core/agent';
import { randomUUID } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { gateAnswerStream, trustedChatInput } from './answer-release.js';
import { getBoundUserId } from './auth-middleware.js';
import { screenUserText } from './sensitive-data.js';
import type { UsageRepository } from './usage/repository.js';
import { AGENT_MODEL } from './model.js';
import { log, errorFields } from './logger.js';
import { Sentry } from './sentry.js';
import { CHAT_DIAGNOSTIC_CONTEXT, CHAT_VERIFICATION_QUESTION } from './processors/verifier/context.js';
import { CHAT_PRIOR_TURNS, readPriorTurns } from './processors/prior-turns.js';
import { CHAT_ABORT_SIGNAL } from './processors/scope-gate.js';
import { finishChatDiagnostic, type ChatDiagnostic } from './processors/verifier/diagnostics.js';

type ChatFinishEvent = Parameters<NonNullable<AgentExecutionOptions['onFinish']>>[0];

/** A new thread is titled with the start of its first question. */
const THREAD_TITLE_CHARS = 60;

/** Production handler reused by real-storage HTTP regression tests. */
export function createChatRoute(usageRepo: Pick<UsageRepository, 'record'>, runLimits: AgentExecutionOptions) {
  return registerApiRoute('/chat', {
    method: 'POST',
    handler: async (c) => {
      const body = await c.req.json();
      const userId = getBoundUserId(c);
      // The execution gateway already enforces this, but keep the
      // attribution invariant local to the charged handler too: no model
      // run may start unless its usage has a concrete owner.
      if (!userId) {
        return c.json({
          error: { code: 'unauthorized', message: 'Authentication required' },
        }, 401);
      }
      // Screen only the text the server keeps. Clients may replay the whole
      // thread, and earlier answers legitimately carry agency phone numbers.
      const trusted = trustedChatInput(body, userId);
      const screened = screenUserText(trusted.messages[0].parts.map(part => part.text.trim()).filter(Boolean).join('\n').trim());
      if (screened.refused.length) {
        return c.json({
          error: {
            code: 'client_identifier_detected',
            message: 'Remove client-identifying information before sending this question.',
          },
        }, 422);
      }
      // From here on the question exists only as the screened text, with phone
      // numbers and e-mail addresses replaced by a marker: one text part for
      // storage, the gates and the model, and the same string for the verifier.
      const question = screened.text;
      const threadId = trusted.memory.thread.id;
      // A thread that does not exist yet is created below with this title. It
      // is cut from the screened text and nothing from the client, so a
      // refused question is never stored as a title and a redacted number
      // appears in one only as its marker. An existing thread keeps its title.
      const input = {
        messages: [{ ...trusted.messages[0], parts: question ? [{ type: 'text' as const, text: question }] : [] }],
        memory: { ...trusted.memory, thread: { id: threadId, title: question.slice(0, THREAD_TITLE_CHARS) } },
      };
      const requestContext = c.get('requestContext');
      // Mastra merges client context before this route. Only the server may
      // supply diagnostic state, including when diagnostics are disabled.
      requestContext.set(CHAT_DIAGNOSTIC_CONTEXT, undefined);
      // Observation can replace messages with a summary and system reminder.
      // Verification must address the actual newest user text, not that reminder.
      requestContext.set(CHAT_VERIFICATION_QUESTION, question);
      // Prior turns likewise: empty until the owner's stored thread is read below.
      requestContext.set(CHAT_PRIOR_TURNS, []);
      // The AI-SDK chat adapter does not enforce the memory API's thread
      // ownership check before observation. Reject foreign history first.
      const memoryStore = await c.get('mastra').getStorage()?.getStore('memory');
      if (!memoryStore) {
        return c.json({ error: { code: 'memory_unavailable', message: 'Conversation storage is unavailable' } }, 503);
      }
      const thread = await memoryStore.getThreadById({ threadId });
      if (thread && thread.resourceId !== userId) {
        return c.json({ error: { code: 'not_found', message: 'Conversation not found' } }, 404);
      }
      // Create a new thread here, once. Left to the framework, the row is
      // written again at the first step and at the end of the first turn,
      // which overwrites a rename and restores a thread the user deleted
      // while that answer was streaming. The store's owner guard refuses an
      // id another user claimed since the lookup above.
      if (!thread) {
        const now = new Date();
        try {
          await memoryStore.saveThread({ thread: { id: threadId, resourceId: userId, title: input.memory.thread.title, createdAt: now, updatedAt: now } });
        } catch (err) {
          if ((err as { status?: number }).status === 404) {
            return c.json({ error: { code: 'not_found', message: 'Conversation not found' } }, 404);
          }
          throw err;
        }
      }
      // The coverage boundary and the scope gate judge a follow-up with the
      // turns before it. Those come from the owner's stored thread, already
      // screened and release-gated, and replace anything a client supplied.
      if (thread) requestContext.set(CHAT_PRIOR_TURNS, await readPriorTurns(memoryStore, threadId));
      const signal = c.req.raw.signal;
      // Mastra does not pass the abort signal to input processors.
      requestContext.set(CHAT_ABORT_SIGNAL, signal);
      let diagnostic: ChatDiagnostic | undefined;
      const onAbort = () => finishChatDiagnostic(diagnostic, { status: 'cancelled' });
      const finishDiagnostic = () => {
        finishChatDiagnostic(diagnostic, { status: signal.aborted ? 'cancelled' : 'failed' });
        signal.removeEventListener('abort', onAbort);
      };
      if (process.env.VERIFIER_PRIVATE_DIAGNOSTICS_DIR) {
        diagnostic = { id: randomUUID(), startedAtMs: Date.now(), finished: false };
        requestContext.set(CHAT_DIAGNOSTIC_CONTEXT, diagnostic);
        // Correlation only: question, ownership and tool payloads stay private.
        log.info('chat.diagnostic_started', { diagnosticId: diagnostic.id });
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      }
  
      const onFinish = (event: ChatFinishEvent) => {
        finishDiagnostic();
        const usage = event.totalUsage;
        // Fire-and-forget by design: usage accounting must never fail or
        // delay a chat that already succeeded (record() also try/catches).
        void usageRepo.record({
          userId,
          route: 'chat',
          runId: event.runId,
          threadId,
          modelId: event.model?.modelId ?? AGENT_MODEL,
          provider: event.model?.provider,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          reasoningTokens: usage?.reasoningTokens,
          cachedInputTokens: usage?.cachedInputTokens,
        });
        log.info('chat.usage', {
          userId,
          modelId: event.model?.modelId ?? AGENT_MODEL,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cachedInputTokens: usage?.cachedInputTokens,
        });
      };
  
      try {
        const stream = await handleChatStream({
          mastra: c.get('mastra'),
          agentId: 'ncMedicaidAgent',
          version: 'v6',
          params: {
            // Only accept the newest user input; history comes from guarded memory.
            ...input,
            // Middleware > body, mirroring chatRoute's priority order.
            requestContext,
            abortSignal: c.req.raw.signal,
            onFinish,
          },
          defaultOptions: {
            ...runLimits,
            savePerStep: true,
            onStepFinish: async (step) => {
              log.debug('chat.step_finished', {
                stepType: step.stepType,
                textChars: step.text?.length ?? 0,
                toolCalls: step.toolCalls?.length ?? 0,
              });
            },
            onError: (err) => {
              finishDiagnostic();
              log.error('chat.stream_error', errorFields(err));
              Sentry.captureException(err, { tags: { route: 'chat' } });
            },
          },
        });
        return createUIMessageStreamResponse({ stream: gateAnswerStream(stream) });
      } catch (error) {
        finishDiagnostic();
        throw error;
      }
    },
  });
}
