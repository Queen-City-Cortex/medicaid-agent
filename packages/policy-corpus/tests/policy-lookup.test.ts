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

  it('drops a leading policy cue', () => {
    expect(candidatePolicyNumbers('Policy 8C')).toEqual(['Policy 8C', '8C']);
    expect(candidatePolicyNumbers('Clinical Coverage Policy No. 1-H')).toContain('1-H');
    expect(candidatePolicyNumbers('CCP 3L')).toContain('3L');
    expect(candidatePolicyNumbers('policy 42 CFR 440')).toContain('42-CFR-440');
  });

  it('reduces a manual or form number to the stored prefix and digits', () => {
    expect(candidatePolicyNumbers('DHB-5125B')).toEqual(['DHB-5125B', 'DHB-5125']);
    expect(candidatePolicyNumbers('MA 2180')).toContain('MA-2180');
    expect(candidatePolicyNumbers('ma2180')).toContain('MA-2180');
    expect(candidatePolicyNumbers('MA-3233-A')).toContain('MA-3233');
    expect(candidatePolicyNumbers('MA-2180')).toEqual(['MA-2180']);
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

  it('matches the exact policy-number key and leaves out derived revision rows', async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const withSession = vi.fn(async (fn: (session: { run: typeof run }) => Promise<unknown>) => fn({ run }));
    const service = createPolicyLookupPrimitiveService({ withSession: withSession as any });

    await service.lookupPolicy({ policyNumber: '1A-2' });

    const where = (run.mock.calls[0][0] as string).replace(/\s+/g, ' ').match(/WHERE (.*?) OPTIONAL MATCH/)?.[1];
    expect(where).toBe(
      "coalesce(d.document_type, '') <> 'change_notice' AND any(pn IN $pns WHERE " +
        "replace(replace(toUpper(d.policy_number), '-', ''), ' ', '') = replace(replace(toUpper(pn), '-', ''), ' ', ''))",
    );
    // A prefix match returned 1A-20 to 1A-28 for "1A-2".
    expect(run.mock.calls[0][0]).not.toContain('STARTS WITH');
    // An any() sort key after the aggregating RETURN fails on Neo4j 2026.05.
    expect((run.mock.calls[0][0] as string).split('ORDER BY')[1]).not.toContain('any(');
  });

  it('lists the form the caller typed first', async () => {
    const record = (id: string, title: string) => ({
      get: (key: string) => ({ id, title, policyNumber: 'DHB-5125', sections: [] } as Record<string, unknown>)[key] ?? null,
    });
    const run = vi.fn().mockResolvedValue({
      records: [record('base', 'DHB-5125 Notice'), record('a', 'DHB-5125A Notice A'), record('b', 'DHB-5125B Notice B')],
    });
    const withSession = vi.fn(async (fn: (session: { run: typeof run }) => Promise<unknown>) => fn({ run }));
    const service = createPolicyLookupPrimitiveService({ withSession: withSession as any });

    const documents = await service.lookupPolicy({ policyNumber: 'DHB-5125B' });

    expect(run.mock.calls[0][1].pns).toEqual(['DHB-5125B', 'DHB-5125']);
    expect(documents.map((document) => document.id)).toEqual(['b', 'base', 'a']);
  });
});
