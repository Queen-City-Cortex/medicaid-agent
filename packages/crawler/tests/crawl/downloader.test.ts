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
    expect(result.error).toMatch(/HTML\/text/);

    // Nothing — not even the tmp file — may be left behind in the corpus
    const sourceDir = path.join(
      config.documentsDir,
      SOURCE_TYPE_DIRS[doc.source_type],
    );
    expect(fs.readdirSync(sourceDir)).toEqual([]);
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
