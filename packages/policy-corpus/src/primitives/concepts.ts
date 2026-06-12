import {
  ALLOWED_CONCEPT_RELATIONSHIPS,
  type ConceptSectionView,
  type FindConceptSectionsInput,
  type SessionExecutor,
} from '../types.js';

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
  }: FindConceptSectionsInput): Promise<ConceptSectionView[]> => {
    // Normalize case before the allowlist check — 'covers' is as valid as
    // 'COVERS', and a silent [] for a casing mismatch is indistinguishable
    // from "no sections" to the caller.
    const normalizedRelationship = relationshipType
      ? (ALLOWED_CONCEPT_RELATIONSHIPS as readonly string[]).find(
          (allowed) => allowed.toLowerCase() === relationshipType.toLowerCase(),
        )
      : undefined;
    if (relationshipType && !normalizedRelationship) {
      return [];
    }

    return withSession(async (session) => {
      const query = normalizedRelationship
        ? `MATCH (s:Section)-[r:${normalizedRelationship}]->(c:PolicyConcept)
           WHERE ${CONCEPT_NAME_MATCH}
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`
        : `MATCH (s:Section)-[r]->(c:PolicyConcept)
           WHERE ${CONCEPT_NAME_MATCH}
           OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
           RETURN
             s.id AS sectionId,
             s.title AS sectionTitle,
             s.section_number AS sectionNumber,
             d.id AS documentId,
             d.document_type AS documentType,
             d.policy_number AS policyNumber,
             type(r) AS relationshipType`;

      const result = await session.run(query, { name: conceptName });
      return result.records.map((record) => ({
        sectionId: record.get('sectionId') as string,
        sectionTitle: (record.get('sectionTitle') as string | null | undefined) ?? null,
        sectionNumber: (record.get('sectionNumber') as string | null | undefined) ?? null,
        documentId: (record.get('documentId') as string | null | undefined) ?? null,
        documentType: (record.get('documentType') as string | null | undefined) ?? null,
        policyNumber: (record.get('policyNumber') as string | null | undefined) ?? null,
        relationshipType: record.get('relationshipType') as string,
      })) satisfies ConceptSectionView[];
    });
  };

  return {
    findConceptSections,
  };
}
