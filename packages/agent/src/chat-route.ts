import type { AgentExecutionOptions } from '@mastra/core/agent';
import { registerApiRoute } from '@mastra/core/server';
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { gateAnswerStream, trustedChatInput } from './answer-release.js';
import { getBoundUserId } from './auth-middleware.js';
import { extractText, findSensitiveIdentifiers } from './sensitive-data.js';
import type { UsageRepository } from './usage/repository.js';
import { AGENT_MODEL } from './model.js';
import { log, errorFields } from './logger.js';
import { Sentry } from './sentry.js';

type ChatFinishEvent = Parameters<NonNullable<AgentExecutionOptions['onFinish']>>[0];

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
      if (findSensitiveIdentifiers(extractText(body)).length) {
        return c.json({
          error: {
            code: 'client_identifier_detected',
            message: 'Remove client-identifying information before sending this question.',
          },
        }, 422);
      }
      const threadId = (body?.memory as { thread?: string } | undefined)?.thread;
  
      const onFinish = (event: ChatFinishEvent) => {
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
  
      const stream = await handleChatStream({
        mastra: c.get('mastra'),
        agentId: 'ncMedicaidAgent',
        version: 'v6',
        params: {
          // Only accept the newest user input; history comes from guarded memory.
          ...trustedChatInput(body, userId),
          // Middleware > body, mirroring chatRoute's priority order.
          requestContext: c.get('requestContext'),
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
            log.error('chat.stream_error', errorFields(err));
            Sentry.captureException(err, { tags: { route: 'chat' } });
          },
        },
      });
      return createUIMessageStreamResponse({ stream: gateAnswerStream(stream) });
    },
  });
}
