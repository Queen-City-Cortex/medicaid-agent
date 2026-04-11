import type { AnswerFrame, AnswerFrameRoute } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import { buildPolicyVariantFrameForDocuments } from './policy-variant.js';
import { rebalanceCoverageFrame } from '../rebalance/coverage.js';
import { buildCoverageQueryFlags } from '../coverage/flags.js';
import { collectCoverageDocumentHydratedCandidates } from '../coverage/document-candidates.js';
import {
  COVERAGE_AVOID_TERMS,
  COVERAGE_PRIMARY_TERMS,
  COVERAGE_SUPPORT_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  HCWD_LIMIT_HISTORY_TERMS,
  PRIOR_AUTH_AVOID_TERMS,
  buildHitText,
  buildSectionCandidates,
  extractDocumentView,
  extractSearchTerms,
  extractServiceFocusTerms,
  extractTitleClusterTerms,
  includesPhrase,
  looksLikeSiblingPolicySet,
  normalizeSearchText,
  scoreTermMatches,
  uniqueBy,
  type DocumentCandidate,
} from '../../internal/shared.js';

export async function resolveCoverageFrame(
  context: FrameContext,
  query: string,
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'coverage'),
): Promise<AnswerFrame> {
  const queryLower = normalizeSearchText(query);
  const flags = buildCoverageQueryFlags(queryLower);
  const baseHits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 16 : route.lane === 'baseline_hybrid' ? 18 : 24,
  });
  const hcwdHistoryHits =
    flags.hcwdIncomePremiumQuery && flags.earnedIncomeLimitQuery
      ? await context.collectHcwdIncomeHistoryHits()
      : [];
  const queryTerms = extractSearchTerms(query);
  const serviceFocusTerms = extractServiceFocusTerms(query);
  const focusHits = serviceFocusTerms.length === 0 || route.lane === 'deterministic_evidence'
    ? []
    : await context.searchSectionsDetailed({
        query: serviceFocusTerms.join(' '),
        topK: route.lane === 'baseline_hybrid' ? 8 : 12,
      });
  const hits = uniqueBy(
    [
      ...focusHits.map((hit) => ({
        ...hit,
        score: hit.score + 0.08,
      })),
      ...baseHits,
      ...hcwdHistoryHits.map((hit) => ({
        ...hit,
        score: hit.score + 0.12,
      })),
    ],
    (hit) => hit.sectionId,
  );
  const routingDocuments = await context.collectCoverageRoutingDocuments(query, hits);
  const variantFrame =
    route.widening_policy !== 'none' && routingDocuments.length > 1 && looksLikeSiblingPolicySet(routingDocuments)
      ? await buildPolicyVariantFrameForDocuments(context, query, routingDocuments, selectAnswerRoute(queryLower, 'policy_variant'))
      : null;
  const preferredDocumentId = variantFrame?.authoritativeDocuments[0]?.id ?? null;
  const preferredRoutingDocuments = preferredDocumentId
    ? routingDocuments.filter((document) => document.id === preferredDocumentId)
    : routingDocuments;
  const scopedRoutingDocuments = preferredRoutingDocuments.length > 0 ? preferredRoutingDocuments : routingDocuments;
  const preferredPolicyNumbers = new Set(
    scopedRoutingDocuments
      .map((document) => document.policyNumber?.toUpperCase())
      .filter((policyNumber): policyNumber is string => Boolean(policyNumber)),
  );
  const supplementalCandidateHits = flags.hcwdIncomePremiumQuery
    ? hits.filter((hit) => {
        const documentTitle = normalizeSearchText(hit.documentTitle);
        const text = buildHitText(hit);
        return (
          documentTitle.includes('change notice') &&
          (documentTitle.includes('hcwd') || documentTitle.includes('health coverage for workers with disabilities')) &&
          includesPhrase(text, HCWD_LIMIT_HISTORY_TERMS)
        );
      })
    : [];
  const candidateHits =
    preferredPolicyNumbers.size === 0
      ? uniqueBy([...hits, ...supplementalCandidateHits], (hit) => hit.sectionId)
      : (() => {
          const scoped = hits.filter(
            (hit) => hit.policyNumber && preferredPolicyNumbers.has(hit.policyNumber.toUpperCase()),
          );
          return uniqueBy([...(scoped.length > 0 ? scoped : hits), ...supplementalCandidateHits], (hit) => hit.sectionId);
        })();
  const limitationHits = candidateHits.filter((hit) =>
    includesPhrase(buildHitText(hit), ['not covered', 'limitation', 'limitations', 'exclusion']),
  );
  const primaryHits = candidateHits.filter(
    (hit) => !limitationHits.some((candidate) => candidate.sectionId === hit.sectionId),
  );
  const serviceFocusedHits = serviceFocusTerms.length === 0
    ? []
    : uniqueBy([...focusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
        const focusMatches =
          scoreTermMatches(serviceFocusTerms, hit.sectionTitle) +
          Math.min(scoreTermMatches(serviceFocusTerms, hit.content), 4);
        return focusMatches >= 2;
      });
  const weaklyServiceFocusedHits = serviceFocusTerms.length === 0
    ? []
    : uniqueBy([...focusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
        const focusMatches =
          scoreTermMatches(serviceFocusTerms, hit.sectionTitle) +
          Math.min(scoreTermMatches(serviceFocusTerms, hit.content), 4);
        return focusMatches >= 1;
      });
  const coverageFocusedPrimaryHits = primaryHits.filter((hit) => {
    const titleText = normalizeSearchText(hit.sectionTitle);
    const querySpecificMatches =
      scoreTermMatches(queryTerms, hit.sectionTitle) + Math.min(scoreTermMatches(queryTerms, hit.content), 4);
    return includesPhrase(titleText, COVERAGE_PRIMARY_TERMS) || querySpecificMatches >= 3;
  });
  const primarySeedHits =
    serviceFocusedHits.length > 0
      ? serviceFocusedHits
      : weaklyServiceFocusedHits.length > 0
        ? weaklyServiceFocusedHits
        : coverageFocusedPrimaryHits.length > 0
          ? coverageFocusedPrimaryHits
          : primaryHits.slice(0, 3);
  const serviceClusterTerms = extractTitleClusterTerms(
    primarySeedHits[0]?.sectionTitle ?? primaryHits[0]?.sectionTitle ?? null,
  );
  const { documentPrimaryHydrated, documentSupportingHydrated } = await collectCoverageDocumentHydratedCandidates({
    context,
    scopedRoutingDocuments,
    queryLower,
    flags,
  });
  const primaryCandidateLimit = serviceFocusTerms.length > 0 ? 2 : FRAME_PRIMARY_LIMIT * 2;
  const primaryCandidates = uniqueBy(
    [
      ...context.toSectionCandidates(documentPrimaryHydrated, 0.35),
      ...buildSectionCandidates(
        primarySeedHits,
        COVERAGE_PRIMARY_TERMS,
        COVERAGE_AVOID_TERMS,
        primaryCandidateLimit,
        'Primary coverage evidence.',
      ),
    ],
    (candidate) => candidate.sectionId,
  ).slice(0, FRAME_PRIMARY_LIMIT * 2);
  const limitationCandidates = buildSectionCandidates(
    limitationHits,
    ['not covered', 'limitation', 'limitations', 'exclusion'],
    [],
    FRAME_SUPPORT_LIMIT * 4,
    'Supporting limitation evidence.',
  );
  const numberedClusteredSupportingCandidates = serviceClusterTerms.length === 0
    ? []
    : buildSectionCandidates(
        candidateHits.filter((hit) => hit.sectionNumber && scoreTermMatches(serviceClusterTerms, hit.sectionTitle) >= 2),
        serviceClusterTerms,
        [],
        FRAME_SUPPORT_LIMIT * 4,
        'Supporting numbered section from the same service cluster.',
      );
  const clusteredSupportingCandidates = serviceClusterTerms.length === 0
    ? []
    : buildSectionCandidates(
        candidateHits.filter((hit) => scoreTermMatches(serviceClusterTerms, hit.sectionTitle) >= 2),
        serviceClusterTerms,
        [],
        FRAME_SUPPORT_LIMIT * 4,
        'Supporting section from the same service cluster.',
      );
  const supportingCandidates = uniqueBy(
    [
      ...context.toSectionCandidates(documentSupportingHydrated, 0.35),
      ...limitationCandidates,
      ...numberedClusteredSupportingCandidates,
      ...clusteredSupportingCandidates,
      ...buildSectionCandidates(
        [...limitationHits, ...candidateHits],
        [...COVERAGE_SUPPORT_TERMS, ...serviceClusterTerms],
        PRIOR_AUTH_AVOID_TERMS,
        FRAME_SUPPORT_LIMIT * 4,
        'Supporting limitation or documentation evidence.',
      ),
    ],
    (candidate) => candidate.sectionId,
  ).slice(0, FRAME_SUPPORT_LIMIT * 4);
  const avoidCandidates = buildSectionCandidates(
    candidateHits,
    [...PRIOR_AUTH_AVOID_TERMS, ...COVERAGE_AVOID_TERMS, ...(flags.telehealthQuery ? flags.telehealthAvoidTerms : [])],
    [],
    3,
    'Tangential or process-focused section to avoid unless explicitly requested.',
  );

  const authoritativeCandidates: DocumentCandidate[] = [
    ...(variantFrame?.authoritativeDocuments ?? []).map((document, index) => ({
      document,
      reason: document.reason ?? 'Preferred policy variant for the coverage question.',
      score: 1.3 - index * 0.1,
    })),
    ...scopedRoutingDocuments.map((document) => ({
      document: extractDocumentView(document),
      reason: 'Policy-number lookup result related to the coverage question.',
      score: 1.0,
    })),
  ];

  const frame = await context.finalizeFrame({
    questionType: 'coverage',
    route,
    authoritativeCandidates,
    primaryCandidates,
    supportingCandidates,
    avoidCandidates,
    variantReasoning: variantFrame?.variantReasoning ?? null,
    latestRevisionSections: [],
  });
  return rebalanceCoverageFrame(frame, queryLower, serviceFocusTerms, serviceClusterTerms);
}
