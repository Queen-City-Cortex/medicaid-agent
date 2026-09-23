import type { Command } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import { createRegistry } from '../db/registry.js';
import { archiveOldVersion, downloadDocument } from '../crawl/downloader.js';
import { buildFetcher } from './shared.js';
import { hashFile } from '../utils/hash.js';

export function registerReactivateCommand(program: Command): void {
  program.command('reactivate-source')
    .requiredOption('--url <url>', 'Retired canonical source URL')
    .option('--apply', 'Apply validated recovery; default only validates')
    .action(async (opts: { url: string; apply?: boolean }) => {
      if (process.env.CORPUS_OPERATOR_LOCK_HELD !== '1') throw new Error('Use scripts/ops/reactivate-source.sh to acquire the corpus writer lock');
      const db = new Database(config.dbPath, { readonly: !opts.apply });
      const registry = createRegistry(db);
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'source-reactivation-'));
      try {
        const doc = registry.getByUrl(opts.url);
        if (!doc || !db.prepare('SELECT 1 FROM source_retirements WHERE source_url=? AND reactivated_at IS NULL').get(doc.source_url)) throw new Error('Source is not retired');
        const result = await downloadDocument({ ...doc, etag: null, last_modified: null, file_hash: null, local_path: null }, buildFetcher(), new Set(), staging);
        if (!result.info || !['downloaded', 'updated'].includes(result.action)) throw new Error('Source still unavailable or invalid: ' + result.error);
        const info = result.info;
        const recovered = path.join(staging, info.local_path);
        if (await hashFile(recovered) !== info.file_hash) throw new Error('Recovered source hash changed');
        if (opts.apply) {
          const relative = doc.local_path ?? info.local_path;
          if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || path.extname(relative) !== path.extname(info.local_path)) throw new Error('Recovered identity or format changed; investigate replacement separately');
          const destination = path.join(config.documentsDir, relative);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          const pending = destination + '.reactivating';
          fs.copyFileSync(recovered, pending);
          archiveOldVersion(destination);
          fs.renameSync(pending, destination);
          db.transaction(() => {
            registry.updateDownloaded(doc.id, { ...info, local_path: relative });
            db.prepare("UPDATE documents SET removed_at=NULL WHERE id=?").run(doc.id);
            db.prepare("UPDATE source_retirements SET reactivated_at=datetime('now'), recovered_hash=? WHERE source_url=? AND reactivated_at IS NULL").run(info.file_hash, doc.source_url);
          })();
        }
        console.log(JSON.stringify({ source_url: doc.source_url, status: opts.apply ? 'reactivated' : 'validated', recovered_hash: info.file_hash }));
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
        db.close();
      }
    });
}
