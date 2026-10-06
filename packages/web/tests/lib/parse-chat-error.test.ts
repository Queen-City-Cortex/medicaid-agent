import { describe, expect, it } from 'vitest';
import { parseChatError } from '@/lib/parse-chat-error';

const body = (code: string, message?: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ error: { code, ...(message ? { message } : {}), ...extra } });

describe('parseChatError', () => {
  it('classifies a 429 rate-limit body', () => {
    const message = "You've reached the limit of 30 messages per hour. Please try again in 12 minute(s).";
    const error = new Error(body('rate_limited', message, { retryAfterSeconds: 720, details: { limit: 30, window: 'hour' } }));
    expect(parseChatError(error)).toEqual({ kind: 'rate-limited', message });
  });

  it('classifies a 413 payload-too-large body', () => {
    expect(parseChatError(new Error(body('payload_too_large', 'That request is too large.'))))
      .toEqual({ kind: 'payload-too-large', message: 'That request is too large.' });
  });

  it('surfaces the identifier screen\'s message from the real 422 body', () => {
    const real = '{"error":{"code":"client_identifier_detected","message":"Remove client-identifying information before sending this question."}}';
    expect(parseChatError(new Error(real))).toEqual({
      kind: 'identifier-detected',
      message: 'Remove client-identifying information before sending this question.',
    });
  });

  it('reads the nested identifier envelope when the transport wraps it in text, ignoring extra fields', () => {
    const message = 'Remove client-identifying information before sending this question.';
    const error = new Error(`422 Unprocessable Entity: ${body('client_identifier_detected', message, { details: { kinds: ['member_id'] } })}`);
    expect(parseChatError(error)).toEqual({ kind: 'identifier-detected', message });
    // The same code and message outside the envelope are not the agent's shape.
    expect(parseChatError(new Error(JSON.stringify({ error: 'client_identifier_detected', message })))).toEqual({ kind: 'generic' });
  });

  it('extracts an embedded JSON object when the transport wraps the body in text', () => {
    const error = new Error(`Too Many Requests: ${body('rate_limited', 'Slow down.', { retryAfterSeconds: 60 })}`);
    expect(parseChatError(error)).toEqual({ kind: 'rate-limited', message: 'Slow down.' });
  });

  it('falls back to generic for non-JSON, unknown codes, missing messages and the old flat shape', () => {
    expect(parseChatError(new Error('Internal Server Error'))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(body('other', 'hm')))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(body('rate_limited')))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(JSON.stringify({ error: 'rate_limited', message: 'flat' })))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(JSON.stringify(['array'])))).toEqual({ kind: 'generic' });
    expect(parseChatError(undefined)).toEqual({ kind: 'generic' });
  });
});
