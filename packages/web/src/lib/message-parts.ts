import type { TraceEntry } from '@/components/ResearchTrace';
import type { UIMessage } from 'ai';

/** Check if a message part is a tool invocation (static `tool-<name>` or dynamic `dynamic-tool`). */
export function isToolPart(part: { type: string }): part is { type: string; toolName: string; toolCallId: string; state: string } {
  return part.type === 'dynamic-tool' || (part.type.startsWith('tool-') && part.type !== 'tool-output');
}

/** Extract the tool name from a tool part's type. */
export function getToolName(part: { type: string; toolName?: string }): string {
  if (part.toolName) return part.toolName;
  // Static tool parts have type "tool-<name>"
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

/** Split a UIMessage's parts into research trace entries and answer text. */
export function extractMessageParts(msg: UIMessage): {
  traceEntries: TraceEntry[];
  answerText: string;
} {
  const parts = msg.parts ?? [];
  const traceEntries: TraceEntry[] = [];
  const answerTexts: string[] = [];

  // Find the index of the last tool part
  let lastToolIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isToolPart(parts[i])) {
      lastToolIndex = i;
      break;
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (isToolPart(part)) {
      traceEntries.push({
        type: 'tool' as const,
        toolName: getToolName(part),
        toolCallId: (part as { toolCallId?: string }).toolCallId ?? `tc-${i}`,
        state: (part as { state?: string }).state ?? 'output-available',
      });
    } else if (part.type === 'text') {
      if (lastToolIndex >= 0 && i <= lastToolIndex) {
        if ((part as { text: string }).text.trim()) {
          traceEntries.push({ type: 'reasoning', text: (part as { text: string }).text.trim() });
        }
      } else {
        answerTexts.push((part as { text: string }).text);
      }
    }
    // Skip step-start and other non-text, non-tool parts
  }

  return { traceEntries, answerText: answerTexts.join('') };
}
