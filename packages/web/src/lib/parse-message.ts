import type { UIMessage } from 'ai';
import { generateUUID } from './utils';

/**
 * Convert V4 message parts (tool-invocation) to V5 format (dynamic-tool)
 * that the chat timeline renderer expects.
 */
function convertV4PartsToV5(v4Parts: Array<Record<string, unknown>>): UIMessage['parts'] {
  const result: Array<Record<string, unknown>> = [];
  for (const part of v4Parts) {
    const type = part.type as string;
    if (type === 'text' && typeof part.text === 'string') {
      result.push({ type: 'text', text: part.text });
    } else if (type === 'tool-invocation' && part.toolInvocation) {
      const inv = part.toolInvocation as {
        toolCallId: string; toolName: string;
        args?: unknown; result?: unknown; state: string;
      };
      result.push({
        type: 'dynamic-tool',
        toolName: inv.toolName,
        toolCallId: inv.toolCallId,
        state: inv.state === 'result' ? 'output-available' : 'input-available',
        input: inv.args,
        output: inv.state === 'result' ? inv.result : undefined,
      });
    } else if (type === 'step-start') {
      result.push({ type: 'step-start' });
    }
  }
  return result as UIMessage['parts'];
}

/**
 * Convert a Mastra memory thread message into a UIMessage for useChat.
 * Detects MastraMessageContentV2 format and preserves structured parts
 * (tool calls, text, step boundaries) for proper timeline rendering.
 */
export function convertThreadMessageToUIMessage(msg: {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: string | Date;
}): UIMessage | null {
  const role = msg.role as string;
  if (role !== 'user' && role !== 'assistant') return null;

  const id = msg.id ?? (() => {
    const fallback = generateUUID();
    console.warn(`[feedback] Message missing ID, generated fallback: ${fallback}. Feedback for this message won't survive reload.`);
    return fallback;
  })();

  // Detect MastraMessageContentV2 format — preserve structured parts
  const content = msg.content;
  if (content && typeof content === 'object' && !Array.isArray(content) &&
      'format' in content && 'parts' in content) {
    const v2 = content as { format: number; parts: Array<Record<string, unknown>> };
    if (v2.format === 2 && Array.isArray(v2.parts) && v2.parts.length > 0) {
      const parts = convertV4PartsToV5(v2.parts);
      if (parts.length > 0) {
        return { id, role: role as 'user' | 'assistant', parts };
      }
    }
  }

  // Legacy fallback: extract text only
  const text = extractText(content);
  if (!text.trim()) return null;

  return {
    id,
    role: role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: text.trim() }],
  };
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part)
          return (part as { text: string }).text;
        return '';
      })
      .join('\n\n');
  }

  if (content && typeof content === 'object' && 'parts' in content) {
    const parts = (content as { parts: Array<{ type: string; text?: string }> }).parts;
    return parts
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text!)
      .join('\n\n');
  }

  return '';
}
