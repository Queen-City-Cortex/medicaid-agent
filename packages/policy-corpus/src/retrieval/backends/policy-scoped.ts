import type { RetrievalBackend } from '../../contracts.js';
import {
  POLICY_SCOPED_BASE_SCORE,
  POLICY_SCOPED_SECTION_WEIGHT,
  notArchived,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  timeSearchStep,
  vectorScanK,
} from '../../internal/shared.js';

export const policyScopedBackend: RetrievalBackend = {
  name: 'policy_scoped',
  async retrieve({ session, analysis, profile, embedding }) {
    if (analysis.explicitPolicyNumbers.length === 0 || analysis.searchTerms.length === 0) return [];

    const policyScopedHits = [];
    for (const docTypes of profile.typeGroups) {
      try {
        // Without overscan this was a provable no-op: the global top-k
        // post-filtered to the named policy is a subset of section_vector's
        // results at identical scores. The deep scan is what lets the named
        // policy's sections surface even when they miss the global top-k.
        const vectorResult = await timeSearchStep(`policy scoped vector ${docTypes.join('+')}`, () =>
          session.run(
            `CALL db.index.vector.queryNodes('section_embeddings', toInteger($scanK), $embedding)
             YIELD node AS s, score
             MATCH (d:Document)-[:HAS_SECTION]->(s)
             WHERE d.document_type IN $docTypes
               AND toUpper(coalesce(d.policy_number, '')) IN $policyNumbers
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
            {
              embedding,
              docTypes,
              policyNumbers: analysis.explicitPolicyNumbers,
              k: profile.perGroupK,
              scanK: vectorScanK(profile.perGroupK),
            },
          ),
        );
        policyScopedHits.push(...vectorResult.records.map(recordToRetrievalHit));

        const result = await timeSearchStep(`policy scoped ${docTypes.join('+')}`, () =>
          session.run(
            `MATCH (d:Document)
             WHERE d.document_type IN $docTypes
               AND toUpper(coalesce(d.policy_number, '')) IN $policyNumbers
               AND ${notArchived('d')}
             MATCH (d)-[:HAS_SECTION]->(s:Section)
             WHERE s.content_length > 0
             WITH d, s,
                  reduce(
                    sectionScore = 0,
                    term IN $terms |
                    sectionScore +
                    CASE
                      WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                      ELSE 0
                    END
                  ) AS sectionScore
             WHERE sectionScore > 0
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               d.title AS documentTitle,
               d.policy_number AS policyNumber,
               d.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('d')}
               s.content_text AS content,
               (${POLICY_SCOPED_BASE_SCORE} + sectionScore * ${POLICY_SCOPED_SECTION_WEIGHT}) AS score
             ORDER BY score DESC, s.content_length DESC
             LIMIT toInteger($k)`,
            {
              docTypes,
              policyNumbers: analysis.explicitPolicyNumbers,
              terms: analysis.searchTerms,
              k: profile.perGroupK,
            },
          ),
        );
        policyScopedHits.push(...result.records.map(recordToRetrievalHit));
      } catch {
        // Policy-scoped retrieval is best effort.
      }
    }
    return policyScopedHits;
  },
};
