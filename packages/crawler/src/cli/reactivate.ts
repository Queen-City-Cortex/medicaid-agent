import type { Command } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import { createRegistry, type DownloadedInfo } from '../db/registry.js';
import { archiveOldVersion, downloadDocument } from '../crawl/downloader.js';
import { buildFetcher } from './shared.js';
import { hashFile } from '../utils/hash.js';
import { atomicJson, digest, stableJson } from './source-audit.js';
import { readRelocationEvidence, relocationFetcher, retainRelocationEvidence } from './relocation-evidence.js';

function artifactPath(relative: string): string {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid artifact path');
  const root = fs.realpathSync(config.documentsDir);
  const target = path.join(root, relative);
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = fs.realpathSync(ancestor);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('Artifact escapes documents directory');
  return target;
}

interface PendingRecovery { registryHash: string; originalHash: string | null; info: DownloadedInfo; identityEvidenceHash?: string; completed?: boolean; }
export function registerReactivateCommand(program: Command): void {
  program.command('reactivate-source')
    .requiredOption('--url <url>', 'Canonical source URL (failed download, tombstone or retirement)')
    .option('--expected-registry-hash <hash>', 'Require the registry state captured in the reviewed audit')
    .option('--recovery-id <id>', 'Distinct reviewed recovery attempt; reuse this ID when resuming', 'default')
    .option('--payload-url <url>', 'Exact reviewed official relocation payload URL')
    .option('--identity-evidence <manifest>', 'Versioned, hash-verified official identity evidence for relocation')
    .option('--apply', 'Apply validated recovery; default only validates')
    .action(async (opts: { url: string; apply?: boolean; expectedRegistryHash?: string; recoveryId: string; payloadUrl?: string; identityEvidence?: string }) => {
      if (process.env.CORPUS_OPERATOR_LOCK_HELD !== '1') throw new Error('Use scripts/ops/reactivate-source.sh to acquire the corpus writer lock');
      if (Boolean(opts.payloadUrl) !== Boolean(opts.identityEvidence)) throw new Error('Relocation requires both --payload-url and --identity-evidence');
      if (opts.payloadUrl && (!opts.expectedRegistryHash || opts.recoveryId === 'default' || !opts.recoveryId.trim())) throw new Error('Relocation requires reviewed registry hash and distinct recovery ID');
      const db = new Database(config.dbPath, { readonly: !opts.apply });
      const registry = createRegistry(db);
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'source-reactivation-'));
      try {
        const doc = registry.getByUrl(opts.url);
        if (!doc) throw new Error('Unknown source identity');
        const proof = opts.identityEvidence && opts.payloadUrl ? readRelocationEvidence(opts.identityEvidence, doc, opts.payloadUrl) : undefined;
        const stateHash = digest(stableJson(doc));
        const journalFile = path.join(path.dirname(config.dbPath), 'recovery-journal', digest(doc.source_url + '\n' + opts.recoveryId) + '.json');
        const pending: PendingRecovery | undefined = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) as PendingRecovery : undefined;
        if (pending && pending.identityEvidenceHash !== proof?.fingerprint) throw new Error('Recovery identity evidence changed; use the original reviewed proof');
        if (pending && proof && pending.info.file_hash !== proof.evidence.expected_payload_sha256) throw new Error('Journal differs from reviewed payload hash');
        if (pending && proof && opts.expectedRegistryHash !== pending.registryHash) throw new Error('Reviewed registry hash changed for this recovery ID');
        if (pending && proof && readRelocationEvidence(artifactPath('.recovery-evidence/' + proof.fingerprint + '/identity-evidence.json'), doc, opts.payloadUrl!).fingerprint !== proof.fingerprint) throw new Error('Retained recovery identity evidence changed');
        if (pending && doc.file_hash === pending.info.file_hash && doc.status === 'downloaded' && doc.local_path && await hashFile(artifactPath(doc.local_path)) === pending.info.file_hash) {
          if (opts.apply && !pending.completed) atomicJson(journalFile, { ...pending, completed: true });
          console.log(JSON.stringify({ source_url: doc.source_url, status: 'already_recovered', recovered_hash: doc.file_hash }));
          return;
        }
        if (opts.expectedRegistryHash && opts.expectedRegistryHash !== stateHash) throw new Error('Registry changed since source audit');
        if (pending && pending.registryHash !== stateHash) throw new Error('Interrupted recovery registry changed; investigate before retry');
        if (!['removed', 'error', 'discovered'].includes(doc.status)) throw new Error('Source is not awaiting recovery');
        if (doc.local_path && (path.isAbsolute(doc.local_path) || doc.local_path.split(/[\\/]/).includes('..'))) throw new Error('Invalid original artifact path');
        const original = doc.local_path ? artifactPath(doc.local_path) : undefined;
        const originalHash = original && fs.existsSync(original) ? await hashFile(original) : null;
        // A pending file already moved into place can be committed after a crash
        // without another request, archive operation or counted download attempt.
        let info: DownloadedInfo;
        let recovered: string | undefined;
        const pendingArtifact = pending ? artifactPath(pending.info.local_path) : undefined;
        const movedHash = pendingArtifact && fs.existsSync(pendingArtifact) ? await hashFile(pendingArtifact) : null;
        if (pending && movedHash === pending.info.file_hash) {
          info = pending.info;
        } else {
          if (pending && originalHash !== pending.originalHash) throw new Error('Original artifact changed during interrupted recovery');
          const title = doc.title || new URL(doc.source_url).pathname.split('/').filter(Boolean).filter(part => !['download', 'open'].includes(part)).at(-1) || 'source-' + doc.id;
          const fetcher = buildFetcher();
          const result = await downloadDocument({ ...doc, source_url: opts.payloadUrl ?? doc.source_url, title, etag: null, last_modified: null, file_hash: null, local_path: null }, proof ? relocationFetcher(fetcher, proof.evidence.payload_url) : fetcher, new Set(), staging);
          if (!result.info || !['downloaded', 'updated'].includes(result.action)) throw new Error('Source still unavailable or invalid: ' + result.error);
          info = result.info;
          recovered = path.join(staging, info.local_path);
          if (await hashFile(recovered) !== info.file_hash) throw new Error('Recovered source hash changed');
          if (proof && info.file_hash !== proof.evidence.expected_payload_sha256) throw new Error('Recovered payload differs from reviewed hash');
          if (pending && info.file_hash !== pending.info.file_hash) throw new Error('Recovered payload changed after interruption; review required');
        }
        const relative = doc.local_path ?? info.local_path;
        if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || path.extname(relative) !== path.extname(info.local_path)) throw new Error('Recovered identity or format changed; investigate replacement separately');
        info = { ...info, local_path: relative };
        const destination = artifactPath(relative);
        const collision = db.prepare('SELECT source_url FROM documents WHERE local_path=? AND source_url<>?').get(relative, doc.source_url);
        if (collision || (!original && !pending && fs.existsSync(destination))) throw new Error('Recovered path belongs to another artifact; review identity');
        if (opts.apply) {
          if (proof && readRelocationEvidence(opts.identityEvidence!, doc, opts.payloadUrl!).fingerprint !== proof.fingerprint) throw new Error('Identity evidence changed during recovery');
          if (digest(stableJson(registry.getByUrl(doc.source_url))) !== stateHash) throw new Error('Registry changed during recovery');
          if (recovered && original && (fs.existsSync(original) ? await hashFile(original) : null) !== originalHash) throw new Error('Original artifact changed during recovery');
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          if (proof) retainRelocationEvidence(artifactPath('.recovery-evidence'), proof);
          const journal = pending ?? { registryHash: stateHash, originalHash, info, completed: false, ...(proof ? { identityEvidenceHash: proof.fingerprint } : {}) };
          atomicJson(journalFile, journal);
          if (recovered) {
            const temporary = destination + '.reactivating';
            fs.copyFileSync(recovered, temporary);
            // Copy the original into the retained versions before replacement;
            // rename is atomic, so a crash cannot leave the source absent.
            if (fs.existsSync(destination)) {
              const archiveCopy = destination + '.archive-copy';
              fs.copyFileSync(destination, archiveCopy);
              archiveOldVersion(archiveCopy);
            }
            fs.renameSync(temporary, destination);
          }
          db.transaction(() => {
            registry.updateDownloaded(doc.id, info);
            db.prepare('UPDATE documents SET removed_at=NULL WHERE id=?').run(doc.id);
            db.prepare("UPDATE source_retirements SET reactivated_at=datetime('now'), recovered_hash=? WHERE source_url=? AND reactivated_at IS NULL").run(info.file_hash, doc.source_url);
          })();
          atomicJson(journalFile, { ...journal, completed: true });
        }
        console.log(JSON.stringify({ source_url: doc.source_url, registry_hash: stateHash, original_artifact_hash: originalHash, status: opts.apply ? 'recovered' : 'validated', recovered_hash: info.file_hash }));
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
        db.close();
      }
    });
}
