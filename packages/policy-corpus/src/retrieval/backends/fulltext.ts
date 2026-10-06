import type { RetrievalBackend } from '../../contracts.js';
import {
  escapeLucene,
  notArchived,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  timeSearchStep,
} from '../../internal/shared.js';

export const fulltextBackend: RetrievalBackend = {
  name: 'fulltext',
  async retrieve({ session, input, profile }) {
    const escapedQuery = escapeLucene(input.query);
    if (!escapedQuery.trim()) return [];

    const fulltextHits = [];
    try {
      for (const docTypes of profile.typeGroups) {
        const result = await timeSearchStep(`fulltext ${docTypes.join('+')}`, () =>
          session.run(
            `CALL db.index.fulltext.queryNodes('section_fulltext', $query)
             YIELD node AS s, score
             MATCH (d:Document)-[:HAS_SECTION]->(s)
             WHERE s.content_length > 0
               AND d.document_type IN $docTypes
               AND ${notArchived('d')}
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
            { query: escapedQuery, k: profile.perGroupK, docTypes },
          ),
        );
        fulltextHits.push(...result.records.map(recordToRetrievalHit));
      }
    } catch {
      return [];
    }
    return fulltextHits;
  },
};
