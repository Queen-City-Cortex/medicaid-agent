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
import { digest, stableJson } from '../../src/cli/source-audit.js';
import * as sourceAudit from '../../src/cli/source-audit.js';
import { archiveFetcher, readRelocationEvidence, relocationFetcher } from '../../src/cli/relocation-evidence.js';
import { reconcileDocuments } from '../../src/cli/reconcile.js';

vi.mock('../../src/cli/shared.js', async original => ({ ...await original<typeof import('../../src/cli/shared.js')>(), buildFetcher: () => ({}) }));
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
async function run(apply = false, args: string[] = []) {
  const program = new Command();
  registerReactivateCommand(program);
  await program.parseAsync(['node', 'crawler', 'reactivate-source', '--url', url, ...args, ...(apply ? ['--apply'] : [])]);
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

const payloadUrl = 'https://policies.ncdhhs.gov/wp-content/uploads/form.pdf';
function relocationArgs() {
  const db = new Database(config.dbPath);
  const row = db.prepare('SELECT * FROM documents WHERE source_url=?').get(url);
  db.close();
  const bytes = Buffer.from(`<a href="${url}">Original</a><a href="${payloadUrl}">Exact relocated form</a>`);
  const directory = path.join(root, 'proof');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'official.html'), bytes);
  const manifest = path.join(directory, 'identity-evidence.json');
  fs.writeFileSync(manifest, JSON.stringify({ schema_version: 1, source_url: url, payload_url: payloadUrl,
    expected_payload_sha256: digest(Buffer.from('%PDF-valid recovery')), reviewed_identity_finding: 'Exact form identity reviewed against official original and migrated attachment links.',
    captures: [{ url: 'https://policies.ncdhhs.gov/index/', final_url: 'https://policies.ncdhhs.gov/index/', status_code: 200, capture_path: 'official.html', sha256: digest(bytes) }] }));
  return ['--payload-url', payloadUrl, '--identity-evidence', manifest, '--expected-registry-hash', digest(stableJson(row)), '--recovery-id', 'reviewed-relocation-1'];
}
function changeProof(args: string[], update: (proof: Record<string, unknown>) => void) {
  const file = args[args.indexOf('--identity-evidence') + 1]!;
  const proof = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  update(proof); fs.writeFileSync(file, JSON.stringify(proof));
}
it('recovers a reviewed relocation while preserving original URL, version and durable proof', async () => {
  const args = relocationArgs();
  await run(true, args);
  await run(true, args);
  const db = new Database(config.dbPath);
  expect(db.prepare('SELECT source_url,status,download_attempts FROM documents').get()).toEqual({ source_url: url, status: 'downloaded', download_attempts: 1 });
  db.close();
  const retained = path.join(config.documentsDir, '.recovery-evidence');
  const proof = path.join(retained, fs.readdirSync(retained)[0]!, 'identity-evidence.json');
  const original = new Database(config.dbPath);
  const doc = createRegistry(original).getByUrl(url)!; original.close();
  expect(readRelocationEvidence(proof, doc, payloadUrl).evidence.source_url).toBe(url);
  expect(fs.readFileSync(path.join(config.documentsDir, 'dhhs-policies/.versions', fs.readdirSync(path.join(config.documentsDir, 'dhhs-policies/.versions'))[0]!), 'utf8')).toBe('original invalid payload');
});
it('rejects changed reviewed proof even after a successful recovery', async () => {
  const args = relocationArgs(); await run(true, args);
  changeProof(args, proof => { proof.reviewed_identity_finding = 'A changed review'; });
  await expect(run(true, args)).rejects.toThrow('identity evidence changed');
});
it('rejects changed durable proof on a completed replay', async () => {
  const args = relocationArgs(); await run(true, args);
  const directory = path.join(config.documentsDir, '.recovery-evidence');
  const retained = path.join(directory, fs.readdirSync(directory)[0]!, 'official.html');
  fs.appendFileSync(retained, 'corrupted');
  await expect(run(true, args)).rejects.toThrow('capture hash changed');
});
it('requires the original reviewed registry hash on a completed relocation replay', async () => {
  const args = relocationArgs(); await run(true, args); args[5] = 'changed';
  await expect(run(true, args)).rejects.toThrow('registry hash changed');
});
it('preserves relocation proof through reconciliation and replay', async () => {
  const args = relocationArgs(); await run(true, args);
  expect(await reconcileDocuments(true)).toMatchObject({ orphaned: 0, missing: 0, hashMismatch: 0 });
  await run(true, args);
});
it('preserves a retired original during reconciliation without reactivating its identity', async () => {
  expect(await reconcileDocuments(true)).toMatchObject({ orphaned: 0, missing: 0 });
  expect(fs.readFileSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'), 'utf8')).toBe('original invalid payload');
  const db = new Database(config.dbPath);
  expect(db.prepare('SELECT status FROM documents').get()).toEqual({ status: 'removed' }); db.close();
});
it.each(['identity-evidence.json.pending', './identity-evidence.json.pending', './identity-evidence.json'])('reserves manifest paths: %s', async name => {
  const args = relocationArgs();
  changeProof(args, proof => { (proof.captures as Array<Record<string, unknown>>)[0]!.capture_path = name; });
  await expect(run(true, args)).rejects.toThrow('Invalid official identity capture');
});
it('resumes relocated recovery after rename without another download', async () => {
  const args = relocationArgs();
  let db = new Database(config.dbPath); db.exec("CREATE TRIGGER interrupt_recovery BEFORE UPDATE OF status ON documents WHEN NEW.status='downloaded' BEGIN SELECT RAISE(ABORT, 'interrupted'); END"); db.close();
  vi.mocked(downloadDocument).mockClear();
  await expect(run(true, args)).rejects.toThrow('interrupted');
  db = new Database(config.dbPath); db.exec('DROP TRIGGER interrupt_recovery'); db.close();
  await run(true, args); expect(downloadDocument).toHaveBeenCalledTimes(1);
});
it('repairs a completion-marker crash after the registry commit without another attempt', async () => {
  const args = relocationArgs();
  const original = sourceAudit.atomicJson;
  let calls = 0;
  const write = vi.spyOn(sourceAudit, 'atomicJson').mockImplementation((file, value) => {
    if (file.includes('recovery-journal') && ++calls === 2) throw new Error('completion marker interrupted');
    original(file, value);
  });
  try {
    await expect(run(true, args)).rejects.toThrow('completion marker interrupted');
  } finally { write.mockRestore(); }
  vi.mocked(downloadDocument).mockClear();
  await run(true, args);
  expect(downloadDocument).not.toHaveBeenCalled();
  const file = path.join(root, 'recovery-journal', fs.readdirSync(path.join(root, 'recovery-journal'))[0]!);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).completed).toBe(true);
  const db = new Database(config.dbPath); expect(db.prepare('SELECT download_attempts FROM documents').get()).toEqual({ download_attempts: 1 }); db.close();
});
it.each(['pair', 'registry', 'id', 'payloadHash', 'captureHash', 'external', 'path', 'links', 'format', 'collision'])('rejects unsafe relocation: %s', async kind => {
  const args = relocationArgs();
  if (kind === 'pair') args.splice(2, 2);
  if (kind === 'registry') args[5] = 'stale';
  if (kind === 'id') args[7] = 'default';
  if (kind === 'payloadHash') changeProof(args, proof => { proof.expected_payload_sha256 = 'a'.repeat(64); });
  if (kind === 'captureHash') fs.appendFileSync(path.join(root, 'proof/official.html'), 'changed');
  if (kind === 'external') { args[1] = 'https://example.com/form.pdf'; changeProof(args, proof => { proof.payload_url = args[1]; }); }
  if (kind === 'path') changeProof(args, proof => { (proof.captures as Array<Record<string, unknown>>)[0]!.capture_path = '../outside'; });
  if (kind === 'links') {
    fs.writeFileSync(path.join(root, 'proof/official.html'), '<p>No attachment</p>');
    changeProof(args, proof => { (proof.captures as Array<Record<string, unknown>>)[0]!.sha256 = digest('<p>No attachment</p>'); });
  }
  if (kind === 'format') vi.mocked(downloadDocument).mockImplementation(async (_doc, _fetcher, _names, staging) => {
    const bytes = Buffer.from('%PDF-valid recovery'); fs.mkdirSync(path.join(staging!, 'dhhs-policies'), { recursive: true }); fs.writeFileSync(path.join(staging!, 'dhhs-policies/form.html'), bytes);
    return { action: 'downloaded', info: { local_path: 'dhhs-policies/form.html', file_hash: digest(bytes), file_size: bytes.length, mime_type: 'text/html', detected_content_type: 'text/html', content_disposition_filename: null, etag: null, last_modified: null } };
  });
  if (kind === 'collision') { const db = new Database(config.dbPath); db.exec("INSERT INTO documents(source_url,source_type,discovered_from,local_path) VALUES('https://policies.ncdhhs.gov/document/other/','dhhs_policy','https://policies.ncdhhs.gov/','dhhs-policies/form.pdf')"); db.close(); }
  await expect(run(true, args)).rejects.toThrow();
  const db = new Database(config.dbPath); expect(db.prepare('SELECT status FROM documents WHERE source_url=?').get(url)).toEqual({ status: 'removed' }); db.close();
  expect(fs.readFileSync(path.join(config.documentsDir, 'dhhs-policies/form.pdf'), 'utf8')).toBe('original invalid payload');
});
it('blocks unreviewed redirects even inside the same approved source family', async () => {
  const fetchFile = vi.fn(async (_url, _destination, options) => {
    expect(options.isAllowedUrl(payloadUrl)).toBe(true);
    expect(options.isAllowedUrl('https://policies.ncdhhs.gov/other.pdf')).toBe(false);
    return { statusCode: 200, headers: {}, filePath: 'file', downloaded: true, finalUrl: 'https://policies.ncdhhs.gov/other.pdf' };
  });
  const fetcher = relocationFetcher({ fetchHtml: vi.fn(), fetchFile }, payloadUrl);
  await expect(fetcher.fetchFile(payloadUrl, 'file', { isAllowedUrl: () => true })).rejects.toThrow('redirect');
});

// The registry holds `?attachment=`; the archive keys the same address as `?attachment`.
const archivedUrl = 'https://web.archive.org/web/20230326222414id_/https://policies.ncdhhs.gov/document/form/';
function archiveArgs(change: { rows?: string[][]; index?: string; payload?: string } = {}) {
  const db = new Database(config.dbPath);
  const row = db.prepare('SELECT * FROM documents WHERE source_url=?').get(url);
  db.close();
  const rows = change.rows ?? [['timestamp', 'original', 'mimetype', 'statuscode'],
    ['20230326222414', 'https://policies.ncdhhs.gov/document/form/', 'application/pdf', '200'],
    ['20250203002829', 'https://policies.ncdhhs.gov/document/form/', 'text/html', '301']];
  const bytes = Buffer.from(JSON.stringify(rows));
  const directory = path.join(root, 'archive-proof');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'cdx.json'), bytes);
  const index = change.index ?? `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json`;
  const payload = change.payload ?? archivedUrl;
  const manifest = path.join(directory, 'identity-evidence.json');
  fs.writeFileSync(manifest, JSON.stringify({ schema_version: 1, source_url: url, payload_url: payload,
    expected_payload_sha256: digest(Buffer.from('%PDF-valid recovery')), reviewed_identity_finding: 'Archive capture of the exact registered address; two captures a year apart are byte-identical.',
    captures: [{ url: index, final_url: index, status_code: 200, capture_path: 'cdx.json', sha256: digest(bytes) }] }));
  return ['--payload-url', payload, '--identity-evidence', manifest, '--expected-registry-hash', digest(stableJson(row)), '--recovery-id', 'reviewed-archive-1'];
}
it('recovers the archive capture of the exact registered address under its original URL', async () => {
  const args = archiveArgs();
  vi.mocked(downloadDocument).mockClear();
  await run(true, args);
  await run(true, args);
  // The download runs against the registered address, so the family's ordinary payload checks apply.
  expect(vi.mocked(downloadDocument).mock.calls.at(-1)![0].source_url).toBe(url);
  expect(vi.mocked(downloadDocument)).toHaveBeenCalledTimes(1);
  const db = new Database(config.dbPath);
  expect(db.prepare('SELECT source_url,status,download_attempts FROM documents').get()).toEqual({ source_url: url, status: 'downloaded', download_attempts: 1 });
  db.close();
});
it('refuses an archive capture of any other address, a rewritten capture, or another host', async () => {
  for (const payload of [
    'https://web.archive.org/web/20230326222414id_/https://policies.ncdhhs.gov/document/other-form/',
    'https://web.archive.org/web/20230326222414/https://policies.ncdhhs.gov/document/form/',
    'https://web.archive.org/web/2023id_/https://policies.ncdhhs.gov/document/form/',
    'https://archive.example/web/20230326222414id_/https://policies.ncdhhs.gov/document/form/',
  ]) {
    await expect(run(true, archiveArgs({ payload }))).rejects.toThrow('Invalid reviewed relocation identity evidence');
  }
});
it('refuses an archive capture the index does not list as a 200 for this address', async () => {
  const header = ['timestamp', 'original', 'mimetype', 'statuscode'];
  for (const rows of [
    [header, ['20230326222414', 'https://policies.ncdhhs.gov/document/form/', 'text/html', '301']],
    [header, ['20240104235850', 'https://policies.ncdhhs.gov/document/form/', 'application/pdf', '200']],
    [header, ['20230326222414', 'https://policies.ncdhhs.gov/document/other-form/', 'application/pdf', '200']],
  ]) {
    await expect(run(true, archiveArgs({ rows }))).rejects.toThrow('must list the reviewed capture');
  }
  await expect(run(true, archiveArgs({ index: 'https://web.archive.org/cdx/search/cdx?url=https%3A%2F%2Fpolicies.ncdhhs.gov%2Fdocument%2Fother-form%2F&output=json' }))).rejects.toThrow('Invalid archive index capture');
  await expect(run(true, archiveArgs({ index: 'https://policies.ncdhhs.gov/index/' }))).rejects.toThrow('Invalid archive index capture');
});
it('treats an address that differs only by an empty query value as the same address', async () => {
  const db = new Database(config.dbPath);
  const doc = { ...createRegistry(db).getByUrl(url)!, source_url: 'https://policies.ncdhhs.gov/form/download?attachment=' }; db.close();
  const payload = 'https://web.archive.org/web/20230326222414id_/https://policies.ncdhhs.gov/form/download?attachment';
  const bytes = Buffer.from(JSON.stringify([['timestamp', 'original', 'statuscode'], ['20230326222414', 'https://policies.ncdhhs.gov/form/download?attachment', '200']]));
  const directory = path.join(root, 'query-proof'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'cdx.json'), bytes);
  const index = 'https://web.archive.org/cdx/search/cdx?url=' + encodeURIComponent('https://policies.ncdhhs.gov/form/download?attachment') + '&output=json';
  fs.writeFileSync(path.join(directory, 'identity-evidence.json'), JSON.stringify({ schema_version: 1, source_url: doc.source_url, payload_url: payload,
    expected_payload_sha256: digest(Buffer.from('x')), reviewed_identity_finding: 'Reviewed.', captures: [{ url: index, final_url: index, status_code: 200, capture_path: 'cdx.json', sha256: digest(bytes) }] }));
  expect(readRelocationEvidence(path.join(directory, 'identity-evidence.json'), doc, payload).evidence.payload_url).toBe(payload);
});
it('fetches only the reviewed archive capture and reports it as the registered address', async () => {
  const fetchFile = vi.fn(async (_url, _destination, options) => {
    expect(options.isAllowedUrl(archivedUrl)).toBe(true);
    expect(options.isAllowedUrl('https://web.archive.org/web/20240104235850id_/https://policies.ncdhhs.gov/document/form/')).toBe(false);
    expect(options.etag).toBeUndefined();
    return { statusCode: 200, headers: {}, filePath: 'file', downloaded: true, finalUrl: archivedUrl };
  });
  const fetcher = archiveFetcher({ fetchHtml: vi.fn(), fetchFile }, url, archivedUrl);
  expect((await fetcher.fetchFile(url, 'file', { isAllowedUrl: () => false, etag: 'stale' })).finalUrl).toBe(url);
  expect(fetchFile.mock.calls[0]![0]).toBe(archivedUrl);
  await expect(fetcher.fetchFile(archivedUrl, 'file', {})).rejects.toThrow('Unreviewed relocation URL');
  fetchFile.mockResolvedValueOnce({ statusCode: 200, headers: {}, filePath: 'file', downloaded: true, finalUrl: 'https://web.archive.org/web/20230525070331id_/https://policies.ncdhhs.gov/document/form/' });
  await expect(fetcher.fetchFile(url, 'file', {})).rejects.toThrow('redirect');
});
