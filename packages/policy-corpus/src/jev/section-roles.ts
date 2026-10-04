import { createHash } from 'node:crypto';
import spec from './questions.json';
import { JEV_MODEL } from './client.js';
export const SECTION_ROLES = Object.keys(spec.roles) as Array<keyof typeof spec.roles>;
export type SectionRole = keyof typeof spec.roles;
export interface SectionRoles {
  model: typeof JEV_MODEL; specHash: string; inputHash: string;
  probabilities: Record<SectionRole, number>;
}
/** Canonical ASCII JSON hashing shared with Python; values remain UTF-8. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const jevHash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const ROLE_SPEC_HASH = jevHash(spec.roles);
export const sectionRoleInput = (s: { title: string | null; sectionNumber: string | null; documentTitle: string | null; documentType: string | null; policyNumber: string | null }, content: string | null) => ({
  title: s.title, sectionNumber: s.sectionNumber, documentTitle: s.documentTitle,
  documentType: s.documentType, policyNumber: s.policyNumber, content: content ?? '',
});
export function parseSectionRoles(raw: unknown, expectedInputHash: string): SectionRoles | undefined {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || data.model !== JEV_MODEL || data.specHash !== ROLE_SPEC_HASH || data.inputHash !== expectedInputHash) return undefined;
    if (!data.probabilities || Object.keys(data.probabilities).sort().join() !== [...SECTION_ROLES].sort().join()) return undefined;
    if (!Object.values(data.probabilities).every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)) return undefined;
    return data as SectionRoles;
  } catch { return undefined; }
}
export function sectionRoleAllowlist(raw = process.env.JEV_SECTION_ROLE_ALLOWLIST ?? ''): SectionRole[] {
  const roles = [...new Set(raw.split(',').map(r => r.trim()).filter(Boolean))];
  if (roles.some(r => !SECTION_ROLES.includes(r as SectionRole))) throw new Error('Unknown Jev section role');
  return roles.sort() as SectionRole[];
}
export function sectionRoleBonus(section: { sectionRoles?: SectionRoles }, roles: SectionRole[]): number {
  if (process.env.JEV_SECTION_ROLES_ENABLED !== 'true') return 0;
  const allowed = sectionRoleAllowlist();
  return roles.some(role => allowed.includes(role) && (section.sectionRoles?.probabilities[role] ?? 0) >= 0.9) ? 1 : 0;
}
/** Always include config: enabling AND disabling invalidates research recovery. */
export function jevCorpusIdentity(releaseId: string | null, digest: string | null): string | null {
  if (!releaseId) return null;
  if (process.env.JEV_SECTION_ROLES_ENABLED !== 'true') return releaseId;
  return canonicalJson({ releaseId, sectionRolesEnabled: process.env.JEV_SECTION_ROLES_ENABLED === 'true', annotationDigest: digest, allowedRoles: sectionRoleAllowlist(), model: JEV_MODEL, specHash: ROLE_SPEC_HASH });
}
