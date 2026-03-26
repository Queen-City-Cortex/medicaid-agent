import { describe, it, expect } from 'vitest';
import { hashFile, hashBuffer } from '../../src/utils/hash.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('hashBuffer', () => {
  it('returns SHA-256 hex digest of a buffer', () => {
    const result = hashBuffer(Buffer.from('hello world'));
    expect(result).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('returns different hash for different content', () => {
    const a = hashBuffer(Buffer.from('hello'));
    const b = hashBuffer(Buffer.from('world'));
    expect(a).not.toBe(b);
  });
});

describe('hashFile', () => {
  it('returns SHA-256 hex digest of a file', async () => {
    const tmpFile = path.join(os.tmpdir(), `hash-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hello world');
    try {
      const result = await hashFile(tmpFile);
      expect(result).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
