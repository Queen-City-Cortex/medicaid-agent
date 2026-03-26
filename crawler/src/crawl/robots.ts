import robotsParser from 'robots-parser';
import { logger } from '../utils/logger.js';
import type { Fetcher } from '../sources/types.js';

interface RobotsCache {
  [domain: string]: ReturnType<typeof robotsParser>;
}

export interface RobotsChecker {
  fetchAndCache(domain: string, fetcher: Fetcher): Promise<void>;
  isAllowed(url: string): boolean;
  getCrawlDelay(domain: string): number | null;
}

export function createRobotsChecker(userAgent: string): RobotsChecker {
  const cache: RobotsCache = {};

  return {
    async fetchAndCache(domain: string, fetcher: Fetcher): Promise<void> {
      const robotsUrl = `https://${domain}/robots.txt`;
      try {
        const { body, statusCode } = await fetcher.fetchHtml(robotsUrl);
        if (statusCode === 200) {
          cache[domain] = robotsParser(robotsUrl, body);
          const crawlDelay = cache[domain].getCrawlDelay(userAgent);
          logger.info(
            `Fetching robots.txt for ${domain}... OK (Crawl-delay: ${crawlDelay ?? 'none'})`,
          );
        } else {
          logger.info(
            `Fetching robots.txt for ${domain}... ${statusCode} (allowing all)`,
          );
        }
      } catch (err) {
        logger.warn(
          `Failed to fetch robots.txt for ${domain}: ${(err as Error).message} (allowing all)`,
        );
      }
    },

    isAllowed(url: string): boolean {
      const domain = new URL(url).hostname;
      const robots = cache[domain];
      if (!robots) return true;
      return robots.isAllowed(url, userAgent) ?? true;
    },

    getCrawlDelay(domain: string): number | null {
      const robots = cache[domain];
      if (!robots) return null;
      const delay = robots.getCrawlDelay(userAgent);
      return delay ?? null;
    },
  };
}
