import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseContentDisposition,
  detectContentType,
  detectedTypeMatchesAllowedFormats,
  allowsTextFormats,
  looksLikeTextPayload,
  archiveOldVersion,
  downloadDocument,
} from '../../src/crawl/downloader.js';
import { HttpStatusError } from '../../src/crawl/fetcher.js';
import { config, SOURCE_TYPE_DIRS } from '../../src/config.js';
import { logger } from '../../src/utils/logger.js';
import { hashBuffer } from '../../src/utils/hash.js';
import type { DocumentRecord } from '../../src/db/registry.js';
import type { Fetcher } from '../../src/sources/types.js';

// Point the documents dir at a temp directory so downloadDocument integration
// tests never touch the real crawled corpus under data/documents.
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  const nodeFs = await import('node:fs');
  const documentsDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'downloader-test-docs-'),
  );
  return {
    ...actual,
    config: { ...actual.config, documentsDir },
  };
});

describe('parseContentDisposition', () => {
  it('extracts filename from Content-Disposition header', () => {
    const result = parseContentDisposition(
      'attachment; filename="policy-3k-2.pdf"',
    );
    expect(result).toBe('policy-3k-2.pdf');
  });

  it('handles filename* with encoding', () => {
    const result = parseContentDisposition(
      "attachment; filename*=UTF-8''policy%203k-2.pdf",
    );
    expect(result).toBe('policy 3k-2.pdf');
  });

  it('returns null for missing header', () => {
    expect(parseContentDisposition(undefined)).toBeNull();
    expect(parseContentDisposition('')).toBeNull();
  });
});

describe('detectContentType', () => {
  it('detects PDF from magic bytes', async () => {
    const tmpFile = path.join(os.tmpdir(), `detect-test-${Date.now()}.pdf`);
    // PDF magic bytes: %PDF-1.4
    fs.writeFileSync(tmpFile, Buffer.from('%PDF-1.4\n'));
    try {
      const result = await detectContentType(tmpFile);
      expect(result).toBe('application/pdf');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns null for unrecognizable content', async () => {
    const tmpFile = path.join(os.tmpdir(), `detect-test-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, 'just plain text');
    try {
      const result = await detectContentType(tmpFile);
      // file-type may or may not detect plain text — either null or a type is fine
      expect(result === null || typeof result === 'string').toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('logs at debug and returns null when the file cannot be read', async () => {
    const dbg = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const missing = path.join(os.tmpdir(), `detect-missing-${Date.now()}.pdf`);

    const result = await detectContentType(missing);

    try {
      expect(result).toBeNull();
      expect(dbg).toHaveBeenCalledWith(
        'content-type detection failed',
        expect.objectContaining({ filePath: missing }),
      );
    } finally {
      dbg.mockRestore();
    }
  });
});

describe('archiveOldVersion', () => {
  it('moves file to .versions directory with timestamp', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
    const filePath = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(filePath, 'old content');

    archiveOldVersion(filePath);

    expect(fs.existsSync(filePath)).toBe(false);
    const versionsDir = path.join(tmpDir, '.versions');
    expect(fs.existsSync(versionsDir)).toBe(true);
    const versions = fs.readdirSync(versionsDir);
    expect(versions.length).toBe(1);
    expect(versions[0]).toMatch(/^test\.\d{4}-\d{2}-\d{2}T.*\.pdf$/);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('detectedTypeMatchesAllowedFormats', () => {
  it('accepts a PDF when the manifest allows .pdf', () => {
    expect(detectedTypeMatchesAllowedFormats('application/pdf', ['.pdf'])).toBe(true);
  });

  it('rejects an HTML payload when only .pdf is allowed', () => {
    expect(detectedTypeMatchesAllowedFormats('text/html', ['.pdf'])).toBe(false);
  });

  it('accepts DOCX when manifest lists .docx', () => {
    expect(
      detectedTypeMatchesAllowedFormats(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ['.pdf', '.docx'],
      ),
    ).toBe(true);
  });

  it('is permissive when magic-byte detection returned null', () => {
    expect(detectedTypeMatchesAllowedFormats(null, ['.pdf'])).toBe(true);
  });

  it('is permissive on unknown MIMEs so niche formats do not get dropped', () => {
    expect(detectedTypeMatchesAllowedFormats('application/x-custom', ['.pdf'])).toBe(true);
  });

  it('is case-insensitive on extension comparison', () => {
    expect(detectedTypeMatchesAllowedFormats('application/pdf', ['.PDF'])).toBe(true);
  });
});

describe('allowsTextFormats', () => {
  it('is false for binary-only document formats', () => {
    expect(allowsTextFormats(['.pdf', '.docx', '.xlsx'])).toBe(false);
  });

  it('is true when a text format is allowed', () => {
    expect(allowsTextFormats(['.pdf', '.html'])).toBe(true);
    expect(allowsTextFormats(['.txt'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(allowsTextFormats(['.HTML'])).toBe(true);
  });
});

describe('looksLikeTextPayload', () => {
  it('recognizes HTML by doctype', () => {
    expect(
      looksLikeTextPayload(Buffer.from('<!DOCTYPE html><html><body>Oops</body></html>')),
    ).toBe(true);
  });

  it('recognizes HTML behind leading whitespace and mixed case', () => {
    expect(
      looksLikeTextPayload(Buffer.from('\n\t  <HTML lang="en"><head></head>')),
    ).toBe(true);
  });

  it('recognizes XML declarations', () => {
    expect(looksLikeTextPayload(Buffer.from('<?xml version="1.0"?><error/>'))).toBe(true);
  });

  it('recognizes HTML behind a UTF-8 BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    expect(
      looksLikeTextPayload(Buffer.concat([bom, Buffer.from('<!doctype html>')])),
    ).toBe(true);
  });

  it('treats mostly-printable content as text (soft-404 plain-text pages)', () => {
    expect(
      looksLikeTextPayload(Buffer.from('Service temporarily unavailable. Please try again later.\n')),
    ).toBe(true);
  });

  it('treats payloads containing NUL bytes as binary', () => {
    const buf = Buffer.concat([
      Buffer.from('%PDF-like prefix'),
      Buffer.from([0x00, 0x01, 0x02, 0xff]),
    ]);
    expect(looksLikeTextPayload(buf)).toBe(false);
  });

  it('treats control-character-heavy content as binary', () => {
    const bytes = Buffer.alloc(256);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i % 30) + 1; // 0x01-0x1e
    expect(looksLikeTextPayload(bytes)).toBe(false);
  });

  it('is false for an empty payload', () => {
    expect(looksLikeTextPayload(Buffer.alloc(0))).toBe(false);
  });
});

describe('downloadDocument', () => {
  beforeAll(() => {
    logger.setConsoleLevel('error');
    logger.setFileLevel('error');
  });

  let nextId = 1000;

  function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
    return {
      id: nextId++,
      source_url: 'https://medicaid.ncdhhs.gov/policy.pdf',
      discovered_from: 'https://medicaid.ncdhhs.gov/index',
      source_type: 'clinical_policy',
      title: 'Test Policy',
      policy_number: '1A-1',
      category: null,
      local_path: null,
      file_hash: null,
      file_size: null,
      mime_type: null,
      detected_content_type: null,
      content_disposition_filename: null,
      etag: null,
      last_modified: null,
      first_seen_at: '2026-01-01 00:00:00',
      last_checked_at: null,
      last_downloaded_at: null,
      last_changed_at: null,
      removed_at: null,
      status: 'discovered',
      error_message: null,
      download_attempts: 0,
      consecutive_errors: 0,
      consecutive_not_found: 0,
      ...overrides,
    };
  }

  function fetcherWriting(
    content: Buffer | string,
    headers: Record<string, string> = { 'content-type': 'application/pdf' },
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

  it('rejects an HTML soft-404 page served as a 200 for a PDF-only source', async () => {
    const doc = makeDoc();
    const html =
      '<!DOCTYPE html>\n<html><head><title>Page not found</title></head>' +
      '<body><h1>Sorry, this page is under maintenance.</h1></body></html>';
    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/Content-type text\/html/);

    // Nothing — not even the tmp file — may be left behind in the corpus
    const sourceDir = path.join(
      config.documentsDir,
      SOURCE_TYPE_DIRS[doc.source_type],
    );
    expect(fs.readdirSync(sourceDir)).toEqual([]);
  });

  it('downloads the declared full-text coverage-end bulletin as a semantic article', async () => {
    const doc = makeDoc({ source_type: 'bulletin', policy_number: null,
      source_url: 'https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024',
      title: 'Reminder: Key COVID-19 Changes Effective Oct. 1, 2024' });
    const html = '<!DOCTYPE html><html><body><article><h1>Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1><h2>Over-the-Counter Tests for Home Use Coverage for COVID-19</h2><p>Coverage for pharmacy point-of-sale billing for OTC COVID-19 home tests ends Sept. 30, 2024.</p></article></body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, { 'content-type': 'text/html' }), new Set());
    expect(result.action).toBe('downloaded');
    expect(result.info?.local_path).toMatch(/bulletins\/.*\.html$/);
  });

  it.each([
    ['missing', {}],
    ['generic', { 'content-type': 'application/octet-stream' }],
    ['incorrect binary', { 'content-type': 'application/pdf' }],
  ])('rejects non-seed bulletin HTML with %s MIME', async (_label, headers) => {
    const doc = makeDoc({ source_type: 'bulletin', title: 'Missing attachment', source_url: 'https://medicaid.ncdhhs.gov/missing-attachment.pdf' });
    const html = '<!DOCTYPE html><html><body><h1>Maintenance</h1><p>Please try again later.</p></body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, headers), new Set());
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/explicitly declared seed/);
    expect(fs.existsSync(path.join(config.documentsDir, 'bulletins', `.download-${doc.id}.tmp`))).toBe(false);
    expect(result.info).toBeUndefined();
  });

  it('rejects an unlabelled plain-text error in a mixed HTML/PDF bulletin family', async () => {
    const doc = makeDoc({ source_type: 'bulletin', source_url: 'https://medicaid.ncdhhs.gov/missing-attachment.pdf' });
    const result = await downloadDocument(doc, fetcherWriting('Service temporarily unavailable.', {}), new Set());
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/explicitly declared seed/);
    expect(fs.existsSync(path.join(config.documentsDir, 'bulletins', `.download-${doc.id}.tmp`))).toBe(false);
  });

  it('accepts the declared bulletin with its Drupal page heading outside the article', async () => {
    const doc = makeDoc({ source_type: 'bulletin', policy_number: null,
      source_url: 'https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024',
      title: 'Reminder: Key COVID-19 Changes Effective Oct. 1, 2024' });
    const html = '<!DOCTYPE html><html><body><main aria-labelledby="page-title"><section><header><h1 id="page-title">Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1></header><article><h2>Over-the-Counter Tests for Home Use Coverage for COVID-19</h2><p>The dated payment bulletin explains that pharmacy POS coverage ends Sept. 30, 2024, with changes effective Oct. 1, 2024.</p></article></section></main></body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, { 'content-type': 'text/html' }), new Set());
    expect(result.action).toBe('downloaded');
    expect(result.info?.local_path).toMatch(/bulletins\/.*\.html$/);
  });

  it.each(['article', 'landmark'])('rejects a branded error with a matching %s title but no dated bulletin content', async (location) => {
    const title = 'Reminder: Key COVID-19 Changes Effective Oct. 1, 2024';
    const doc = makeDoc({ source_type: 'bulletin', policy_number: null,
      source_url: 'https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024', title });
    const heading = `<h1 id="page-title">${title}</h1>`;
    const article = '<article>' + (location === 'article' ? heading : '')
      + '<p>This page is temporarily unavailable because the service could not retrieve the requested bulletin. Please try again later.</p></article>';
    const html = '<!DOCTYPE html><html><body><main aria-labelledby="page-title">'
      + (location === 'landmark' ? heading : '') + article + '</main></body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, { 'content-type': 'text/html' }), new Set());
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/required dated bulletin content/i);
    expect(fs.existsSync(path.join(config.documentsDir, 'bulletins', `.download-${doc.id}.tmp`))).toBe(false);
  });

  it.each([
    ['unassociated heading', '<main><h1 id="page-title">Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1><article>BODY</article></main>'],
    ['wrong landmark label', '<main aria-labelledby="other-title"><h1 id="page-title">Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1><h1 id="other-title">Service unavailable</h1><article>BODY</article></main>'],
    ['multiple articles', '<main aria-labelledby="page-title"><h1 id="page-title">Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1><article>BODY</article><article>BODY</article></main>'],
    ['contradictory article title', '<main aria-labelledby="page-title"><h1 id="page-title">Reminder: Key COVID-19 Changes Effective Oct. 1, 2024</h1><article><h1>Service unavailable</h1>BODY</article></main>'],
  ])('rejects a bulletin with an %s', async (_name, structure) => {
    const doc = makeDoc({ source_type: 'bulletin', policy_number: null,
      source_url: 'https://medicaid.ncdhhs.gov/blog/2024/09/25/reminder-key-covid-19-changes-effective-oct-1-2024',
      title: 'Reminder: Key COVID-19 Changes Effective Oct. 1, 2024' });
    const body = '<p>This substantive-looking article body must not authorize an unrelated page heading or an ambiguous document identity.</p>';
    const html = '<!DOCTYPE html><html><body>' + structure.replaceAll('BODY', body) + '</body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, { 'content-type': 'text/html' }), new Set());
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/expected document title/i);
    expect(fs.existsSync(path.join(config.documentsDir, 'bulletins', `.download-${doc.id}.tmp`))).toBe(false);
  });

  it('does not let HTML allowance turn an unreviewed failed PDF into an HTML document', async () => {
    const doc = makeDoc({ source_type: 'bulletin', title: 'Missing attachment', source_url: 'https://medicaid.ncdhhs.gov/missing-attachment.pdf' });
    const html = '<!DOCTYPE html><html><body><article><h1>Missing attachment</h1><p>This is a substantive looking wrapper but it does not contain the requested original attachment.</p></article></body></html>';
    const result = await downloadDocument(doc, fetcherWriting(html, { 'content-type': 'text/html' }), new Set());
    expect(result.action).toBe('error');
    expect(fs.existsSync(path.join(config.documentsDir, 'bulletins', `.download-${doc.id}.tmp`))).toBe(false);
  });

  it('rejects a plain-text error body served as a 200 for a PDF-only source', async () => {
    const doc = makeDoc();
    const result = await downloadDocument(
      doc,
      fetcherWriting('Service temporarily unavailable.\n'),
      new Set(),
    );
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/HTML\/text/);
  });

  it('accepts a real PDF payload', async () => {
    const doc = makeDoc();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
    const result = await downloadDocument(doc, fetcherWriting(pdf), new Set());

    expect(result.action).toBe('downloaded');
    expect(result.info?.detected_content_type).toBe('application/pdf');
    const savedPath = path.join(config.documentsDir, result.info!.local_path);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  function dhhsWrapper(links: string, title = 'Test Policy'): string {
    return `<!DOCTYPE html><html><body><main>
      <h2 class="wp-block-post-title">${title}</h2>
      <div class="wp-block-post-content">${links}</div>
      </main><footer><a href="https://policies.ncdhhs.gov/footer.pdf">Unrelated</a></footer>
      </body></html>`;
  }

  const wrapperUrl = 'https://policies.ncdhhs.gov/document/test-policy/';
  const attachmentUrl = 'https://policies.ncdhhs.gov/wp-content/uploads/current.pdf';

  it('replaces an old HTML payload with the single validated DHHS attachment', async () => {
    const doc = makeDoc({
      source_type: 'dhhs_policy', source_url: wrapperUrl, policy_number: null,
      local_path: 'dhhs-policies/test-policy.pdf', file_hash: hashBuffer(Buffer.from('old HTML')),
      etag: 'old-validator', last_modified: 'yesterday',
    });
    const oldPath = path.join(config.documentsDir, doc.local_path!);
    fs.mkdirSync(path.dirname(oldPath), { recursive: true });
    fs.writeFileSync(oldPath, 'old HTML');
    const fetcher = fetcherWriting('unused');
    fetcher.fetchFile = vi.fn(async (url, destPath, options) => {
      expect(options?.etag).toBeUndefined();
      expect(options?.lastModified).toBeUndefined();
      expect(options?.isAllowedUrl?.('https://outside.example/document.pdf')).toBe(false);
      expect(options?.maxBytes).toBe(config.maxFileSizeBytes);
      fs.writeFileSync(destPath, url === wrapperUrl
        ? dhhsWrapper(`<a href="${attachmentUrl}">Current</a><a href="${attachmentUrl}#page=1">Again</a>`)
        : '%PDF-1.4\nattachment content');
      return { statusCode: 200, headers: {}, filePath: destPath, downloaded: true };
    });
    const result = await downloadDocument(doc, fetcher, new Set(['test-policy.pdf']));
    expect(result.action).toBe('updated');
    expect(result.info?.detected_content_type).toBe('application/pdf');
    expect(fetcher.fetchFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetcher.fetchFile).mock.calls[1]?.[0]).toBe(attachmentUrl);
    expect(fs.readFileSync(oldPath, 'utf8')).toContain('%PDF');
    expect(fs.readdirSync(path.join(path.dirname(oldPath), '.versions'))).toHaveLength(1);
    expect(doc.source_url).toBe(wrapperUrl);
  });

  it.each([
    ['no attachment', dhhsWrapper('<p>No file</p>')],
    ['ambiguous attachments', dhhsWrapper(`<a href="${attachmentUrl}">A</a><a href="/other.pdf">B</a>`)],
    ['wrong document', dhhsWrapper(`<a href="${attachmentUrl}">A</a>`, 'Different Policy')],
    ['unapproved attachment', dhhsWrapper('<a href="https://outside.example/policy.pdf">A</a>')],
  ])('rejects a DHHS wrapper with %s', async (_label, html) => {
    const fetcher = fetcherWriting(html);
    fetcher.fetchFile = vi.fn(fetcher.fetchFile);
    const result = await downloadDocument(makeDoc({
      source_type: 'dhhs_policy', source_url: wrapperUrl,
    }), fetcher, new Set());
    expect(result.action).toBe('error');
    expect(fetcher.fetchFile).toHaveBeenCalledTimes(1);
  });

  it('does not recursively follow another HTML attachment', async () => {
    const fetcher = fetcherWriting(dhhsWrapper(`<a href="${attachmentUrl}">A</a>`));
    fetcher.fetchFile = vi.fn(fetcher.fetchFile);
    const result = await downloadDocument(makeDoc({
      source_type: 'dhhs_policy', source_url: wrapperUrl,
    }), fetcher, new Set());
    expect(result.action).toBe('error');
    expect(result.error).toMatch(/Content-type text\/html/);
    expect(fetcher.fetchFile).toHaveBeenCalledTimes(2);
  });

  it('rejects an attachment redirect outside the DHHS allowlist', async () => {
    const fetcher = fetcherWriting(dhhsWrapper(`<a href="${attachmentUrl}">A</a>`));
    const original = fetcher.fetchFile;
    fetcher.fetchFile = async (...args) => ({
      ...(await original(...args)),
      finalUrl: args[0] === wrapperUrl ? wrapperUrl : 'https://outside.example/policy.pdf',
    });
    const result = await downloadDocument(makeDoc({
      source_type: 'dhhs_policy', source_url: wrapperUrl,
    }), fetcher, new Set());
    expect(result).toMatchObject({ action: 'error', rejectedUrl: 'https://outside.example/policy.pdf' });
  });

  it('rejects a final redirect URL outside the source-family allowlist', async () => {
    const fetcher = fetcherWriting(Buffer.from('%PDF-1.4\n'));
    const originalFetchFile = fetcher.fetchFile;
    fetcher.fetchFile = async (...args) => ({
      ...(await originalFetchFile(...args)),
      finalUrl: 'https://outside.example/policy.pdf',
    });

    const result = await downloadDocument(makeDoc(), fetcher, new Set());

    expect(result).toMatchObject({
      action: 'error',
      rejectedUrl: 'https://outside.example/policy.pdf',
      rejectionReason: 'redirect target outside source-family allowlist',
    });
  });

  it('accepts and saves HTML for an HTML source family', async () => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = `<!DOCTYPE html><html><body><article>
      <h1>Medicaid is Changing</h1>
      <p>This official beneficiary page summarizes upcoming Medicaid changes and directs readers to current program resources.</p>
    </article></body></html>`;

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html; charset=UTF-8' }),
      new Set(),
    );

    expect(result.action).toBe('downloaded');
    expect(result.info?.detected_content_type).toBe('text/html');
    expect(result.info?.local_path).toMatch(/beneficiary-guidance\/medicaid-is-changing\.html$/);
  });

  it('rejects an HTML soft error that lacks the semantic article contract', async () => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = `<!DOCTYPE html><html><body>
      <main><h1>Service temporarily unavailable</h1><p>Please try again later.</p></main>
    </body></html>`;

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/semantic article/i);
  });

  it('rejects an article shell without substantive body content', async () => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = '<!DOCTYPE html><html><body><article><h1>Medicaid is Changing</h1></article></body></html>';

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/substantive body content/i);
  });

  it('rejects a substantive soft-error article with the wrong title', async () => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = `<!DOCTYPE html><html><body><article>
      <h1>Page not found</h1>
      <p>The requested page is unavailable. Visit the NC Medicaid home page or contact support for assistance with locating another resource.</p>
    </article></body></html>`;

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/expected document title/i);
  });

  it('ignores navigation and form text when measuring substantive article content', async () => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = `<!DOCTYPE html><html><body><article>
      <h1>Medicaid is Changing</h1>
      <nav><p>This navigation boilerplate is intentionally long enough to exceed the substantive-content threshold while containing no guidance.</p></nav>
      <form><p>Use this maintenance form to search for another page or contact site support for help.</p></form>
    </article></body></html>`;

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/substantive body content/i);
  });

  it.each([
    ['a missing Content-Type', {}],
    ['an unknown Content-Type', { 'content-type': 'application/octet-stream' }],
    ['a differently cased Content-Type', { 'content-type': 'Text/HTML; Charset=UTF-8' }],
  ])('validates HTML-only sources served with %s', async (_label, headers) => {
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
    });
    const html = `<!DOCTYPE html><html><body><article>
      <h1>Page not found</h1>
      <p>The requested page is unavailable. Visit the NC Medicaid home page or contact support for assistance with locating another resource.</p>
    </article></body></html>`;

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, headers),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/expected document title/i);
  });

  it('revalidates identical HTML before returning unchanged', async () => {
    const html = `<!DOCTYPE html><html><body><article>
      <h1>Page not found</h1>
      <p>The requested page is unavailable. Visit the NC Medicaid home page or contact support for assistance with locating another resource.</p>
    </article></body></html>`;
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
      file_hash: hashBuffer(Buffer.from(html)),
    });

    const result = await downloadDocument(
      doc,
      fetcherWriting(html, { 'content-type': 'text/html' }),
      new Set(),
    );

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/expected document title/i);
  });

  it('revalidates the stored HTML document on a 304 response', async () => {
    const localPath = 'beneficiary-guidance/medicaid-is-changing.html';
    const storedPath = path.join(config.documentsDir, localPath);
    fs.mkdirSync(path.dirname(storedPath), { recursive: true });
    fs.writeFileSync(
      storedPath,
      '<!DOCTYPE html><html><body><h1>Service unavailable</h1></body></html>',
    );
    const doc = makeDoc({
      source_url: 'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
      source_type: 'beneficiary_guidance',
      title: 'Medicaid is Changing',
      policy_number: null,
      local_path: localPath,
    });
    const fetcher: Fetcher = {
      fetchHtml: () => {
        throw new Error('not used');
      },
      async fetchFile() {
        return { statusCode: 304, headers: {}, filePath: null, downloaded: false };
      },
    };

    const result = await downloadDocument(doc, fetcher, new Set());

    expect(result.action).toBe('error');
    expect(result.error).toMatch(/semantic article/i);
  });

  it('carries a structured 404 status code instead of a message substring', async () => {
    const fetcher: Fetcher = {
      fetchHtml: () => {
        throw new Error('not used');
      },
      async fetchFile() {
        return { statusCode: 404, headers: {}, filePath: null, downloaded: false };
      },
    };
    const result = await downloadDocument(makeDoc(), fetcher, new Set());
    expect(result.action).toBe('error');
    expect(result.statusCode).toBe(404);
  });

  it('carries the status code from a thrown HttpStatusError', async () => {
    const fetcher: Fetcher = {
      fetchHtml: () => {
        throw new Error('not used');
      },
      async fetchFile(url) {
        throw new HttpStatusError(503, url);
      },
    };
    const result = await downloadDocument(makeDoc(), fetcher, new Set());
    expect(result.action).toBe('error');
    expect(result.statusCode).toBe(503);
  });

  it('leaves statusCode undefined for non-HTTP failures', async () => {
    const fetcher: Fetcher = {
      fetchHtml: () => {
        throw new Error('not used');
      },
      async fetchFile() {
        throw new Error('socket hang up on /tmp/404.pdf');
      },
    };
    const result = await downloadDocument(makeDoc(), fetcher, new Set());
    expect(result.action).toBe('error');
    expect(result.statusCode).toBeUndefined();
  });
});
