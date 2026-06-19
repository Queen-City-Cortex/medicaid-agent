import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { buildFetcher } from './shared.js';

export function registerUpdateFixturesCommand(program: Command): void {
  program
    .command('update-fixtures')
    .description('Update HTML test fixtures from live index pages')
    .action(async () => {
      const fetcher = buildFetcher();

      const fixturesDir = path.join(
        path.dirname(config.dbPath),
        '..',
        'tests',
        'fixtures',
      );
      fs.mkdirSync(fixturesDir, { recursive: true });

      const fixtures: Array<[string, string]> = [
        [config.sources.clinical_policy.indexUrl, 'clinical-policies.html'],
        [config.sources.bulletin.indexUrl, 'bulletins-main.html'],
        [config.sources.bulletin.blogListingUrl, 'bulletins-blog-listing.html'],
        [config.sources.bulletin.digestsUrl, 'bulletins-digests.html'],
        [config.sources.state_plan_amendment.indexUrl, 'state-plan-index.html'],
        ...config.sources.waiver.seedUrls.map(
          (url, i): [string, string] => [url, `waivers-seed-${i}.html`],
        ),
      ];

      for (const [url, filename] of fixtures) {
        try {
          const { body } = await fetcher.fetchHtml(url);
          const filePath = path.join(fixturesDir, filename);
          fs.writeFileSync(filePath, body);
          console.log(`Updated ${filename} (${body.length} bytes)`);
        } catch (err) {
          console.error(`Failed to fetch ${url}: ${(err as Error).message}`);
        }
      }
    });
}
