import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JEV_MODEL } from '../../src/jev/client.js';
import { jevHash, jevCorpusIdentity, parseSectionRoles, ROLE_SPEC_HASH, SECTION_ROLES, sectionRoleBonus, type SectionRoles } from '../../src/jev/section-roles.js';
import { rankPriorAuthRoles } from '../../src/jev/prior-auth.js';
import { createSectionPrimitiveService } from '../../src/primitives/sections.js';
import { makeSection } from '../helpers/objects.js';
const probs = () => Object.fromEntries(SECTION_ROLES.map(r => [r, .1])) as SectionRoles['probabilities'];
const labels = (overrides: Partial<SectionRoles['probabilities']> = {}): SectionRoles => ({ model: JEV_MODEL, specHash: ROLE_SPEC_HASH, inputHash: 'hash', probabilities: { ...probs(), ...overrides } });
beforeEach(() => vi.stubEnv('JEV_SECTION_ROLE_ALLOWLIST', SECTION_ROLES.join(',')));
afterEach(() => vi.unstubAllEnvs());
describe('section role boundaries', () => {
  it('uses the same Unicode/control/null hash as Python', () => {
    expect(jevHash({ title: 'Café\n"\\\t', sectionNumber: null, documentTitle: '移民', documentType: 'clinical_policy', policyNumber: null, content: 'á\r\n☃' })).toBe('56f300a7e2b1315b994a8717e223c0bd0bc8b3d9c3325a1087f115479e35b62c');
    expect(ROLE_SPEC_HASH).toBe('b88c5ad499e5267b038c558c16093f6195becbf6cfaae39839dd02a2993a92e2');
  });
  it('rejects stale content/spec/model and invalid probabilities', () => {
    expect(parseSectionRoles(labels(), 'hash')).toEqual(labels());
    expect(parseSectionRoles(labels(), 'changed')).toBeUndefined();
    expect(parseSectionRoles({ ...labels(), specHash: 'changed' }, 'hash')).toBeUndefined();
    expect(parseSectionRoles(labels({ scope: 1.01 }), 'hash')).toBeUndefined();
  });
  it('caps multi-role bonuses and preserves disabled parity', () => {
    const section = { sectionRoles: labels({ scope: 1, covered_services: 1, exclusions: 1 }) };
    expect(sectionRoleBonus(section, ['scope', 'covered_services'])).toBe(0);
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'true');
    expect(sectionRoleBonus(section, ['scope', 'covered_services'])).toBe(1);
    expect(sectionRoleBonus({ sectionRoles: labels({ pa_criteria: .899 }) }, ['pa_criteria'])).toBe(0);
  });
  it('keeps unqualified roles observational even when the feature is enabled', () => {
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'true');
    vi.stubEnv('JEV_SECTION_ROLE_ALLOWLIST', '');
    const section = { sectionRoles: labels({ scope: 1, covered_services: 1 }) };
    expect(sectionRoleBonus(section, ['scope', 'covered_services'])).toBe(0);
    vi.stubEnv('JEV_SECTION_ROLE_ALLOWLIST', 'scope');
    expect(sectionRoleBonus(section, ['covered_services'])).toBe(0);
    expect(sectionRoleBonus(section, ['scope'])).toBe(1);
  });
  it('changes recovery identity on enable and disable; default remains bare release', () => {
    expect(jevCorpusIdentity('release', 'digest')).toBe('release');
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'true');
    const enabled = jevCorpusIdentity('release', 'digest');
    expect(enabled).not.toBe('release');
    expect(jevCorpusIdentity('release', 'changed')).not.toBe(enabled);
    expect(jevCorpusIdentity(null, 'digest')).toBeNull();
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'false');
    expect(jevCorpusIdentity('release', 'digest')).toBe('release');
  });
  it('lets PA labels change selection order within a document without crossing quantity/process/document lanes', () => {
    const first = makeSection({ id: 'a', documentId: 'doc', content: 'Coverage criteria.' });
    const other = makeSection({ id: 'other', documentId: 'another', content: 'Coverage criteria.' });
    const better = makeSection({ id: 'b', documentId: 'doc', content: 'Coverage criteria.', sectionRoles: labels({ pa_criteria: .95 }) });
    const quantity = makeSection({ id: 'quantity', documentId: 'doc', content: 'Quantity limits apply.', sectionRoles: labels({ pa_criteria: 1 }) });
    const process = makeSection({ id: 'process', documentId: 'doc', title: 'Requesting Prior Authorization', sectionRoles: labels({ pa_procedure: 1 }) });
    const input = [first, other, better, quantity, process];
    expect(rankPriorAuthRoles(input, false)).toBe(input);
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', 'true');
    expect(rankPriorAuthRoles(input, false).map(s => s.id)).toEqual(['b', 'other', 'a', 'quantity', 'process']);
  });
  it.each(['true', 'false'])('does not read nonexistent container fields with flag %s', async flag => {
    vi.stubEnv('JEV_SECTION_ROLES_ENABLED', flag);
    const parent = { get: (key: string) => ({ id: 'container', content: '', title: 'Heading', sectionRoles: undefined } as Record<string, unknown>)[key] };
    const child = { get: (key: string) => {
      if (key === 'content' || key === 'sectionRoles') throw new Error('This record has no field');
      return key === 'children' ? [{ id: 'child', title: 'Child', sectionNumber: '1', content: 'Body' }] : null;
    } };
    const run = vi.fn().mockResolvedValueOnce({ records: [parent] }).mockResolvedValueOnce({ records: [child] });
    const service = createSectionPrimitiveService({ withSession: callback => callback({ run }) });
    const section = await service.getSection('container');
    expect(section?.content).toContain('Body');
    expect(section?.sectionRoles).toBeUndefined();
  });
});
