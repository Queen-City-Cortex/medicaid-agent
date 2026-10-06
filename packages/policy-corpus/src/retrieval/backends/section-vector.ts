import type { RetrievalBackend } from '../../contracts.js';
import { notArchived, retrievalReady, recordToRetrievalHit, retrievalDocumentMetadataReturn, timeSearchStep, vectorScanK } from '../../internal/shared.js';

export const sectionVectorBackend: RetrievalBackend = {
  name: 'section_vector',
  async retrieve({ session, profile, embedding }) {
    const vectorHits = [];
    for (const docTypes of profile.typeGroups) {
      // Overscan ($scanK) then filter to the group: queryNodes(k) alone
      // returns the global top-k, so post-filtering it gave every group the
      // same global hits instead of per-group coverage.
      const result = await timeSearchStep(`section vector ${docTypes.join('+')}`, () =>
        session.run(
          `CALL db.index.vector.queryNodes('section_embeddings', toInteger($scanK), $embedding)
           YIELD node AS s, score
           MATCH (d:Document)-[:HAS_SECTION]->(s)
           WHERE d.document_type IN $docTypes
             AND ${notArchived('d')}
             AND ${retrievalReady('d')}
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
      vectorHits.push(...result.records.map(recordToRetrievalHit));
    }
    return vectorHits;
  },
};
