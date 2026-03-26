import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseClinicalPoliciesPage,
  parsePolicyTitle,
} from '../../src/sources/clinical-policies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  path.join(__dirname, '../fixtures/clinical-policies.html'),
  'utf8',
);

const INDEX_URL =
  'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies';

describe('parsePolicyTitle', () => {
  it('extracts policy number before first comma', () => {
    const result = parsePolicyTitle('1N-1, Allergy Testing');
    expect(result.policy_number).toBe('1N-1');
    expect(result.title).toBe('Allergy Testing');
  });

  it('handles numeric-only policy numbers', () => {
    const result = parsePolicyTitle('15, Ambulance Services');
    expect(result.policy_number).toBe('15');
    expect(result.title).toBe('Ambulance Services');
  });

  it('handles alphanumeric policy numbers like 8A', () => {
    const result = parsePolicyTitle('8A, Enhanced Mental Health and Substance Abuse Services');
    expect(result.policy_number).toBe('8A');
    expect(result.title).toBe('Enhanced Mental Health and Substance Abuse Services');
  });

  it('returns null policy_number when no comma present', () => {
    const result = parsePolicyTitle('No Comma Title Here');
    expect(result.policy_number).toBeNull();
    expect(result.title).toBe('No Comma Title Here');
  });

  it('returns null policy_number when text before comma is too long', () => {
    const result = parsePolicyTitle('This is a very long prefix text, rest of title');
    expect(result.policy_number).toBeNull();
  });
});

describe('parseClinicalPoliciesPage', () => {
  const docs = parseClinicalPoliciesPage(fixtureHtml, INDEX_URL);

  it('discovers more than 50 documents', () => {
    expect(docs.length).toBeGreaterThan(50);
  });

  it('discovers the expected ~120+ documents', () => {
    // The real page has ~177 download links
    expect(docs.length).toBeGreaterThan(100);
  });

  it('all results have source_url containing /download', () => {
    for (const doc of docs) {
      expect(doc.source_url).toContain('/download');
    }
  });

  it('all results have source_type of clinical_policy', () => {
    for (const doc of docs) {
      expect(doc.source_type).toBe('clinical_policy');
    }
  });

  it('all results have discovered_from set to the index URL', () => {
    for (const doc of docs) {
      expect(doc.discovered_from).toBe(INDEX_URL);
    }
  });

  it('all results have absolute source_urls starting with https', () => {
    for (const doc of docs) {
      expect(doc.source_url).toMatch(/^https:\/\//);
    }
  });

  it('many results have a policy_number extracted', () => {
    const withPolicyNumber = docs.filter((d) => d.policy_number !== null);
    expect(withPolicyNumber.length).toBeGreaterThan(50);
  });

  it('some results have categories extracted', () => {
    const withCategory = docs.filter((d) => d.category !== null);
    expect(withCategory.length).toBeGreaterThan(20);
  });

  it('no duplicate source_urls', () => {
    const urls = docs.map((d) => d.source_url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it('all results have a non-empty title', () => {
    for (const doc of docs) {
      expect(doc.title).toBeTruthy();
    }
  });

  it('finds known documents like allergy testing', () => {
    const allergyDoc = docs.find((d) =>
      d.source_url.includes('allergy-testing'),
    );
    expect(allergyDoc).toBeDefined();
    expect(allergyDoc?.policy_number).toBe('1N-1');
    expect(allergyDoc?.category).toBe('Allergies');
  });

  it('finds known documents like ambulance services', () => {
    const ambulanceDoc = docs.find((d) =>
      d.source_url.includes('ambulance'),
    );
    expect(ambulanceDoc).toBeDefined();
    expect(ambulanceDoc?.policy_number).toBe('15');
    expect(ambulanceDoc?.category).toBe('Ambulance');
  });
});
