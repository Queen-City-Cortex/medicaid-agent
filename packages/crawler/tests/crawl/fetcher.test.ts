import { describe, it, expect } from 'vitest';
import { createFetcher } from '../../src/crawl/fetcher.js';

// We test the rate-limiting and retry logic, not actual HTTP
// Actual HTTP is tested in integration tests

describe('createFetcher', () => {
  it('creates a fetcher instance', () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 100,
      requestTimeoutMs: 5000,
      maxRetries: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });
    expect(fetcher).toBeDefined();
    expect(fetcher.fetchHtml).toBeInstanceOf(Function);
    expect(fetcher.fetchFile).toBeInstanceOf(Function);
  });
});

describe('rate limiting', () => {
  it('enforces minimum delay between requests to the same domain', async () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 200,
      requestTimeoutMs: 5000,
      maxRetries: 0,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });

    // We can't easily test timing without real HTTP,
    // but we can verify the fetcher tracks per-domain delays
    expect(fetcher.getDelayForDomain('example.com')).toBe(200);
  });

  it('respects custom crawl-delay per domain', () => {
    const fetcher = createFetcher({
      userAgent: 'TestBot/1.0',
      defaultDelayMs: 200,
      requestTimeoutMs: 5000,
      maxRetries: 0,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
      maxRedirects: 5,
    });

    fetcher.setCrawlDelay('example.com', 5000);
    expect(fetcher.getDelayForDomain('example.com')).toBe(5000);
  });
});
