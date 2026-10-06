import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { downloadDocument } from '../../src/crawl/downloader.js';
import type { DocumentRecord } from '../../src/db/registry.js';
import type { Fetcher } from '../../src/sources/types.js';

// Keep downloads out of the real corpus under data/documents.
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  const nodeFs = await import('node:fs');
  const documentsDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'nc-statute-contract-docs-'),
  );
  return { ...actual, config: { ...actual.config, documentsDir } };
});

const FIXTURES = path.resolve(__dirname, '../fixtures/nc-statutes');
const BASE = 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection';
const URL_108D_14 = `${BASE}/Chapter_108D/GS_108D-14.html`;
const URL_108A_70_9A = `${BASE}/Chapter_108A/GS_108A-70.9A.html`;
const page108D14 = fs.readFileSync(path.join(FIXTURES, 'GS_108D-14.html'));
const page108A709A = fs.readFileSync(path.join(FIXTURES, 'GS_108A-70.9A.html'));

let nextId = 9000;
function makeDoc(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: nextId++,
    source_url: URL_108D_14,
    discovered_from: URL_108D_14,
    source_type: 'nc_statute',
    title: 'N.C.G.S. 108D-14',
    policy_number: '108D-14',
    category: 'North Carolina General Statutes',
    status: 'discovered',
    local_path: null,
    file_hash: null,
    etag: null,
    last_modified: null,
    ...overrides,
  } as DocumentRecord;
}

function fetcherWriting(
  content: Buffer | string,
  headers: Record<string, string> = { 'content-type': 'text/html' },
): Fetcher {
  return {
    fetchHtml: () => {
      throw new Error('not used');
    },
    async fetchFile(_url, destPath) {
      fs.writeFileSync(destPath, content);
      return { statusCode: 200, headers, filePath: destPath, downloaded: true };
    },
  };
}

describe('nc_statute download contract', () => {
  it('accepts the recorded statute pages', async () => {
    for (const [source_url, page] of [
      [URL_108D_14, page108D14],
      [URL_108A_70_9A, page108A709A],
    ] as const) {
      const result = await downloadDocument(
        makeDoc({ source_url }),
        fetcherWriting(page),
        new Set(),
      );
      expect(result.action).toBe('downloaded');
      expect(result.info?.detected_content_type).toBe('text/html');
      expect(result.info?.local_path).toMatch(/nc-statutes\/.+\.html$/);
    }
  });

  it('rejects a maintenance page served with 200', async () => {
    const result = await downloadDocument(
      makeDoc({}),
      fetcherWriting(
        '<!DOCTYPE html><html><head><title>Site Maintenance</title></head>' +
          '<body><h1>We will be back soon</h1><p>The General Assembly website is undergoing maintenance.</p></body></html>',
      ),
      new Set(),
    );
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/G\.S\. 108D-14/);
  });

  it('rejects a real statute page for a different section', async () => {
    const result = await downloadDocument(
      makeDoc({}),
      fetcherWriting(page108A709A),
      new Set(),
    );
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/G\.S\. 108D-14/);
  });

  it('rejects a page whose title matches but whose body lacks the section', async () => {
    const result = await downloadDocument(
      makeDoc({}),
      fetcherWriting(
        '<html><head><title>G.S. 108D-14</title></head><body><p>&sect; 108D-140. Other.</p></body></html>',
      ),
      new Set(),
    );
    expect(result.action).toBe('error');
  });

  it('rejects a non-HTML payload', async () => {
    const result = await downloadDocument(
      makeDoc({}),
      fetcherWriting(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n'), {
        'content-type': 'application/pdf',
      }),
      new Set(),
    );
    expect(result.action).toBe('error');
  });

  it('still rejects statute HTML for a family that takes only PDFs', async () => {
    const result = await downloadDocument(
      makeDoc({
        source_url: 'https://medicaid.ncdhhs.gov/waiver.pdf',
        source_type: 'waiver',
      }),
      fetcherWriting(page108D14),
      new Set(),
    );
    expect(result.action).toBe('error');
  });
});
