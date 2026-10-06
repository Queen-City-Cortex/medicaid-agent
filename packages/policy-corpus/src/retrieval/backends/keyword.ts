import type { RetrievalBackend } from '../../contracts.js';
import {
  DOCUMENT_KEYWORD_BASE_SCORE,
  DOCUMENT_KEYWORD_DOC_LIMIT,
  DOCUMENT_KEYWORD_DOC_WEIGHT,
  DOCUMENT_KEYWORD_SECTION_WEIGHT,
  SECTION_KEYWORD_BASE_SCORE,
  SECTION_KEYWORD_WEIGHT,
  amendmentRecencyOrder,
  notArchived,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  timeSearchStep,
} from '../../internal/shared.js';

export const sectionKeywordBackend: RetrievalBackend = {
  name: 'section_keyword',
  async retrieve({ session, analysis, profile }) {
    if (analysis.searchTerms.length === 0) return [];

    const keywordHits = [];
    for (const docTypes of profile.typeGroups) {
      try {
        const sectionResult = await timeSearchStep(`section keyword ${docTypes.join('+')}`, () =>
          session.run(
            `MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
             WHERE d.document_type IN $docTypes
               AND ${notArchived('d')}
               AND s.content_length > 0
             WITH d, s,
                  reduce(
                    keywordScore = 0,
                    term IN $terms |
                    keywordScore +
                    CASE
                      WHEN toLower(coalesce(s.title, '')) CONTAINS term THEN 3
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(s.content_text, '')) CONTAINS term THEN 1
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(d.title, '')) CONTAINS term THEN 2
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(d.policy_number, '')) CONTAINS term THEN 3
                      ELSE 0
                    END
                  ) AS keywordScore
             WHERE keywordScore > 0
             RETURN
               s.id AS sectionId,
               s.section_number AS sectionNumber,
               s.title AS sectionTitle,
               d.title AS documentTitle,
               d.policy_number AS policyNumber,
               d.document_type AS documentType,
               ${retrievalDocumentMetadataReturn('d')}
               s.content_text AS content,
               (${SECTION_KEYWORD_BASE_SCORE} + keywordScore * ${SECTION_KEYWORD_WEIGHT}) AS score
             ORDER BY keywordScore DESC, s.content_length DESC
             LIMIT toInteger($k)`,
            {
              docTypes,
              terms: analysis.searchTerms,
              k: profile.perGroupK,
            },
          ),
        );
        keywordHits.push(...sectionResult.records.map(recordToRetrievalHit));
      } catch {
        // Keyword fallback is best effort.
      }
    }
    return keywordHits;
  },
};

export const documentKeywordBackend: RetrievalBackend = {
  name: 'document_keyword',
  async retrieve({ session, analysis, profile }) {
    if (analysis.searchTerms.length === 0) return [];

    const keywordHits = [];
    for (const docTypes of profile.typeGroups) {
      try {
        // Status sorts before date: a change notice or a proposal that ties
        // a manual on title score must not take the manual's slot.
        const result = await timeSearchStep(`document keyword ${docTypes.join('+')}`, () =>
          session.run(
            `MATCH (d:Document)
             WHERE d.document_type IN $docTypes
               AND ${notArchived('d')}
             WITH d,
                  reduce(
                    docScore = 0,
                    term IN $terms |
                    docScore +
                    CASE
                      WHEN toLower(coalesce(d.title, '')) CONTAINS term THEN 2
                      ELSE 0
                    END +
                    CASE
                      WHEN toLower(coalesce(d.policy_number, '')) CONTAINS term THEN 3
                      ELSE 0
                    END
                  ) AS docScore
             WHERE docScore > 0
             ORDER BY docScore DESC,
                      CASE WHEN coalesce(d.status, '') IN ['amendment', 'proposed'] THEN 1 ELSE 0 END,
                      ${amendmentRecencyOrder('d')},
                      d.id ASC
             LIMIT toInteger($docLimit)
             MATCH (d)-[:HAS_SECTION]->(s:Section)
             WHERE s.content_length > 0
             WITH d, s, docScore,
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
               (${DOCUMENT_KEYWORD_BASE_SCORE} + docScore * ${DOCUMENT_KEYWORD_DOC_WEIGHT} + sectionScore * ${DOCUMENT_KEYWORD_SECTION_WEIGHT}) AS score
             ORDER BY score DESC
             LIMIT toInteger($k)`,
            {
              docTypes,
              terms: analysis.searchTerms,
              docLimit: Math.min(DOCUMENT_KEYWORD_DOC_LIMIT, profile.perGroupK),
              k: profile.perGroupK,
            },
          ),
        );
        keywordHits.push(...result.records.map(recordToRetrievalHit));
      } catch {
        // Keyword fallback is best effort.
      }
    }
    return keywordHits;
  },
};
