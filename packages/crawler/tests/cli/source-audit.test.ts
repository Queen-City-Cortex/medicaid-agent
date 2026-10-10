import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { createRegistry } from '../../src/db/registry.js';
import { collectAudit } from '../../src/cli/source-audit.js';

const { fetchEvidence } = vi.hoisted(() => ({ fetchEvidence: vi.fn() }));
vi.mock('../../src/cli/shared.js', () => ({ buildFetcher: () => ({ fetchEvidence, setCrawlDelay: vi.fn() }) }));
vi.mock('../../src/crawl/robots.js', () => ({ createRobotsChecker: () => ({ fetchAndCache: vi.fn(), getCrawlDelay: () => null, isAllowed: () => true }) }));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });
describe('resumable private source evidence', () => {
  it('reuses captured requests without additional availability checks and rejects tampering', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-audit-')); roots.push(root);
    const db = new Database(':memory:'); initializeSchema(db);
    const registry = createRegistry(db);
    const url = 'https://policies.ncdhhs.gov/document/missing/';
    const id = registry.upsertDiscovered({ source_url: url, discovered_from: 'https://policies.ncdhhs.gov/', source_type: 'dhhs_policy', title: 'Missing form', policy_number: null, category: null });
    const row = registry.getById(id)!;
    fetchEvidence.mockImplementation(async (url: string) => ({ body: Buffer.from('official missing response'), statusCode: 404, headers: { 'content-type': 'text/html' }, finalUrl: url, redirects: [] }));
    const first = await collectAudit({ documents: [row] }, root);
    const requests = fetchEvidence.mock.calls.length;
    await collectAudit({ documents: [row] }, root);
    expect(fetchEvidence).toHaveBeenCalledTimes(requests);
    expect(registry.getById(id)).toEqual(row);
    fs.writeFileSync(path.join(root, first.captures[url].capture_path!), 'tampered');
    await expect(collectAudit({ documents: [row] }, root)).rejects.toThrow('changed');
    db.close();
  });
});

it('preserves exhausted DNS evidence and marks other host links unvisited', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-audit-')); roots.push(root);
  const db = new Database(':memory:'); initializeSchema(db);
  const registry = createRegistry(db);
  const url = 'https://policies.ncdhhs.gov/document/missing/';
  const id = registry.upsertDiscovered({ source_url: url, discovered_from: 'https://policies.ncdhhs.gov/', source_type: 'dhhs_policy', title: 'Missing form', policy_number: null, category: null });
  fetchEvidence.mockRejectedValue(new Error('getaddrinfo ENOTFOUND policies.ncdhhs.gov'));
  const result = await collectAudit({ documents: [registry.getById(id)!] }, root);
  expect(fetchEvidence).toHaveBeenCalledTimes(1);
  expect(result.captures['https://policies.ncdhhs.gov/'].blocked_by).toBe(url);
  expect(result.captures['https://policies.ncdhhs.gov/'].status_code).toBeUndefined();
  await collectAudit({ documents: [registry.getById(id)!] }, root);
  expect(fetchEvidence).toHaveBeenCalledTimes(1);
  db.close();
});

it('collects the archive index for a selected address and no other archive request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-audit-')); roots.push(root);
  const db = new Database(':memory:'); initializeSchema(db);
  const registry = createRegistry(db);
  const url = 'https://policies.ncdhhs.gov/form/download?attachment=';
  // Another selected document comes first: every entry shares the extra addresses.
  const first = registry.upsertDiscovered({ source_url: 'https://policies.ncdhhs.gov/document/unrelated/', discovered_from: 'https://policies.ncdhhs.gov/', source_type: 'dhhs_policy', title: 'Unrelated', policy_number: null, category: null });
  const id = registry.upsertDiscovered({ source_url: url, discovered_from: 'https://policies.ncdhhs.gov/', source_type: 'dhhs_policy', title: 'Form', policy_number: null, category: null });
  const index = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('https://policies.ncdhhs.gov/form/download?attachment')}&output=json`;
  const otherIndex = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('https://policies.ncdhhs.gov/other/')}&output=json`;
  const capture = 'https://web.archive.org/web/20230326222414id_/https://policies.ncdhhs.gov/form/download?attachment';
  const allowed: Record<string, boolean> = {};
  fetchEvidence.mockImplementation(async (requested: string, _max: number, isAllowedUrl: (candidate: string) => boolean) => {
    allowed[requested] = isAllowedUrl(requested);
    // A redirect from the index to anywhere else on the archive is not the index.
    expect(isAllowedUrl(capture)).toBe(false);
    return { body: Buffer.from('[]'), statusCode: 200, headers: { 'content-type': 'application/json' }, finalUrl: requested, redirects: [] };
  });
  await collectAudit({ documents: [registry.getById(first)!, registry.getById(id)!], urls: [index, otherIndex, capture] }, root);
  const archive = Object.entries(allowed).filter(([requested]) => requested.includes('web.archive.org'));
  const kind = (requested: string) => !requested.includes('/cdx/') ? 'capture' : requested.includes('other') ? 'other index' : 'index';
  expect(archive.map(([requested, permitted]) => [kind(requested), permitted]).sort())
    .toEqual([['capture', false], ['index', true], ['other index', false]]);
  expect(allowed[url]).toBe(true);
});
