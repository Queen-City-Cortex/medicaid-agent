import type { UIMessage } from 'ai';
import { generateUUID } from './utils';

/**
 * Convert a Mastra memory thread message into a UIMessage for useChat.
 * Thread messages from memory only have text content (no structured tool parts).
 */
export function convertThreadMessageToUIMessage(msg: {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: string | Date;
}): UIMessage | null {
  const role = msg.role as string;
  if (role !== 'user' && role !== 'assistant') return null;

  const text = extractText(msg.content);
  if (!text.trim()) return null;

  return {
    id: msg.id ?? generateUUID(),
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
      .join('');
  }

  if (content && typeof content === 'object' && 'parts' in content) {
    const parts = (content as { parts: Array<{ type: string; text?: string }> }).parts;
    return parts
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text!)
      .join('');
  }

  return '';
}
