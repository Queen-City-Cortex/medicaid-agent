import type { AnswerFrame, AnswerFrameRoute } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import { buildPolicyVariantFrameForDocuments } from './policy-variant.js';
import { rebalanceCoverageFrame } from '../rebalance/coverage.js';
import { buildCoverageQueryFlags, collectCoverageDocumentHydratedCandidates } from '../coverage/candidates.js';
import {
  COVERAGE_AVOID_TERMS,
  COVERAGE_PRIMARY_TERMS,
  COVERAGE_SUPPORT_TERMS,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  HCWD_INCOME_RULE_TERMS,
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
  selectSettingPreferredDocuments,
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
  // Setting-variant preference for the no-sibling case: when the query names a
  // care setting (congregate/in-home) and a routing document's title matches
  // it, scope to those documents even if a non-sibling distractor outranked
  // them on raw scores. The variant frame (sibling sets) takes precedence.
  const settingPreference = selectSettingPreferredDocuments(queryLower, routingDocuments);
  const preferredRoutingDocuments = preferredDocumentId
    ? routingDocuments.filter((document) => document.id === preferredDocumentId)
    : settingPreference.documents;
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
          includesPhrase(text, HCWD_INCOME_RULE_TERMS)
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
  const limitationCandidates = buildSectionCandidates(
    limitationHits,
    ['not covered', 'limitation', 'limitations', 'exclusion'],
    [],
    FRAME_SUPPORT_LIMIT * 4,
    'Supporting limitation evidence.',
  );
  // When the route hint demands citing both scope and not-covered, promote up
  // to 2 limitation candidates into the primary set so the agent treats them
  // as first-class evidence rather than supporting. Without this, negative-
  // coverage answers routinely fabricate exclusion section numbers because
  // the §4.1-style section lives in supportingSections and the agent trusts
  // primarySections first.
  const promotedLimitationCandidates = route.determinism_hints.cite_scope_and_not_covered
    ? limitationCandidates.slice(0, 2).map((candidate) => ({
        ...candidate,
        reason: 'Not-covered section required by cite_scope_and_not_covered hint.',
      }))
    : [];
  const primaryCandidates = uniqueBy(
    [
      ...context.toSectionCandidates(documentPrimaryHydrated),
      ...promotedLimitationCandidates,
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
      ...context.toSectionCandidates(documentSupportingHydrated),
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
    variantReasoning: variantFrame?.variantReasoning ?? settingPreference.reason,
    latestRevisionSections: [],
  });
  return rebalanceCoverageFrame(frame, queryLower, serviceFocusTerms, serviceClusterTerms);
}
