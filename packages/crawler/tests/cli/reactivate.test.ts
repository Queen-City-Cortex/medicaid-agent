import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../../src/config.js';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry } from '../../src/db/registry.js';
import { registerReactivateCommand } from '../../src/cli/reactivate.js';
import { downloadDocument } from '../../src/crawl/downloader.js';

vi.mock('../../src/cli/shared.js', () => ({ buildFetcher: () => ({}) }));
vi.mock('../../src/crawl/downloader.js', async (original) => ({
  ...await original<typeof import('../../src/crawl/downloader.js')>(), downloadDocument: vi.fn(),
}));
const url = 'https://policies.ncdhhs.gov/document/form/';
let root: string;
let originalPaths: { dbPath: string; documentsDir: string };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-test-'));
  originalPaths = { dbPath: config.dbPath, documentsDir: config.documentsDir };
  Object.assign(config, { dbPath: path.join(root, 'crawler.db'), documentsDir: path.join(root, 'documents') });
  fs.mkdirSync(path.join(config.documentsDir, 'dhhs-policies'), { recursive: true });
  fs.writeFileSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'), 'original invalid payload');
  const db = new Database(config.dbPath);
  initializeSchema(db);
  const registry = createRegistry(db);
  const id = registry.upsertDiscovered({ source_url: url, discovered_from: 'https://policies.ncdhhs.gov/', source_type: 'dhhs_policy', title: 'Form', policy_number: null, category: null });
  db.prepare("UPDATE documents SET status='removed',local_path='dhhs-policies/form.pdf' WHERE id=?").run(id);
  db.prepare("INSERT INTO source_retirements(source_url,evidence_json,retired_at) VALUES(?, '{}', datetime('now'))").run(url);
  db.close();
  vi.stubEnv('CORPUS_OPERATOR_LOCK_HELD', '1');
  vi.mocked(downloadDocument).mockImplementation(async (_doc, _fetcher, _names, staging) => {
    const body = Buffer.from('%PDF-valid recovery');
    const rel = 'dhhs-policies/form.pdf';
    fs.mkdirSync(path.dirname(path.join(staging!, rel)), { recursive: true });
    fs.writeFileSync(path.join(staging!, rel), body);
    return { action: 'downloaded', info: { local_path: rel, file_hash: createHash('sha256').update(body).digest('hex'), file_size: body.length,
      mime_type: 'application/pdf', detected_content_type: 'application/pdf', content_disposition_filename: null, etag: null, last_modified: null } };
  });
});
afterEach(() => {
  Object.assign(config, originalPaths);
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
async function run(apply = false) {
  const program = new Command();
  registerReactivateCommand(program);
  await program.parseAsync(['node', 'crawler', 'reactivate-source', '--url', url, ...(apply ? ['--apply'] : [])]);
}
describe('documented source reactivation', () => {
  it('validates without reactivating, then archives and reactivates a valid recovery', async () => {
    await run();
    let db = new Database(config.dbPath);
    expect(db.prepare('SELECT status FROM documents').get()).toEqual({ status: 'removed' });
    db.close();
    await run(true);
    db = new Database(config.dbPath);
    expect(db.prepare('SELECT status FROM documents').get()).toEqual({ status: 'downloaded' });
    expect(db.prepare('SELECT reactivated_at FROM source_retirements').get()).toMatchObject({ reactivated_at: expect.any(String) });
    db.close();
    expect(fs.readdirSync(path.join(config.documentsDir, 'dhhs-policies/.versions'))).toHaveLength(1);
  });
  it('retains retirement and original payload on invalid download', async () => {
    vi.mocked(downloadDocument).mockResolvedValue({ action: 'error', error: 'Missing attachment' });
    await expect(run(true)).rejects.toThrow('invalid');
    const db = new Database(config.dbPath);
    expect(db.prepare('SELECT reactivated_at FROM source_retirements').get()).toEqual({ reactivated_at: null });
    db.close();
    expect(fs.readFileSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'), 'utf8')).toBe('original invalid payload');
  });
});

it('recovers an undocumented tombstone and makes duplicate application a no-op', async () => {
  let db = new Database(config.dbPath);
  db.prepare('DELETE FROM source_retirements').run(); db.close();
  vi.mocked(downloadDocument).mockClear();
  await run(true);
  await run(true);
  expect(downloadDocument).toHaveBeenCalledTimes(1);
  db = new Database(config.dbPath);
  expect(db.prepare('SELECT status,download_attempts FROM documents').get()).toEqual({ status: 'downloaded', download_attempts: 1 });
  db.close();
});

it('resumes a crash after file replacement without repeating the download', async () => {
  let db = new Database(config.dbPath);
  db.exec("CREATE TRIGGER interrupt_recovery BEFORE UPDATE OF status ON documents WHEN NEW.status='downloaded' BEGIN SELECT RAISE(ABORT, 'interrupted'); END"); db.close();
  vi.mocked(downloadDocument).mockClear();
  await expect(run(true)).rejects.toThrow('interrupted');
  db = new Database(config.dbPath); db.exec('DROP TRIGGER interrupt_recovery'); db.close();
  await run(true);
  expect(downloadDocument).toHaveBeenCalledTimes(1);
  db = new Database(config.dbPath);
  expect(db.prepare('SELECT download_attempts FROM documents').get()).toEqual({ download_attempts: 1 }); db.close();
});

it('resumes a never-downloaded source after file rename without a second download', async () => {
  let db = new Database(config.dbPath);
  db.exec("UPDATE documents SET local_path=NULL; CREATE TRIGGER interrupt_recovery BEFORE UPDATE OF status ON documents WHEN NEW.status='downloaded' BEGIN SELECT RAISE(ABORT, 'interrupted'); END"); db.close();
  fs.rmSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'));
  vi.mocked(downloadDocument).mockClear();
  await expect(run(true)).rejects.toThrow('interrupted');
  db = new Database(config.dbPath); db.exec('DROP TRIGGER interrupt_recovery'); db.close();
  await run(true);
  expect(downloadDocument).toHaveBeenCalledTimes(1);
});

it('rejects another source artifact at the recovered path', async () => {
  const db = new Database(config.dbPath);
  db.exec("UPDATE documents SET local_path=NULL; INSERT INTO documents(source_url,source_type,discovered_from,local_path) VALUES('https://policies.ncdhhs.gov/document/sibling/', 'dhhs_policy','https://policies.ncdhhs.gov/','dhhs-policies/form.pdf')"); db.close();
  await expect(run(true)).rejects.toThrow('another artifact');
  expect(fs.readFileSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'), 'utf8')).toBe('original invalid payload');
});
