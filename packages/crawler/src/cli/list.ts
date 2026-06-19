import type { Command } from 'commander';
import { initDb } from './shared.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List documents with filters')
    .option('-s, --source <type>', 'Filter by source type')
    .option('--status <status>', 'Filter by status')
    .action((opts) => {
      const registry = initDb();
      let docs = registry.getAllDocuments();

      if (opts.source) {
        docs = docs.filter((d) => d.source_type === opts.source);
      }
      if (opts.status) {
        docs = docs.filter((d) => d.status === opts.status);
      }

      for (const doc of docs) {
        const size = doc.file_size
          ? `${Math.round(doc.file_size / 1024)} KB`
          : 'not downloaded';
        console.log(
          `[${doc.status}] ${doc.policy_number ?? ''} ${doc.title ?? doc.source_url} (${size})`,
        );
      }
      console.log(`\n${docs.length} documents`);

      registry.close();
    });
}
