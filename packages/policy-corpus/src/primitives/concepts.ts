import {
  ALLOWED_CONCEPT_RELATIONSHIPS,
  type ConceptSectionView,
  type FindConceptSectionsInput,
  type SessionExecutor,
} from '../types.js';

export function createConceptPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const findConceptSections = async ({
    conceptName,
    relationshipType,
  }: FindConceptSectionsInput): Promise<ConceptSectionView[]> => {
    if (relationshipType && !(ALLOWED_CONCEPT_RELATIONSHIPS as readonly string[]).includes(relationshipType)) {
      return [];
    }

    return withSession(async (session) => {
      const query = relationshipType
        ? `MATCH (s:Section)-[r:${relationshipType}]->(c:PolicyConcept)
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
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
           WHERE c.name = $name OR toLower(c.name) = toLower($name)
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
