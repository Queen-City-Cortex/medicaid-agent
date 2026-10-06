import type { CorpusRetrievalHit, SessionLike } from '../../types.js';
import {
  AMENDMENT_CONTEXT_BASE_SCORE,
  AMENDMENT_CONTEXT_SECTION_WEIGHT,
  CHANGE_NOTICE_HEADER_BASE_SCORE,
  CHANGE_NOTICE_HEADER_SECTION_WEIGHT,
  DOCUMENT_EXPANSION_BASE_SCORE,
  DOCUMENT_EXPANSION_SECTION_WEIGHT,
  amendmentRecencyOrder,
  notArchived,
  retrievalReady,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  timeSearchStep,
} from '../../internal/shared.js';

export async function retrieveDocumentExpansionHits({
  session,
  titles,
  terms,
  k,
}: {
  session: SessionLike;
  titles: string[];
  terms: string[];
  k: number;
}): Promise<CorpusRetrievalHit[]> {
  if (titles.length === 0 || terms.length === 0) return [];

  try {
    const result = await timeSearchStep('document expansion', () =>
      session.run(
        `MATCH (d:Document)
         WHERE d.title IN $titles
           AND ${notArchived('d')}
           AND ${retrievalReady('d')}
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
           (${DOCUMENT_EXPANSION_BASE_SCORE} + sectionScore * ${DOCUMENT_EXPANSION_SECTION_WEIGHT}) AS score
         ORDER BY score DESC, s.content_length DESC
         LIMIT toInteger($k)`,
        {
          titles,
          terms,
          k,
        },
      ),
    );
    return result.records.map(recordToRetrievalHit);
  } catch {
    return [];
  }
}

export async function retrieveChangeNoticeHeaderHits({
  session,
  titles,
  k,
}: {
  session: SessionLike;
  titles: string[];
  k: number;
}): Promise<CorpusRetrievalHit[]> {
  if (titles.length === 0) return [];

  try {
    const result = await timeSearchStep('change notice header expansion', () =>
      session.run(
        `MATCH (d:Document)
         WHERE d.title IN $titles
           AND ${notArchived('d')}
           AND ${retrievalReady('d')}
         MATCH (d)-[:HAS_SECTION]->(s:Section)
         WITH d, s,
              CASE
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'change no' THEN 4
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'revised' THEN 4
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'effective date' THEN 3
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'implementation' THEN 3
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'policy update' THEN 2
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'content of change' THEN 2
                ELSE 0
              END AS sectionScore
         WHERE sectionScore > 0
         RETURN
           s.id AS sectionId,
           s.section_number AS sectionNumber,
           s.title AS sectionTitle,
           d.title AS documentTitle,
           d.policy_number AS policyNumber,
           d.document_type AS documentType,
           ${retrievalDocumentMetadataReturn('d')}
           coalesce(s.content_text, '') AS content,
           (${CHANGE_NOTICE_HEADER_BASE_SCORE} + sectionScore * ${CHANGE_NOTICE_HEADER_SECTION_WEIGHT}) AS score
         ORDER BY ${amendmentRecencyOrder('d')},
           score DESC, s.id ASC
         LIMIT toInteger($k)`,
        {
          titles,
          k,
        },
      ),
    );
    return result.records.map(recordToRetrievalHit);
  } catch {
    return [];
  }
}

export async function retrieveAmendmentTitleExpansionHits({
  session,
  titles,
  k,
}: {
  session: SessionLike;
  titles: string[];
  k: number;
}): Promise<CorpusRetrievalHit[]> {
  if (titles.length === 0) return [];

  try {
    // No label on `amend`: it may be a :Document or a :PolicyRevision.
    const result = await timeSearchStep('amendment title expansion', () =>
      session.run(
        `MATCH (amend)-[:AMENDS]->(base:Document)
         WHERE amend.title IN $titles
           AND ${notArchived('base')}
           AND ${retrievalReady('base')}
         MATCH (base)-[:HAS_SECTION]->(s:Section)
         WHERE s.content_length > 0
         WITH base, s,
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
           (${AMENDMENT_CONTEXT_BASE_SCORE} + sectionScore * ${AMENDMENT_CONTEXT_SECTION_WEIGHT}) AS score
         ORDER BY score DESC, s.content_length DESC
         LIMIT toInteger($k)`,
        {
          titles,
          k,
        },
      ),
    );
    return result.records.map(recordToRetrievalHit);
  } catch {
    return [];
  }
}
