import type { Processor, ProcessOutputStepArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';
import { getConfig } from './config.js';
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

  async processOutputStep({
    text,
    finishReason,
    toolCalls,
    messages,
    writer,
  }: ProcessOutputStepArgs): Promise<MastraDBMessage[]> {
    if (!getConfig().enabled) return messages;

    // Only verify the final answer (model stopped, no pending tool calls, has text)
    if (finishReason !== 'stop' || (toolCalls && toolCalls.length > 0) || !text) {
      return messages;
    }

    const question = extractLatestUserQuestion(messages);
    const sources = extractSources(messages as any);
    const { finalAnswer, rewrote, telemetry, verification, confidence } =
      await runVerificationForAnswer({ question, answerText: text, sources });

    if (!rewrote) {
      if (writer) {
        // Emit a positive-path event so the UI can render a green confidence
        // indicator even when nothing needed correcting.
        await writer.custom({
          type: 'data-verification-ok',
          data: {
            confidence: confidence.confidence,
            severity: confidence.severity,
            counts: confidence.counts,
          },
        } as any);
      } else {
        // Non-streaming path — emit telemetry so the eval harness can capture it.
        emitVerifierTelemetry(telemetry);
      }
      return messages;
    }

    if (writer) {
      await writer.custom({
        type: 'data-verification-rewrite',
        data: {
          unsupportedClaims: verification.unsupportedClaims,
          missingCitationClaims: verification.missingCitationClaims,
          relevanceIssues: verification.relevanceIssues,
          correctedAnswer: finalAnswer,
          confidence: confidence.confidence,
          severity: confidence.severity,
          counts: confidence.counts,
          pureMarkerFallback: confidence.pureMarkerFallback,
          substanceLossFallback: confidence.substanceLossFallback,
        },
      } as any);
    } else {
      // Non-streaming path — emit telemetry so the eval harness can capture it.
      emitVerifierTelemetry(telemetry);
    }

    return replaceFinalAnswerText(messages, finalAnswer);
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
