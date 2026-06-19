import type { Command } from 'commander';
import fs from 'node:fs';
import { initDb } from './shared.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export registry to JSON')
    .option('-o, --output <path>', 'Output file path', 'registry.json')
    .action((opts) => {
      const registry = initDb();
      const docs = registry.getAllDocuments();
      fs.writeFileSync(opts.output, JSON.stringify(docs, null, 2));
      console.log(`Exported ${docs.length} documents to ${opts.output}`);
      registry.close();
    });
}
