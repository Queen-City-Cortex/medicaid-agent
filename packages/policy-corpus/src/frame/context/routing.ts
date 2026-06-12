import type { LegalPrimitiveService } from '../../contracts.js';
import type {
  CorpusRetrievalHit,
  DocumentWithSectionsView,
  SessionExecutor,
} from '../../types.js';
import {
  ATTACHMENT_TITLE_PENALTY,
  BOILERPLATE_TITLE_PENALTY,
  FRAME_DOCUMENT_LIMIT,
  POLICY_ROUTING_DOCUMENT_TYPES,
  SECTION_KEYWORD_BASE_SCORE,
  SECTION_KEYWORD_WEIGHT,
  buildQueryFocusTerms,
  collectPolicyNumbersForQuery,
  dedupeTerms,
  extractAliasedPolicyNumbers,
  extractExplicitPolicyNumbers,
  isAttachmentTitle,
  isBoilerplateTitle,
  isHcwdIncomePremiumQuery,
  narrowHcwdCoverageDocuments,
  narrowInferredCoverageDocuments,
  selectSettingPreferredDocuments,
  normalizeSearchText,
  recordToRetrievalHit,
  retrievalDocumentMetadataReturn,
  scoreTermMatches,
  uniqueBy,
} from '../../internal/shared.js';

export function createFrameRoutingHelpers({
  withSession,
  lookupPolicy,
}: {
  withSession: SessionExecutor;
  lookupPolicy: LegalPrimitiveService['lookupPolicy'];
}) {
  const collectLookupDocuments = async (query: string): Promise<DocumentWithSectionsView[]> => {
    const policyNumbers = collectPolicyNumbersForQuery(query);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(policyNumbers.map((policyNumber) => lookupPolicy({ policyNumber })));
    return uniqueBy(documents.flat(), (document) => document.id);
  };

  const collectImplementationLookupDocuments = async (query: string): Promise<DocumentWithSectionsView[]> => {
    const queryLower = normalizeSearchText(query);
    const policyNumbers = dedupeTerms([...extractExplicitPolicyNumbers(query), ...extractAliasedPolicyNumbers(queryLower)]);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(policyNumbers.map((policyNumber) => lookupPolicy({ policyNumber })));
    return uniqueBy(documents.flat(), (document) => document.id);
  };

  // Surfaces income/premium rule sections from HCWD change notices, newest
  // first. Scoring is TOPICAL only — the previous version scored sections by
  // verbatim golden-answer sentences and gave a title bonus to the one change
  // notice ('01-14') that answers the golden question, i.e. it retrieved the
  // answer because we already knew it.
  const collectHcwdIncomeHistoryHits = async (): Promise<CorpusRetrievalHit[]> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
         WHERE d.document_type = 'dhhs_policy'
           AND coalesce(d.status, '') = 'amendment'
           AND (
             toLower(coalesce(d.title, '')) CONTAINS 'hcwd'
             OR toLower(coalesce(d.title, '')) CONTAINS 'health coverage for workers with disabilities'
           )
         WITH d, s,
              CASE
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'income' THEN 4
                WHEN toLower(coalesce(s.title, '')) CONTAINS 'premium' THEN 4
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'income limit' THEN 3
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'countable income' THEN 3
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'federal poverty level' THEN 3
                WHEN toLower(coalesce(s.content_text, '')) CONTAINS 'premium' THEN 2
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
           s.content_text AS content,
           (${SECTION_KEYWORD_BASE_SCORE} + sectionScore * ${SECTION_KEYWORD_WEIGHT}) AS score
         ORDER BY score DESC, coalesce(d.effective_date, '') DESC
         LIMIT 8`,
      );

      return result.records.map(recordToRetrievalHit);
    });
  };

  const collectPolicyDocumentsFromHits = async (
    query: string,
    hits: CorpusRetrievalHit[],
    limit = FRAME_DOCUMENT_LIMIT,
  ): Promise<DocumentWithSectionsView[]> => {
    const focusTerms = buildQueryFocusTerms(query);
    const scoresByPolicyNumber = new Map<string, number>();

    for (const hit of hits) {
      if (!hit.policyNumber || !hit.documentType || !POLICY_ROUTING_DOCUMENT_TYPES.has(hit.documentType)) continue;

      const policyNumber = hit.policyNumber.toUpperCase();
      const titleMatches = scoreTermMatches(focusTerms, hit.sectionTitle);
      const documentMatches = scoreTermMatches(focusTerms, hit.documentTitle);
      const contentMatches = Math.min(scoreTermMatches(focusTerms, hit.content), 5);
      if (titleMatches + documentMatches + Math.min(contentMatches, 2) < 2) continue;

      let score = hit.score;
      score += titleMatches * 0.04;
      score += documentMatches * 0.03;
      score += contentMatches * 0.015;

      if (isAttachmentTitle(hit.sectionTitle) && !normalizeSearchText(query).includes('attachment')) {
        score -= ATTACHMENT_TITLE_PENALTY;
      }
      if (isBoilerplateTitle(hit.sectionTitle)) {
        score -= BOILERPLATE_TITLE_PENALTY;
      }

      scoresByPolicyNumber.set(policyNumber, (scoresByPolicyNumber.get(policyNumber) ?? 0) + score);
    }

    const policyNumbers = Array.from(scoresByPolicyNumber.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([policyNumber]) => policyNumber);
    if (policyNumbers.length === 0) return [];

    const documents = await Promise.all(
      policyNumbers.map(async (policyNumber) => {
        const [document] = await lookupPolicy({ policyNumber });
        return document ?? null;
      }),
    );
    return uniqueBy(
      documents.filter((document): document is DocumentWithSectionsView => document != null),
      (document) => document.id,
    );
  };

  const collectCoverageRoutingDocuments = async (
    query: string,
    hits: CorpusRetrievalHit[],
  ): Promise<DocumentWithSectionsView[]> => {
    const lookupDocuments = await collectLookupDocuments(query);
    if (lookupDocuments.length > 0) {
      return isHcwdIncomePremiumQuery(normalizeSearchText(query))
        ? narrowHcwdCoverageDocuments(query, lookupDocuments)
        : lookupDocuments;
    }
    const inferredDocuments = await collectPolicyDocumentsFromHits(query, hits, FRAME_DOCUMENT_LIMIT + 1);
    // Setting preference must run BEFORE narrowing: narrowInferredCoverage-
    // Documents keeps only the raw-score winner for non-sibling sets, which
    // discarded the congregate PCS policy whenever CAP/DA outranked it on an
    // adult-care-home question.
    const { documents: settingScopedDocuments } = selectSettingPreferredDocuments(
      normalizeSearchText(query),
      inferredDocuments,
    );
    return narrowInferredCoverageDocuments(settingScopedDocuments);
  };

  return {
    collectLookupDocuments,
    collectImplementationLookupDocuments,
    collectHcwdIncomeHistoryHits,
    collectPolicyDocumentsFromHits,
    collectCoverageRoutingDocuments,
  };
}
