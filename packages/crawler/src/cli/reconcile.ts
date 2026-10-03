import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { config } from '../config.js';
import { hashFile } from '../utils/hash.js';
import { initDb } from './shared.js';

interface ReconciliationStats {
  missing: number;
  hashMismatch: number;
  orphaned: number;
  temporary: number;
  invalidRegistryPaths: number;
  repaired: boolean;
}

function walkDocumentFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (entry.name === '.versions' || entry.name === '.recovery' || entry.name === '.recovery-evidence')
    ) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDocumentFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveRegistryPath(localPath: string): string | null {
  const root = path.resolve(config.documentsDir);
  const resolved = path.resolve(root, localPath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

function recoveryDestination(filePath: string, category: string): string {
  const relative = path.relative(config.documentsDir, filePath);
  const destination = path.join(
    config.documentsDir,
    '.recovery',
    category,
    relative,
  );
  if (!fs.existsSync(destination)) return destination;
  return `${destination}.${Date.now()}`;
}

export async function reconcileDocuments(
  repair: boolean,
): Promise<ReconciliationStats> {
  const registry = initDb();
  const stats: ReconciliationStats = {
    missing: 0,
    hashMismatch: 0,
    orphaned: 0,
    temporary: 0,
    invalidRegistryPaths: 0,
    repaired: repair,
  };

  try {
    const rows = registry.getAllDocuments();
    const referenced = new Set<string>();

    for (const row of rows) {
      if (!row.local_path) continue;
      const filePath = resolveRegistryPath(row.local_path);
      if (!filePath) {
        stats.invalidRegistryPaths++;
        if (repair && row.status !== 'removed') {
          registry.markError(
            row.id,
            'reconciliation: registry path escapes document storage',
          );
        }
        continue;
      }

      referenced.add(path.normalize(filePath));
      // A removed identity can still own original bytes required by its
      // retirement evidence or a later audit. Do not quarantine that history.
      if (row.status === 'removed') continue;
      if (!fs.existsSync(filePath)) {
        stats.missing++;
        if (repair) {
          registry.markError(
            row.id,
            'reconciliation: registry file is missing',
          );
        }
        continue;
      }

      if (row.file_hash && (await hashFile(filePath)) !== row.file_hash) {
        stats.hashMismatch++;
        if (repair) {
          const destination = recoveryDestination(filePath, 'checksum-mismatch');
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.renameSync(filePath, destination);
          registry.markError(
            row.id,
            'reconciliation: file checksum does not match registry',
          );
        }
      }
    }

    for (const filePath of walkDocumentFiles(config.documentsDir)) {
      const normalized = path.normalize(filePath);
      if (referenced.has(normalized) && fs.existsSync(filePath)) continue;

      const filename = path.basename(filePath);
      const isTemporary =
        filename.startsWith('.download-') && filename.endsWith('.tmp');
      if (isTemporary) stats.temporary++;
      stats.orphaned++;

      if (repair) {
        const destination = recoveryDestination(
          filePath,
          isTemporary ? 'temporary' : 'orphans',
        );
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.renameSync(filePath, destination);
      }
    }

    return stats;
  } finally {
    registry.close();
  }
}

export function registerReconcileCommand(program: Command): void {
  program
    .command('reconcile')
    .description(
      'Reconcile interrupted document filesystem and registry transactions',
    )
    .option(
      '--repair',
      'Mark invalid rows for re-download and quarantine unowned files',
    )
    .action(async ({ repair }: { repair?: boolean }) => {
      const stats = await reconcileDocuments(Boolean(repair));
      console.log(JSON.stringify(stats, null, 2));
      if (
        !repair &&
        (stats.missing > 0 ||
          stats.hashMismatch > 0 ||
          stats.orphaned > 0 ||
          stats.invalidRegistryPaths > 0)
      ) {
        process.exitCode = 2;
      }
    });
}
