/**
 * Classifies errors thrown by the chat transport. On a non-OK response the AI
 * SDK surfaces the response body text as the Error message, so the agent's
 * `{ error: { code, message } }` responses arrive here as JSON strings.
 * Retrying cannot fix any of the classified kinds, so the page shows the
 * server's message for them without a retry button. Anything else is generic.
 */
export type ChatErrorInfo =
  | { kind: 'rate-limited'; message: string }
  | { kind: 'payload-too-large'; message: string }
  | { kind: 'identifier-detected'; message: string }
  | { kind: 'generic' };

/** Parse `raw` as JSON, or — if the transport wrapped the body in a text
 *  prefix (e.g. "429 Too Many Requests: {…}") — extract the first embedded
 *  JSON object. Returns null when neither yields an object. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const attempt = (s: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = attempt(raw);
  if (direct) return direct;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return attempt(raw.slice(start, end + 1));
  return null;
}

export function parseChatError(error: unknown): ChatErrorInfo {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return { kind: 'generic' };
  const body = extractJsonObject(raw);
  if (!body) return { kind: 'generic' };
  const envelope = body.error;
  if (!envelope || typeof envelope !== 'object') return { kind: 'generic' };
  const { code, message } = envelope as { code?: unknown; message?: unknown };
  if (typeof message !== 'string' || !message) return { kind: 'generic' };
  if (code === 'rate_limited') return { kind: 'rate-limited', message };
  if (code === 'payload_too_large') return { kind: 'payload-too-large', message };
  if (code === 'client_identifier_detected') return { kind: 'identifier-detected', message };
  return { kind: 'generic' };
}
