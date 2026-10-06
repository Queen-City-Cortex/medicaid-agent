import type { Processor, ProcessOutputStepArgs, ProcessToolResultArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';
import { VERIFICATION_PART } from '@nc-medicaid/contracts';
import { releaseMessage } from '../../answer-release.js';
import { extractSources, extractSourcesFromToolResults, type SourceEntry, type ToolResultRecord } from './evidence.js';
import { emitVerifierTelemetry, runVerificationForAnswer } from './run.js';
import { createPrivateVerificationCapture, finishChatDiagnostic, type ChatDiagnostic } from './diagnostics.js';
import { CHAT_DIAGNOSTIC_CONTEXT, CHAT_VERIFICATION_QUESTION, earlierUserTurns } from './context.js';
import { COVERAGE_VERIFICATION_QUERY } from '../coverage-boundary.js';
import { getConfig } from './config.js';
import { AGENT_MODEL } from '../../model.js';
import { log } from '../../logger.js';
import type { UsageRepository } from '../../usage/repository.js';
import type { AnswerAuditRepository, VerifierCallUsage } from '../../storage/answer-audit.js';

// ── Processor Class ─────────────────────────────────────────────────────────

function extractTextFromMessage(message: MastraDBMessage): string {
  const content = (message as any).content;
  if (typeof content === 'string') return content.trim();

  const parts = content?.parts ?? [];
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractLatestUserQuestion(messages: MastraDBMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'user') continue;

    const text = extractTextFromMessage(message);
    if (text) return text;
  }
  return '';
}

/** Preserve distinct retrieved bodies while avoiding repeated message/hook copies. */
function mergeSources(sources: SourceEntry[]): SourceEntry[] {
  return [...new Map(sources.map(source => [JSON.stringify(source), source])).values()];
}

const FRAME_TOOL = 'resolveAnswerFrame';

function frameQuery(args: unknown): string[] {
  const query = (args as { query?: unknown } | null | undefined)?.query;
  return typeof query === 'string' && query.trim() ? [query] : [];
}

/** The queries of this turn's frame calls as the message list recorded them. */
function frameQueriesFromMessages(messages: MastraDBMessage[]): string[] {
  const lastUser = messages.reduce((last, m, i) => m.role === 'user' ? i : last, -1);
  return messages.slice(lastUser + 1).flatMap(message => ((message as any).content?.parts ?? []) as any[])
    .filter(part => part?.type === 'tool-invocation' && part.toolInvocation?.toolName === FRAME_TOOL)
    .flatMap(part => frameQuery(part.toolInvocation.args));
}

/** Drop interim narration. Reasoning stays so the provider can replay it inline
 *  on the next step (storage is off, so nothing else carries it), except in a
 *  step whose narration is removed: there the reasoning item would be sent
 *  without the output item that followed it. */
function withoutInterimText<T extends { type: string }>(parts: T[]): T[] {
  const kept: T[] = [];
  let step: T[] = [];
  const flush = () => {
    const narrated = step.some(p => p.type === 'text');
    kept.push(...step.filter(p => p.type !== 'text' && !(narrated && p.type === 'reasoning')));
    step = [];
  };
  for (const part of parts) {
    if (part.type === 'step-start') flush();
    step.push(part);
  }
  flush();
  return kept;
}

/** The token counts of one verifier call, by name: nothing else a provider reports is kept. */
function callUsage(usage: unknown): VerifierCallUsage {
  const counts = (usage ?? {}) as Record<string, unknown>;
  return Object.fromEntries((['inputTokens', 'outputTokens', 'totalTokens', 'reasoningTokens', 'cachedInputTokens'] as const)
    .filter(name => typeof counts[name] === 'number').map(name => [name, counts[name]]));
}

export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  /** Where a chat turn's verifier cost and verification record go. Both are
   *  optional and written without being awaited: neither can delay or fail a release. */
  constructor(private readonly stores: {
    usage?: Pick<UsageRepository, 'record'>;
    audit?: Pick<AnswerAuditRepository, 'record'>;
  } = {}) {}

  processToolResult({ toolName, toolCallId, result, args, providerExecuted, state }: ProcessToolResultArgs): void {
    // Observation may compact tool messages before final synthesis. Preserve
    // actual corpus results in request-local processor state, never a summary.
    if (providerExecuted) return;
    // The frame call's query is the question in English: the coverage scope is
    // resolved from it at release as well as from the user's own text.
    if (toolName === FRAME_TOOL) {
      state.verificationFrameQueries = [...((state.verificationFrameQueries as string[] | undefined) ?? []), ...frameQuery(args)];
    }
    const toolResult = { toolName, toolCallId, result, args };
    state.verificationSources = mergeSources([
      ...((state.verificationSources as SourceEntry[] | undefined) ?? []),
      ...extractSourcesFromToolResults([toolResult]),
    ]);
    if (process.env.VERIFIER_PRIVATE_DIAGNOSTICS_DIR) {
      const toolResults = (state.verificationToolResults as ToolResultRecord[] | undefined) ?? [];
      toolResults.push(toolResult);
      state.verificationToolResults = toolResults;
    }
  }

  async processOutputStep({ text, finishReason, toolCalls, messages, steps, writer, abortSignal, requestContext, state = {} }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    if (finishReason !== 'stop' || toolCalls?.length || !text) {
      // Interim narration must not enter memory or future model context.
      const lastUser = messages.reduce((last, m, i) => m.role === 'user' ? i : last, -1);
      return messages.map((m, i) => i > lastUser && m.role === 'assistant'
        ? { ...m, content: { ...m.content, parts: withoutInterimText(m.content.parts) } }
        : m);
    }
    const diagnostic = requestContext?.get(CHAT_DIAGNOSTIC_CONTEXT) as ChatDiagnostic | undefined;
    const capture = createPrivateVerificationCapture(diagnostic?.id);
    capture?.({ stage: 'generation', messages, steps, toolResults: state.verificationToolResults });
    await writer?.custom({ type: VERIFICATION_PART, data: { status: 'verifying' } } as any);
    const sources = mergeSources([
      ...((state.verificationSources as SourceEntry[] | undefined) ?? []),
      ...extractSources(messages as any),
    ]);
    const originalQuestion = requestContext?.get(CHAT_VERIFICATION_QUESTION);
    const question = typeof originalQuestion === 'string' ? originalQuestion : extractLatestUserQuestion(messages);
    const coverageQuery = requestContext?.get(COVERAGE_VERIFICATION_QUERY);
    const frameQueries = [...new Set([...((state.verificationFrameQueries as string[] | undefined) ?? []), ...frameQueriesFromMessages(messages)])];
    const last = messages.reduce((last, m, i) => m.role === 'assistant' ? i : last, -1);
    // The answer's stored message: its id is the one history returns and
    // feedback is filed under, and memory stamped it with the thread's owner.
    const { id: messageId, threadId, resourceId } = messages[last] ?? {};
    const owned = Boolean(messageId && threadId && resourceId);
    const verifierUsage: VerifierCallUsage[] = [];
    const onUsage = (usage: unknown) => {
      const counts = callUsage(usage);
      verifierUsage.push(counts);
      if (!owned) return;
      void this.stores.usage?.record({ userId: resourceId!, route: 'chat', phase: 'verifier', threadId,
        modelId: getConfig().model, provider: 'openai', ...counts })?.catch(() => {});
    };
    const result = await runVerificationForAnswer({ question, coverageQuery: typeof coverageQuery === 'string' ? coverageQuery : question, frameQueries,
      earlierUserTurns: earlierUserTurns(requestContext), answerText: text, sources, onUsage, signal: abortSignal, capture });
    const { finalAnswer, outcome, telemetry } = result;
    finishChatDiagnostic(diagnostic, outcome, telemetry.latency_ms);
    const released = messages.map((m, i) => i === last ? releaseMessage(m, finalAnswer, outcome) : m);
    await writer?.custom({ type: VERIFICATION_PART, data: { ...outcome, answer: finalAnswer } } as any);
    if (!writer) emitVerifierTelemetry(telemetry);
    if (owned) {
      // Ids and the outcome only; `verification.release` in run.ts has no ids.
      log.info('chat.verification', { threadId, messageId, ...outcome, latencyMs: telemetry.latency_ms });
      void this.stores.audit?.record({ messageId, threadId: threadId!, resourceId: resourceId!, outcome, telemetry,
        findings: result.findings, usage: verifierUsage,
        corpusRelease: process.env.CORPUS_RELEASE_ID?.trim() || null, agentModel: AGENT_MODEL })?.catch(() => {});
    }
    return released;
  }
}
