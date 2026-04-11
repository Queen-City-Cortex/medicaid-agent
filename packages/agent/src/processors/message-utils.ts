export function partText(part: unknown): string {
  if (!part || typeof part !== 'object') return '';
  if ('type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string') {
    return part.text;
  }
  return '';
}

export function messageParts(content: unknown): any[] {
  if (!content) return [];
  if (Array.isArray(content)) return content;
  if (typeof content === 'object' && 'parts' in content && Array.isArray(content.parts)) {
    return content.parts;
  }
  return [];
}

export function contentText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return messageParts(content).map(partText).join('\n').trim();
}

export function latestUserText(messages: Array<{ role?: string; content?: unknown }>): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const text = contentText(message.content).trim();
    if (text) return text;
  }
  return null;
}

export function latestToolResult<T>(
  messages: Array<{ content?: unknown }>,
  toolName: string,
): T | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = messages[messageIndex];
    const parts = messageParts(message?.content);
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex];
      if (!part || part.type !== 'tool-invocation') continue;
      const invocation = part.toolInvocation;
      if (!invocation || invocation.state !== 'result' || invocation.toolName !== toolName) continue;
      return (invocation.result as T | undefined) ?? null;
    }
  }
  return null;
}
