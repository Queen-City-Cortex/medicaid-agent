import type { Processor, ProcessOutputStepArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';
import { VERIFICATION_PART } from '@nc-medicaid/contracts';
import { releaseMessage } from '../../answer-release.js';
import { extractSources } from './evidence.js';
import { emitVerifierTelemetry, runVerificationForAnswer } from './run.js';

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

export class HallucinationVerifier implements Processor {
  readonly id = 'hallucination-verifier';
  readonly name = 'Hallucination Verifier';

  async processOutputStep({ text, finishReason, toolCalls, messages, writer, abortSignal }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    if (finishReason !== 'stop' || toolCalls?.length || !text) {
      // Interim narration must not enter memory or future model context.
      const lastUser = messages.reduce((last, m, i) => m.role === 'user' ? i : last, -1);
      return messages.map((m, i) => i > lastUser && m.role === 'assistant'
        ? { ...m, content: { ...m.content, parts: m.content.parts.filter(p => p.type !== 'text' && p.type !== 'reasoning') } }
        : m);
    }
    await writer?.custom({ type: VERIFICATION_PART, data: { status: 'verifying' } } as any);
    const result = await runVerificationForAnswer({ question: extractLatestUserQuestion(messages), answerText: text, sources: extractSources(messages as any), signal: abortSignal });
    const { finalAnswer, outcome, confidence, telemetry } = result;
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
