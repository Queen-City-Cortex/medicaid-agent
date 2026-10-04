import type { Processor, ProcessOutputStepArgs, ProcessToolResultArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';
import { VERIFICATION_PART } from '@nc-medicaid/contracts';
import { releaseMessage } from '../../answer-release.js';
import { extractSources, extractSourcesFromToolResults, type SourceEntry, type ToolResultRecord } from './evidence.js';
import { emitVerifierTelemetry, runVerificationForAnswer } from './run.js';
import { createPrivateVerificationCapture, finishChatDiagnostic, type ChatDiagnostic } from './diagnostics.js';
import { CHAT_DIAGNOSTIC_CONTEXT, CHAT_VERIFICATION_QUESTION } from './context.js';
import { COVERAGE_VERIFICATION_QUERY } from '../coverage-boundary.js';

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

export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  processToolResult({ toolName, toolCallId, result, args, providerExecuted, state }: ProcessToolResultArgs): void {
    // Observation may compact tool messages before final synthesis. Preserve
    // actual corpus results in request-local processor state, never a summary.
    if (providerExecuted) return;
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
        ? { ...m, content: { ...m.content, parts: m.content.parts.filter(p => p.type !== 'text' && p.type !== 'reasoning') } }
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
    const result = await runVerificationForAnswer({ question, coverageQuery: typeof coverageQuery === 'string' ? coverageQuery : question, answerText: text, sources, signal: abortSignal, capture });
    const { finalAnswer, outcome, confidence, telemetry } = result;
    finishChatDiagnostic(diagnostic, outcome, telemetry.latency_ms);
    const last = messages.reduce((last, m, i) => m.role === 'assistant' ? i : last, -1);
    const released = messages.map((m, i) => i === last ? releaseMessage(m, finalAnswer, outcome) : m);
    await writer?.custom({ type: VERIFICATION_PART, data: { ...outcome, answer: finalAnswer,
      confidence: confidence.confidence, severity: confidence.severity, counts: confidence.counts } } as any);
    if (!writer) emitVerifierTelemetry(telemetry);
    return released;
  }
}

/**
 * Replace ONLY the final answer text: the last text part of the last
 * assistant message. Earlier assistant messages (prior turns) and interim
 * progress-update text parts must remain untouched — a blanket rewrite
 * clobbers conversation history with the current turn's corrected answer.
 */
export function replaceFinalAnswerText(
  messages: MastraDBMessage[],
  corrected: string,
): MastraDBMessage[] {
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx === -1) return messages;

  return messages.map((msg, idx) => {
    if (idx !== lastAssistantIdx) return msg;

    const content = (msg as any).content;
    // Defensive: the type says content is always structured, but legacy rows
    // can carry plain-string content — don't crash on them.
    if (typeof content === 'string') {
      return { ...msg, content: corrected } as unknown as MastraDBMessage;
    }

    const parts = Array.isArray(content?.parts) ? content.parts : null;
    if (!parts) return msg;

    let lastTextIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i]?.type === 'text') {
        lastTextIdx = i;
        break;
      }
    }
    if (lastTextIdx === -1) return msg;

    return {
      ...msg,
      content: {
        ...content,
        parts: parts.map((part: any, i: number) =>
          i === lastTextIdx ? { ...part, text: corrected } : part,
        ),
      },
    } as MastraDBMessage;
  });
}
