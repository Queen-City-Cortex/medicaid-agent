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
