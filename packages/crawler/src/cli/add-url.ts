import type { Command } from 'commander';
import { initDb, VALID_SOURCE_TYPES } from './shared.js';
import type { SourceType } from '../sources/types.js';

export function registerAddUrlCommand(program: Command): void {
  program
    .command('add-url <url>')
    .description('Manually add a document URL to the registry')
    .requiredOption('-s, --source <type>', 'Source type')
    .option('-t, --title <title>', 'Document title')
    .option('-p, --policy-number <number>', 'Policy number')
    .option('-c, --category <category>', 'Category')
    .action((url, opts) => {
      if (!VALID_SOURCE_TYPES.includes(opts.source)) {
        console.error(`Invalid source type: ${opts.source}`);
        process.exit(1);
      }

      const registry = initDb();
      const id = registry.upsertDiscovered({
        source_url: url,
        discovered_from: 'manual',
        source_type: opts.source as SourceType,
        title: opts.title ?? null,
        policy_number: opts.policyNumber ?? null,
        category: opts.category ?? null,
      });

      console.log(`Added document #${id}: ${url}`);
      registry.close();
    });
}
