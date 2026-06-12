import type { RetrievalBackend } from '../../contracts.js';
import { CONCEPT_MATCH_SCORE, recordToRetrievalHit, retrievalDocumentMetadataReturn, timeSearchStep } from '../../internal/shared.js';

export const conceptBackend: RetrievalBackend = {
  name: 'concept',
  async retrieve({ session, input, profile }) {
    try {
      const result = await timeSearchStep('concept hits', () =>
        session.run(
          `MATCH (c:PolicyConcept)
           WHERE toLower($query) CONTAINS toLower(c.name)
              OR ANY(alias IN c.aliases WHERE toLower($query) CONTAINS toLower(alias))
           // Deterministic selection (LIMIT without ORDER BY is arbitrary):
           // prefer the most specific (longest-named) matching concepts.
           WITH c ORDER BY size(c.name) DESC, c.name ASC LIMIT 2
           MATCH (s:Section)-[:COVERS|DEFINES|RESTRICTS]->(c)
           MATCH (d:Document)-[:HAS_SECTION]->(s)
           WHERE s.content_length > 200
             AND s.section_number IS NOT NULL
           ${profile.hasExplicitDocumentTypes ? 'AND d.document_type IN $docTypes' : ''}
           RETURN
             s.id AS sectionId,
             s.section_number AS sectionNumber,
             s.title AS sectionTitle,
             d.title AS documentTitle,
             d.policy_number AS policyNumber,
             d.document_type AS documentType,
             ${retrievalDocumentMetadataReturn('d')}
             s.content_text AS content,
             ${CONCEPT_MATCH_SCORE} AS score
           ORDER BY s.content_length DESC
           LIMIT toInteger($k)`,
          {
            query: input.query,
            k: Math.min(Math.round(input.topK ?? 10), 5),
            docTypes: input.documentTypes ?? [],
          },
        ),
      );
      return result.records.map(recordToRetrievalHit);
    } catch {
      return [];
    }
  },
};
