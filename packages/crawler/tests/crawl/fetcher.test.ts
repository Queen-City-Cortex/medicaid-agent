import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  createFetcher,
  FileTooLargeError,
  UrlRejectedError,
} from '../../src/crawl/fetcher.js';
import { buildFetcher } from '../../src/cli/shared.js';

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

describe('request safety', () => {
  it('checks redirect targets before sending the redirected request', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(302, {
        location: 'http://outside.invalid/policy.pdf',
      });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('test server did not expose a port');
    }

    try {
      const fetcher = createFetcher({
        userAgent: 'TestBot/1.0',
        defaultDelayMs: 0,
        requestTimeoutMs: 1000,
        maxRetries: 0,
        backoffBaseMs: 1,
        backoffMaxMs: 1,
        maxRedirects: 2,
      });
      const url = `http://127.0.0.1:${address.port}/redirect`;

      await expect(
        fetcher.fetchHtml(
          url,
          (candidate) => new URL(candidate).hostname === '127.0.0.1',
        ),
      ).rejects.toBeInstanceOf(UrlRejectedError);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('aborts a chunked download as soon as the byte limit is exceeded', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.write(Buffer.alloc(8, 1));
      response.end(Buffer.alloc(8, 2));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('test server did not expose a port');
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-limit-'));
    const destination = path.join(tempDir, 'download.tmp');

    try {
      const fetcher = createFetcher({
        userAgent: 'TestBot/1.0',
        defaultDelayMs: 0,
        requestTimeoutMs: 1000,
        maxRetries: 0,
        backoffBaseMs: 1,
        backoffMaxMs: 1,
        maxRedirects: 0,
      });

      await expect(
        fetcher.fetchFile(
          `http://127.0.0.1:${address.port}/large`,
          destination,
          { maxBytes: 10, isAllowedUrl: () => true },
        ),
      ).rejects.toBeInstanceOf(FileTooLargeError);
      expect(fs.existsSync(destination)).toBe(true);
      expect(fs.statSync(destination).size).toBeLessThanOrEqual(10);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe('audit evidence transport', () => {
  it('captures redirect history and 404 bodies while checking robots at each hop', async () => {
    const seen: string[] = [];
    const server = createServer((request, response) => {
      if (request.url === '/start') response.writeHead(302, { location: '/missing' }).end();
      else response.writeHead(404, { 'content-type': 'text/html' }).end('Official missing document');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const base = `http://127.0.0.1:${address.port}`;
    const fetcher = createFetcher({ userAgent: 'Test', defaultDelayMs: 0, requestTimeoutMs: 1000, maxRetries: 0, backoffBaseMs: 1, backoffMaxMs: 1, maxRedirects: 3 });
    try {
      const result = await fetcher.fetchEvidence(base + '/start', 1024, url => new URL(url).origin === base, async url => { seen.push(url); });
      expect(result.statusCode).toBe(404);
      expect(result.body.toString()).toBe('Official missing document');
      expect(result.redirects).toEqual([{ url: base + '/start', statusCode: 302, location: base + '/missing' }]);
      expect(seen).toEqual([base + '/start', base + '/missing']);
      await expect(fetcher.fetchEvidence(base + '/start', 1024, () => true, async () => { throw new Error('robots disallows'); })).rejects.toThrow('robots');
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

// www.ncleg.gov/robots.txt asks for `Crawl-delay: 2` (read 2026-10-06). The
// four nc_statute seeds are fetched in one run, so the per-host pacing is what
// keeps them at least two seconds apart.
describe('per-host pacing (ncleg.gov Crawl-delay: 2)', () => {
  it('starts consecutive requests to one host at least the delay apart, even when issued together', async () => {
    const delayMs = 300;
    const arrivals: number[] = [];
    const server = createServer((_request, response) => {
      arrivals.push(Date.now());
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html></html>');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('test server did not expose a port');
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-pace-'));

    try {
      const fetcher = createFetcher({
        userAgent: 'TestBot/1.0',
        defaultDelayMs: delayMs,
        requestTimeoutMs: 2000,
        maxRetries: 0,
        backoffBaseMs: 1,
        backoffMaxMs: 1,
        maxRedirects: 0,
        maxConcurrentRequests: 3,
      });

      // Issued concurrently, as two source families sharing a host would be.
      await Promise.all(
        ['a', 'b', 'c', 'd'].map((name) =>
          fetcher.fetchFile(
            `http://127.0.0.1:${address.port}/GS_${name}.html`,
            path.join(tempDir, `${name}.tmp`),
            { isAllowedUrl: () => true },
          ),
        ),
      );

      expect(arrivals).toHaveLength(4);
      const gaps = arrivals.slice(1).map((time, index) => time - arrivals[index]);
      // 25 ms of slack for timer rounding between the client and server clocks.
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(delayMs - 25);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('gives www.ncleg.gov at least two seconds, and a robots Crawl-delay can only raise it', () => {
    // If the shared default ever drops below 2000 ms, add a per-host floor for
    // www.ncleg.gov rather than loosening this test.
    const fetcher = buildFetcher();
    expect(fetcher.getDelayForDomain('www.ncleg.gov')).toBeGreaterThanOrEqual(2000);
    fetcher.setCrawlDelay('www.ncleg.gov', 500);
    expect(fetcher.getDelayForDomain('www.ncleg.gov')).toBeGreaterThanOrEqual(2000);
  });
});
