import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_TYPE_GROUPS, OPERATIONAL_TYPE_GROUPS } from '../../src/internal/scoring-constants.js';

// Source families deliberately left out of default search. Adding a family to
// the manifest fails the test below until it is placed in a type group or
// named here with the reason.
const UNSEARCHED_SOURCE_TYPES: readonly string[] = [];

function manifestSourceTypes(): string[] {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../../corpus-manifest.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  return Object.values(manifest)
    .filter((value): value is Array<{ source_type?: unknown }> => Array.isArray(value))
    .flat()
    .map((entry) => entry.source_type)
    .filter((sourceType): sourceType is string => typeof sourceType === 'string');
}

describe('retrieval type groups', () => {
  it('place every manifest source family in a type group or the named exclusion list', () => {
    const sourceTypes = manifestSourceTypes();
    const placed = new Set([...BASE_TYPE_GROUPS.flat(), ...OPERATIONAL_TYPE_GROUPS.flat(), ...UNSEARCHED_SOURCE_TYPES]);

    expect(sourceTypes).toContain('clinical_policy');
    expect(sourceTypes).toContain('federal_statute');
    expect(sourceTypes.filter((sourceType) => !placed.has(sourceType))).toEqual([]);
  });

  it('search beneficiary guidance as its own base group', () => {
    expect(BASE_TYPE_GROUPS).toContainEqual(['beneficiary_guidance']);
    expect(OPERATIONAL_TYPE_GROUPS.flat()).not.toContain('beneficiary_guidance');
  });

  it('place each source family in exactly one group', () => {
    const grouped = [...BASE_TYPE_GROUPS.flat(), ...OPERATIONAL_TYPE_GROUPS.flat()];

    expect(new Set(grouped).size).toBe(grouped.length);
  });
});
