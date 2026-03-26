import { describe, it, expect } from 'vitest';
import { slugify, buildFilename } from '../../src/utils/naming.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('CAP/DA (3K-2)')).toBe('capda-3k-2');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a - b -- c')).toBe('a-b-c');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

describe('buildFilename', () => {
  it('prefixes with policy number when available', () => {
    const result = buildFilename({
      policyNumber: '3K-2',
      title: 'Community Alternatives Program for Disabled Adults (CAP/DA)',
      extension: '.pdf',
    });
    expect(result).toBe(
      '3k-2_community-alternatives-program-for-disabled-adults-capda.pdf',
    );
  });

  it('uses title only when no policy number', () => {
    const result = buildFilename({
      policyNumber: null,
      title: 'Some Waiver Document',
      extension: '.pdf',
    });
    expect(result).toBe('some-waiver-document.pdf');
  });

  it('truncates to max 100 characters', () => {
    const longTitle = 'A'.repeat(200);
    const result = buildFilename({
      policyNumber: null,
      title: longTitle,
      extension: '.pdf',
    });
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toMatch(/\.pdf$/);
  });

  it('handles missing title with fallback', () => {
    const result = buildFilename({
      policyNumber: null,
      title: null,
      extension: '.pdf',
    });
    expect(result).toBe('unknown-document.pdf');
  });

  it('appends numeric suffix for collisions', () => {
    const result = buildFilename({
      policyNumber: '3K-2',
      title: 'Test',
      extension: '.pdf',
      existingNames: new Set(['3k-2_test.pdf']),
    });
    expect(result).toBe('3k-2_test_2.pdf');
  });
});
