// Message-part type guards (tool/text part detection and trailing text
// extraction). Lives below the other message-* modules so they can import
// guards without going through the message-parts barrel — a value import from
// the barrel would form a runtime module cycle (barrel re-exports them).

import type { UIMessage } from 'ai';

export type ToolMessagePart = {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  /** Present when state === 'output-error': the error message from the failed tool call. */
  errorText?: string;
};

type TextMessagePart = {
  type: 'text';
  text: string;
};

/** Emitted by @mastra/ai-sdk when an input processor abort()s the request
 *  (scope gate, message length guard, prompt-injection detector). */
export const TRIPWIRE_PART_TYPE = 'data-tripwire';

export type TripwireMessagePart = {
  type: typeof TRIPWIRE_PART_TYPE;
  data?: {
    reason?: string;
    metadata?: { code?: string; userMessage?: string };
    processorId?: string;
  };
};

export function isTripwirePart(part: { type: string }): part is TripwireMessagePart {
  return part.type === TRIPWIRE_PART_TYPE;
}

/** Check if a message part is a tool invocation (static `tool-<name>` or dynamic `dynamic-tool`). */
export function isToolPart(part: { type: string }): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || (part.type.startsWith('tool-') && part.type !== 'tool-output');
}

/** Extract the tool name from a tool part's type. */
export function getToolName(part: { type: string; toolName?: string }): string {
  if (part.toolName) return part.toolName;
  // Static tool parts have type "tool-<name>"
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

export function isTextPart(part: { type: string; text?: string }): part is TextMessagePart {
  return part.type === 'text' && typeof part.text === 'string';
}

export function hasRenderableAssistantPart(parts: UIMessage['parts']): boolean {
  return parts.some(
    (part) => isToolPart(part) || isTripwirePart(part) || (isTextPart(part) && part.text.trim().length > 0),
  );
}

export function getTrailingAssistantText(msg: UIMessage): string {
  const parts = msg.parts ?? [];
  let lastToolIndex = -1;

  for (let index = parts.length - 1; index >= 0; index--) {
    if (isToolPart(parts[index])) {
      lastToolIndex = index;
      break;
    }
  }

  const trailingText: string[] = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!isTextPart(part) || part.text.trim().length === 0) continue;
    if (lastToolIndex !== -1 && index <= lastToolIndex) continue;
    trailingText.push(part.text);
  }

  return trailingText.join('');
}
