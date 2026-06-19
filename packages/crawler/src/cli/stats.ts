import type { Command } from 'commander';
import { initDb } from './shared.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show registry statistics')
    .action(() => {
      const registry = initDb();
      const stats = registry.getStats();

      const bySource = new Map<string, Map<string, number>>();
      let totalDocs = 0;

      for (const row of stats) {
        if (!bySource.has(row.source_type)) {
          bySource.set(row.source_type, new Map());
        }
        bySource.get(row.source_type)!.set(row.status, row.count);
        totalDocs += row.count;
      }

      console.log('\nRegistry Statistics');
      console.log('='.repeat(50));

      for (const [source, statuses] of bySource) {
        const parts: string[] = [];
        for (const [status, count] of statuses) {
          parts.push(`${count} ${status}`);
        }
        console.log(`  ${source}: ${parts.join(', ')}`);
      }

      // Compute total disk usage
      let totalBytes = 0;
      const allDocs = registry.getAllDocuments();
      for (const doc of allDocs) {
        if (doc.file_size) totalBytes += doc.file_size;
      }

      console.log('-'.repeat(50));
      console.log(
        `  Total: ${totalDocs} documents, ${(totalBytes / 1024 / 1024).toFixed(1)} MB on disk`,
      );
      console.log('');

      registry.close();
    });
}
