import type { RetrievalBackend } from '../../contracts.js';
import {
  AMENDMENT_CONTEXT_BASE_SCORE,
  AMENDMENT_CONTEXT_DOC_LIMIT,
  AMENDMENT_CONTEXT_DOC_WEIGHT,
  AMENDMENT_CONTEXT_SECTION_WEIGHT,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  timeSearchStep,
} from '../../internal/shared.js';

export const amendmentContextBackend: RetrievalBackend = {
  name: 'amendment_context',
  async retrieve({ session, analysis, profile }) {
    if (!analysis.flags.isChangeNoticeQuery || analysis.searchTerms.length === 0) return [];

    const keywordHits = [];
    for (const docTypes of profile.typeGroups) {
      try {
        const result = await timeSearchStep(`amendment context ${docTypes.join('+')}`, () =>
          session.run(
            `MATCH (amend:Document)-[:AMENDS]->(base:Document)
             WHERE amend.document_type IN $docTypes
                OR base.document_type IN $docTypes
             WITH amend, base,
                  reduce(
                    docScore = 0,
                    term IN $terms |
                    docScore +
                    CASE
                      WHEN toLower(coalesce(amend.title, '')) CONTAINS term THEN 2
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(base.title, '')) CONTAINS term THEN 1
                      ELSE 0
                    END
                  ) AS docScore
             WHERE docScore > 0
             ORDER BY docScore DESC, coalesce(amend.effective_date, '') DESC, amend.id ASC
             LIMIT toInteger($docLimit)
             MATCH (base)-[:HAS_SECTION]->(s:Section)
             WHERE s.content_length > 0
             WITH base, s, docScore,
                  CASE
                    WHEN toLower(coalesce(s.title, '')) CONTAINS 'implementation' THEN 3
                    WHEN toLower(coalesce(s.title, '')) CONTAINS 'effective' THEN 2
                    WHEN toLower(coalesce(s.title, '')) CONTAINS 'change' THEN 2
                    ELSE 0
                  END AS sectionScore
             WHERE sectionScore > 0
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               base.title AS documentTitle,
               base.policy_number AS policyNumber,
               base.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('base')}
               s.content_text AS content,
               (${AMENDMENT_CONTEXT_BASE_SCORE} + docScore * ${AMENDMENT_CONTEXT_DOC_WEIGHT} + sectionScore * ${AMENDMENT_CONTEXT_SECTION_WEIGHT}) AS score
             ORDER BY score DESC
             LIMIT toInteger($k)`,
            {
              docTypes,
              terms: analysis.searchTerms,
              docLimit: Math.min(AMENDMENT_CONTEXT_DOC_LIMIT, profile.perGroupK),
              k: profile.perGroupK,
            },
          ),
        );
        keywordHits.push(...result.records.map(recordToRetrievalHit));
      } catch {
        // Amendment-context expansion is best effort.
      }
    }
    return keywordHits;
  },
};
