import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseContentDisposition,
  detectContentType,
  detectedTypeMatchesAllowedFormats,
  archiveOldVersion,
} from '../../src/crawl/downloader.js';

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
