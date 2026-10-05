import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Unroutable host under the reserved .invalid TLD: parses as a DSN, can never
// resolve. The stub transport below is what actually receives every envelope.
const FAKE_DSN = 'https://publickey@sentry.invalid/1';
const BODY_SENTINEL = 'BODY_SENTINEL_can_my_mother_keep_her_house';
const AUTH_SENTINEL = 'AUTH_SENTINEL_bearer_token';
const COOKIE_SENTINEL = 'COOKIE_SENTINEL_session_value';

// Blank the gate variables BEFORE importing the module so its own top-level
// Sentry.init can never fire against a real DSN inherited from the shell.
vi.stubEnv('SENTRY_DSN', '');
vi.stubEnv('SENTRY_ENVIRONMENT', '');
const { Sentry, buildSentryOptions } = await import('../src/sentry.js');

afterAll(async () => {
  await Sentry.close(2000);
  vi.unstubAllEnvs();
});

describe('agent Sentry options', () => {
  it('keep the 0.1 trace sample default and never pass dataCollection', () => {
    const options = buildSentryOptions({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: 'test' });

    expect(options.tracesSampleRate).toBe(0.1);
    expect(options).not.toHaveProperty('dataCollection');
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(
      buildSentryOptions({ SENTRY_DSN: FAKE_DSN, SENTRY_TRACES_SAMPLE_RATE: '0' }).tracesSampleRate,
    ).toBe(0);
  });

  it('send no request body, authorization header or cookie in any envelope', async () => {
    const envelopes: string[] = [];
    Sentry.init({
      ...buildSentryOptions({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: 'test' }),
      // Sample every request so the transaction path is exercised as well as
      // the error path; production keeps the 0.1 default asserted above.
      tracesSampleRate: 1,
      transport: (transportOptions) =>
        Sentry.createTransport(transportOptions, async (request) => {
          envelopes.push(
            typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
          );
          return { statusCode: 200 };
        }),
    });

    const server = http.createServer((req, res) => {
      let received = '';
      req.on('data', (chunk: Buffer) => {
        received += chunk.toString();
      });
      req.on('end', () => {
        Sentry.captureException(new Error('provider failed mid-stream'));
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ received: received.length }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${AUTH_SENTINEL}`,
          cookie: `session=${COOKIE_SENTINEL}`,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: BODY_SENTINEL }] }),
      });
      expect(response.status).toBe(500);
      await Sentry.flush(5000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // Positive control: without these the absence checks would pass vacuously.
    const sent = envelopes.join('\n');
    expect(sent).toContain('provider failed mid-stream');
    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain('/chat');

    for (const sentinel of [BODY_SENTINEL, AUTH_SENTINEL, COOKIE_SENTINEL]) {
      expect(sent).not.toContain(sentinel);
    }
  });
});
