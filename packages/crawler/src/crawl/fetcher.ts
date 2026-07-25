import { request, Agent } from 'undici';
import type { Dispatcher } from 'undici';
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';
import type {
  Fetcher,
  FetchFileOptions,
  FetchFileResult,
} from '../sources/types.js';

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

export class UrlRejectedError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`URL is outside the allowed domains: ${url}`);
    this.name = 'UrlRejectedError';
    this.url = url;
  }
}

export class FileTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Download exceeded ${maxBytes} byte limit`);
    this.name = 'FileTooLargeError';
    this.maxBytes = maxBytes;
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
  maxConcurrentRequests?: number;
  isAllowedUrl?: (url: string) => boolean;
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
  // Each individual request passes through both queues: the global queue bounds
  // simultaneous domains, while the keyed queue keeps each host serial and
  // preserves its politeness delay even across redirect chains.
  const requestQueue = new PQueue({
    concurrency: Math.max(1, options.maxConcurrentRequests ?? 3),
  });
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

  // Follow redirects ourselves. An automatic interceptor would fetch the next
  // host before the source-family allowlist can approve it.
  const dispatcher = new Agent({
    connect: { timeout: options.requestTimeoutMs },
  });

  type FetchResponse = {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: BodyReadable;
    finalUrl: string;
  };

  async function requestOnce(
    url: string,
    extraHeaders: Record<string, string>,
  ): Promise<Awaited<ReturnType<typeof request>>> {
    const domain = extractDomain(url);
    return getDomainQueue(domain).add(() =>
      requestQueue.add(async () => {
        await waitForRateLimit(domain);
        return request(url, {
          method: 'GET',
          headers: { ...commonHeaders, ...extraHeaders },
          dispatcher,
          bodyTimeout: options.requestTimeoutMs,
          headersTimeout: options.requestTimeoutMs,
        });
      }),
    ) as Promise<Awaited<ReturnType<typeof request>>>;
  }

  function fetchWithRetry(
    url: string,
    extraHeaders: Record<string, string> = {},
    retries: number = options.maxRetries,
    isAllowedUrl: (url: string) => boolean =
      options.isAllowedUrl ?? (() => true),
  ): Promise<FetchResponse> {
    return fetchWithRetryUnqueued(
      url,
      extraHeaders,
      retries,
      isAllowedUrl,
    );
  }

  async function fetchWithRetryUnqueued(
    url: string,
    extraHeaders: Record<string, string>,
    retries: number,
    isAllowedUrl: (url: string) => boolean,
  ): Promise<FetchResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const startTime = Date.now();
      try {
        let currentUrl = url;
        let response: Awaited<ReturnType<typeof request>> | null = null;

        for (
          let redirectCount = 0;
          redirectCount <= options.maxRedirects;
          redirectCount++
        ) {
          if (!isAllowedUrl(currentUrl)) {
            throw new UrlRejectedError(currentUrl);
          }

          response = await requestOnce(currentUrl, extraHeaders);
          const locationHeader = response.headers.location;
          const isRedirect =
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            Boolean(locationHeader);
          if (!isRedirect) break;

          await response.body.text();
          if (redirectCount === options.maxRedirects) {
            throw new Error(`Too many redirects from ${url}`);
          }
          const location = Array.isArray(locationHeader)
            ? locationHeader[0]
            : locationHeader;
          if (!location) break;
          currentUrl = new URL(location, currentUrl).toString();
        }

        if (!response) {
          throw new Error(`No response from ${url}`);
        }

        const elapsed = Date.now() - startTime;
        logger.debug(
          `GET ${currentUrl} -> ${response.statusCode} (${elapsed}ms)`,
          {
            url: currentUrl,
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
            finalUrl: currentUrl,
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
        if (err instanceof UrlRejectedError) {
          throw err;
        }
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
      isAllowedUrl?: (url: string) => boolean,
    ): Promise<{ body: string; statusCode: number; finalUrl: string }> {
      const response = await fetchWithRetry(url, {
        accept: 'text/html, */*',
      }, options.maxRetries, isAllowedUrl);
      const body = await response.body.text();
      return {
        body,
        statusCode: response.statusCode,
        finalUrl: response.finalUrl,
      };
    },

    async fetchFile(
      url: string,
      destPath: string,
      fileOptions: FetchFileOptions = {},
    ): Promise<FetchFileResult> {
      const extraHeaders: Record<string, string> = {};
      if (fileOptions.etag) {
        extraHeaders['if-none-match'] = fileOptions.etag;
      }
      if (fileOptions.lastModified) {
        extraHeaders['if-modified-since'] = fileOptions.lastModified;
      }

      const response = await fetchWithRetry(
        url,
        extraHeaders,
        1,
        fileOptions.isAllowedUrl,
      );

      if (response.statusCode === 304) {
        // Consume the body
        await response.body.text();
        return {
          statusCode: 304,
          headers: response.headers,
          filePath: null,
          downloaded: false,
          finalUrl: response.finalUrl,
        };
      }

      if (response.statusCode !== 200) {
        await response.body.text();
        return {
          statusCode: response.statusCode,
          headers: response.headers,
          filePath: null,
          downloaded: false,
          finalUrl: response.finalUrl,
        };
      }

      const contentLengthHeader = response.headers['content-length'];
      const contentLengthValue = Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0]
        : contentLengthHeader;
      const contentLength = Number(contentLengthValue);
      if (
        fileOptions.maxBytes !== undefined &&
        Number.isFinite(contentLength) &&
        contentLength > fileOptions.maxBytes
      ) {
        await response.body.text();
        throw new FileTooLargeError(fileOptions.maxBytes);
      }

      let bytesWritten = 0;
      const byteLimiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytesWritten += chunk.length;
          if (
            fileOptions.maxBytes !== undefined &&
            bytesWritten > fileOptions.maxBytes
          ) {
            callback(new FileTooLargeError(fileOptions.maxBytes));
            return;
          }
          callback(null, chunk);
        },
      });
      const writeStream = fs.createWriteStream(destPath);
      await pipeline(response.body, byteLimiter, writeStream);

      return {
        statusCode: 200,
        headers: response.headers,
        filePath: destPath,
        downloaded: true,
        finalUrl: response.finalUrl,
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
