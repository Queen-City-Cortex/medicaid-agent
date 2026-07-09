import { describe, expect, it } from 'vitest';
import { parseChatError } from '@/lib/parse-chat-error';

describe('parseChatError', () => {
  it('classifies a 429 rate-limit body', () => {
    const error = new Error(
      JSON.stringify({
        error: 'rate_limited',
        message: "You've reached the limit of 30 messages per hour. Please try again in 12 minute(s).",
        retryAfterSeconds: 720,
        limit: 30,
        window: 'hour',
      }),
    );
    expect(parseChatError(error)).toEqual({
      kind: 'rate-limited',
      message: "You've reached the limit of 30 messages per hour. Please try again in 12 minute(s).",
    });
  });

  it('classifies a 413 payload-too-large body', () => {
    const error = new Error(
      JSON.stringify({ error: 'payload_too_large', message: 'That request is too large.' }),
    );
    expect(parseChatError(error)).toEqual({ kind: 'payload-too-large', message: 'That request is too large.' });
  });

  it('extracts an embedded JSON object when the transport wraps the body in text', () => {
    const error = new Error(
      'Too Many Requests: {"error":"rate_limited","message":"Slow down.","retryAfterSeconds":60,"limit":30,"window":"hour"}',
    );
    expect(parseChatError(error)).toEqual({ kind: 'rate-limited', message: 'Slow down.' });
  });

  it('falls back to generic for non-JSON, unknown codes, and missing messages', () => {
    expect(parseChatError(new Error('Internal Server Error'))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(JSON.stringify({ error: 'other', message: 'hm' })))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(JSON.stringify({ error: 'rate_limited' })))).toEqual({ kind: 'generic' });
    expect(parseChatError(new Error(JSON.stringify(['array'])))).toEqual({ kind: 'generic' });
    expect(parseChatError(undefined)).toEqual({ kind: 'generic' });
  });
});
