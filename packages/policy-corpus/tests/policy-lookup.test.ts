import { describe, it, expect, vi } from 'vitest';
import { candidatePolicyNumbers, createPolicyLookupPrimitiveService } from '../src/primitives/policy-lookup.js';

describe('candidatePolicyNumbers', () => {
  it('passes state policy numbers through unchanged', () => {
    expect(candidatePolicyNumbers('8C')).toEqual(['8C']);
    expect(candidatePolicyNumbers('1A-1')).toEqual(['1A-1']);
  });

  it('normalizes spaced CFR citations to the stored hyphenated form', () => {
    expect(candidatePolicyNumbers('42 CFR 440')).toEqual(['42 CFR 440', '42-CFR-440']);
  });

  it('normalizes dotted C.F.R. citations and section-level cites to the part', () => {
    expect(candidatePolicyNumbers('42 C.F.R. § 440.230')).toContain('42-CFR-440');
    expect(candidatePolicyNumbers('45 cfr part 75')).toContain('45-CFR-75');
  });

  it('keeps already-hyphenated federal citations matching', () => {
    expect(candidatePolicyNumbers('42-CFR-440')).toContain('42-CFR-440');
  });

  it('normalizes SSA title citations', () => {
    expect(candidatePolicyNumbers('SSA Title 19')).toContain('SSA-Title-19');
    expect(candidatePolicyNumbers('ssa title 19')).toContain('SSA-Title-19');
  });

  it('adds the stored State Plan Amendment shape for bare and NC-prefixed numbers', () => {
    for (const asked of ['24-0028', 'NC-24-0028', 'NC 24-0028', 'SPA NC 24-0028', 'spa 24-0028']) {
      expect(candidatePolicyNumbers(asked)).toContain('SPA 24-0028');
    }
    // A clinical policy number is not an amendment number.
    expect(candidatePolicyNumbers('1A-30')).toEqual(['1A-30']);
  });

  it('returns no candidates for empty or whitespace input', () => {
    expect(candidatePolicyNumbers('')).toEqual([]);
    expect(candidatePolicyNumbers('   ')).toEqual([]);
  });
});

describe('createPolicyLookupPrimitiveService', () => {
  it('short-circuits empty input without touching the database', async () => {
    const withSession = vi.fn();
    const service = createPolicyLookupPrimitiveService({ withSession });
    const result = await service.lookupPolicy({ policyNumber: '  ' });
    expect(result).toEqual([]);
    expect(withSession).not.toHaveBeenCalled();
  });

  it('queries with all candidate forms and caps results', async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const withSession = vi.fn(async (fn: (session: { run: typeof run }) => Promise<unknown>) => fn({ run }));
    const service = createPolicyLookupPrimitiveService({ withSession: withSession as any });

    await service.lookupPolicy({ policyNumber: '42 CFR 440' });

    const [cypher, params] = run.mock.calls[0];
    expect(params.pns).toEqual(['42 CFR 440', '42-CFR-440']);
    expect(cypher).toContain('LIMIT 25');
  });
});
