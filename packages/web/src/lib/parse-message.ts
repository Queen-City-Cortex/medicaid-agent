/**
 * Parse Mastra message content into a plain string.
 * Handles: string, array of parts, Mastra v2 { format, parts } object.
 */
export function parseMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return (part as { text: string }).text;
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
