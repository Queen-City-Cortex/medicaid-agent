import { request, Agent, interceptors } from 'undici';
import type { Dispatcher } from 'undici';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';
import type { Fetcher, FetchFileResult } from '../sources/types.js';

type BodyReadable = Dispatcher.ResponseData['body'];

/**
 * Error thrown when a fetch ultimately fails with an HTTP error status.
 * Carries the structured status code so callers never have to parse it back
 * out of the message string.
 */
export class HttpStatusError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, url: string) {
    super(`HTTP ${statusCode} from ${url}`);
    this.name = 'HttpStatusError';
    this.statusCode = statusCode;
  }
}

export interface FetcherOptions {
  userAgent: string;
  defaultDelayMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  maxRedirects: number;
}

interface RateLimitedFetcher extends Fetcher {
  setCrawlDelay(domain: string, delayMs: number): void;
  getDelayForDomain(domain: string): number;
}

function extractDomain(url: string): string {
  return new URL(url).hostname;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFetcher(options: FetcherOptions): RateLimitedFetcher {
  const domainDelays = new Map<string, number>();
  const lastRequestTime = new Map<string, number>();
  // One queue per domain with concurrency=1 serializes requests to the same host.
  // Without this, concurrent callers can race through `waitForRateLimit` and both
  // fire a request simultaneously, tripping 429s on the target site.
  const domainQueues = new Map<string, PQueue>();
  let runWide429Count = 0;

  function getDelay(domain: string): number {
    return domainDelays.get(domain) ?? options.defaultDelayMs;
  }

  function getDomainQueue(domain: string): PQueue {
    let queue = domainQueues.get(domain);
    if (!queue) {
      queue = new PQueue({ concurrency: 1 });
      domainQueues.set(domain, queue);
    }
    return queue;
  }

  async function waitForRateLimit(domain: string): Promise<void> {
    const delay = getDelay(domain);
    const lastTime = lastRequestTime.get(domain);
    if (lastTime) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < delay) {
        const waitMs = delay - elapsed;
        logger.debug(`Rate limit: waiting ${waitMs}ms for ${domain}`);
        await sleep(waitMs);
      }
    }
    lastRequestTime.set(domain, Date.now());
  }

  const commonHeaders = {
    'user-agent': options.userAgent,
    accept:
      'application/pdf, application/vnd.openxmlformats-officedocument.*, text/html, */*',
    // Do NOT request compressed encoding: undici does not auto-decompress
    // response bodies, so compressed HTML would be returned as raw bytes.
    'accept-encoding': 'identity',
  };

  // Private dispatcher with the redirect interceptor. We must NOT rely on the
  // undici GLOBAL dispatcher: importing `cheerio` (in the source modules) calls
  // setGlobalDispatcher() to install its own redirect-interceptor dispatcher,
  // which makes passing `maxRedirections` to request() throw
  // "maxRedirections is not supported, use the redirect interceptor". Owning our
  // dispatcher isolates the crawler from that global mutation and is forward-
  // compatible with undici 7 (which drops `maxRedirections` from request()).
  const dispatcher = new Agent().compose(
    interceptors.redirect({ maxRedirections: options.maxRedirects }),
  );

  function fetchWithRetry(
    url: string,
    extraHeaders: Record<string, string> = {},
    retries: number = options.maxRetries,
  ): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: BodyReadable }> {
    const domain = extractDomain(url);
    return getDomainQueue(domain).add(async () => fetchWithRetryUnqueued(url, domain, extraHeaders, retries)) as Promise<{
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      body: BodyReadable;
    }>;
  }

  async function fetchWithRetryUnqueued(
    url: string,
    domain: string,
    extraHeaders: Record<string, string>,
    retries: number,
  ): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: BodyReadable }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await waitForRateLimit(domain);

      const startTime = Date.now();
      try {
        const response = await request(url, {
          method: 'GET',
          headers: { ...commonHeaders, ...extraHeaders },
          dispatcher,
          bodyTimeout: options.requestTimeoutMs,
          headersTimeout: options.requestTimeoutMs,
        });

        const elapsed = Date.now() - startTime;
        logger.debug(
          `GET ${url} -> ${response.statusCode} (${elapsed}ms)`,
          {
            url,
            statusCode: response.statusCode,
            elapsed,
            contentLength: response.headers['content-length'],
          },
        );

        // Don't retry on success or client errors (except 429)
        if (response.statusCode < 500 && response.statusCode !== 429) {
          return {
            statusCode: response.statusCode,
            headers: response.headers as Record<string, string | string[] | undefined>,
            body: response.body,
          };
        }

        // 429 or 5xx — retry with backoff
        if (response.statusCode === 429) {
          runWide429Count++;
          if (runWide429Count > 3) {
            logger.warn(
              `429 received ${runWide429Count} times this run — pausing entire crawl for 5 minutes`,
            );
            await sleep(5 * 60 * 1000);
          }
        }

        const backoffMs = Math.min(
          options.backoffBaseMs * Math.pow(2, attempt),
          options.backoffMaxMs,
        );
        logger.warn(
          `${response.statusCode} from ${url}, backing off ${backoffMs}ms (attempt ${attempt + 1}/${retries + 1})`,
        );

        // Consume the body to free the socket
        await response.body.text();

        if (attempt < retries) {
          await sleep(backoffMs);
        }

        lastError = new HttpStatusError(response.statusCode, url);
      } catch (err) {
        const elapsed = Date.now() - startTime;
        logger.error(
          `Request failed for ${url} after ${elapsed}ms: ${(err as Error).message}`,
        );
        lastError = err as Error;

        if (attempt < retries) {
          const backoffMs = Math.min(
            options.backoffBaseMs * Math.pow(2, attempt),
            options.backoffMaxMs,
          );
          await sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  return {
    async fetchHtml(
      url: string,
    ): Promise<{ body: string; statusCode: number }> {
      const response = await fetchWithRetry(url, {
        accept: 'text/html, */*',
      });
      const body = await response.body.text();
      return { body, statusCode: response.statusCode };
    },

    async fetchFile(
      url: string,
      destPath: string,
      conditionalHeaders?: { etag?: string; lastModified?: string },
    ): Promise<FetchFileResult> {
      const extraHeaders: Record<string, string> = {};
      if (conditionalHeaders?.etag) {
        extraHeaders['if-none-match'] = conditionalHeaders.etag;
      }
      if (conditionalHeaders?.lastModified) {
        extraHeaders['if-modified-since'] = conditionalHeaders.lastModified;
      }

      const response = await fetchWithRetry(url, extraHeaders, 1);

      if (response.statusCode === 304) {
        // Consume the body
        await response.body.text();
        return {
          statusCode: 304,
          headers: response.headers,
          filePath: null,
          downloaded: false,
        };
      }

      if (response.statusCode !== 200) {
        await response.body.text();
        return {
          statusCode: response.statusCode,
          headers: response.headers,
          filePath: null,
          downloaded: false,
        };
      }

      // Stream to disk
      const writeStream = fs.createWriteStream(destPath);
      await pipeline(response.body, writeStream);

      return {
        statusCode: 200,
        headers: response.headers,
        filePath: destPath,
        downloaded: true,
      };
    },

    setCrawlDelay(domain: string, delayMs: number): void {
      domainDelays.set(domain, Math.max(delayMs, options.defaultDelayMs));
    },

    getDelayForDomain(domain: string): number {
      return getDelay(domain);
    },
  };
}
