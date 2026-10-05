import {
  ALLOWED_CONCEPT_RELATIONSHIPS,
  type ConceptSectionView,
  type ConceptSectionsView,
  type FindConceptSectionsInput,
  type SessionExecutor,
} from '../types.js';
import { toCount } from '../internal/shared.js';

// A broad concept links thousands of sections ("Prior Authorization": 2,573
// on the July 2026 graph), so the list is capped and the total reported.
export const CONCEPT_SECTION_LIMIT = 40;

// Concepts are stored with a canonical `name` plus an `aliases` list
// (e.g. CAP/DA ← "Community Alternatives Program for Disabled Adults").
// Matching must cover both, case-insensitively — name-only matching made
// every documented alias lookup silently return [].
const CONCEPT_NAME_MATCH = `(
             toLower(c.name) = toLower($name)
             OR any(alias IN coalesce(c.aliases, []) WHERE toLower(alias) = toLower($name))
           )`;

export function createConceptPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const findConceptSections = async ({
    conceptName,
    relationshipType,
  }: FindConceptSectionsInput): Promise<ConceptSectionsView> => {
    // Normalize case before the allowlist check — 'covers' is as valid as
    // 'COVERS'. The allowlist is also what keeps the interpolated
    // relationship type below safe.
    const normalizedRelationship = relationshipType
      ? ALLOWED_CONCEPT_RELATIONSHIPS.find(
          (allowed) => allowed.toLowerCase() === relationshipType.toLowerCase(),
        )
      : undefined;
    if (relationshipType && !normalizedRelationship) {
      return { sections: [], total: 0, truncated: false };
    }
    const relationships = normalizedRelationship ? [normalizedRelationship] : ALLOWED_CONCEPT_RELATIONSHIPS;

    return withSession(async (session) => {
      // Sections whose title names the concept come first, then a stable
      // document/section order, so the capped page is deterministic.
      const result = await session.run(
        `MATCH (s:Section)-[r:${relationships.join('|')}]->(c:PolicyConcept)
         WHERE ${CONCEPT_NAME_MATCH}
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         WITH s, d, type(r) AS relationshipType
         ORDER BY
           CASE WHEN toLower(coalesce(s.title, '')) CONTAINS toLower($name) THEN 0 ELSE 1 END,
           d.id,
           s.section_number,
           s.id,
           relationshipType
         WITH collect({
           sectionId: s.id,
           sectionTitle: s.title,
           sectionNumber: s.section_number,
           documentId: d.id,
           documentType: d.document_type,
           policyNumber: d.policy_number,
           relationshipType: relationshipType
         }) AS rows
         RETURN size(rows) AS total, rows[0..${CONCEPT_SECTION_LIMIT}] AS sections`,
        { name: conceptName },
      );

      const record = result.records[0];
      if (!record) return { sections: [], total: 0, truncated: false };

      const rows = (record.get('sections') as Array<Record<string, string | null | undefined>> | null) ?? [];
      const sections = rows.map((row) => ({
        sectionId: row.sectionId as string,
        sectionTitle: row.sectionTitle ?? null,
        sectionNumber: row.sectionNumber ?? null,
        documentId: row.documentId ?? null,
        documentType: row.documentType ?? null,
        policyNumber: row.policyNumber ?? null,
        relationshipType: row.relationshipType as string,
      })) satisfies ConceptSectionView[];
      const total = toCount(record.get('total'));
      return { sections, total, truncated: total > sections.length };
    });
  };

  return {
    findConceptSections,
  };
}
