import type { RetrievalBackend } from '../../contracts.js';
import { recordToRetrievalHit, retrievalDocumentMetadataReturn, timeSearchStep, vectorScanK } from '../../internal/shared.js';

export const chunkVectorBackend: RetrievalBackend = {
  name: 'chunk_vector',
  async retrieve({ session, profile, embedding }) {
    const chunkHits = [];
    for (const docTypes of profile.typeGroups) {
      try {
        // Overscan then filter — see section-vector for why.
        const result = await timeSearchStep(`chunk vector ${docTypes.join('+')}`, () =>
          session.run(
            `CALL db.index.vector.queryNodes('chunk_embeddings', toInteger($scanK), $embedding)
             YIELD node AS c, score
             MATCH (s:Section)-[:HAS_CHUNK]->(c)
             MATCH (d:Document)-[:HAS_SECTION]->(s)
             WHERE d.document_type IN $docTypes
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               d.title AS documentTitle,
               d.policy_number AS policyNumber,
               d.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('d')}
               s.content_text AS content,
               score
             ORDER BY score DESC
             LIMIT toInteger($k)`,
            { embedding, k: profile.perGroupK, scanK: vectorScanK(profile.perGroupK), docTypes },
          ),
        );
        chunkHits.push(...result.records.map(recordToRetrievalHit));
      } catch {
        // chunk_embeddings index may not exist.
      }
    }
    return chunkHits;
  },
};
