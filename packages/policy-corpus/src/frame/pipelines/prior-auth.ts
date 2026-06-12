import type { AnswerFrame, AnswerFrameRoute } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import { isPharmacyQuantityPriorAuthQuery } from '../../internal/query-intent.js';
import { rebalancePriorAuthFrame } from '../rebalance/prior-auth.js';
import {
  FRAME_AVOID_LIMIT,
  FRAME_DOCUMENT_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  PRIOR_AUTH_AVOID_TERMS,
  PRIOR_AUTH_CRITERIA_SECTION_TERMS,
  PRIOR_AUTH_DOCUMENT_SECTION_TERMS,
  PRIOR_AUTH_PRIMARY_TERMS,
  PRIOR_AUTH_QUANTITY_TERMS,
  PRIOR_AUTH_SUPPORT_TERMS,
  buildSectionCandidates,
  extractDocumentView,
  normalizeSearchText,
  uniqueBy,
} from '../../internal/shared.js';

export async function resolvePriorAuthFrame(
  context: FrameContext,
  query: string,
  route: AnswerFrameRoute = selectAnswerRoute(normalizeSearchText(query), 'prior_authorization'),
): Promise<AnswerFrame> {
  const queryLower = normalizeSearchText(query);
  const hits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 10 : 12,
  });
  const lookupDocuments = await context.collectLookupDocuments(query);
  const routingDocuments =
    lookupDocuments.length > 0 ? lookupDocuments : await context.collectPolicyDocumentsFromHits(query, hits, FRAME_DOCUMENT_LIMIT);
  const primaryCandidates = buildSectionCandidates(
    hits,
    PRIOR_AUTH_PRIMARY_TERMS,
    PRIOR_AUTH_AVOID_TERMS,
    FRAME_PRIMARY_LIMIT * 2,
    'Primary prior-authorization criteria section.',
  );
  const supportingCandidates = buildSectionCandidates(
    hits,
    PRIOR_AUTH_SUPPORT_TERMS,
    PRIOR_AUTH_AVOID_TERMS,
    FRAME_SUPPORT_LIMIT * 2,
    'Supporting medical-necessity or coverage section.',
  );
  const avoidCandidates = buildSectionCandidates(
    hits,
    PRIOR_AUTH_AVOID_TERMS,
    [],
    FRAME_AVOID_LIMIT,
    'Submission or request-process section that is secondary to the criteria.',
  );
  const documentPrimaryCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      routingDocuments,
      PRIOR_AUTH_DOCUMENT_SECTION_TERMS,
      PRIOR_AUTH_AVOID_TERMS,
      'Title-matched prior-authorization criteria section from the preferred document.',
      FRAME_PRIMARY_LIMIT * 2,
    ),
  );
  const quantityDocumentPrimaryCandidates = isPharmacyQuantityPriorAuthQuery(queryLower)
    ? context.toSectionCandidates(
        await context.collectDocumentSectionCandidates(
          routingDocuments,
          PRIOR_AUTH_QUANTITY_TERMS,
          PRIOR_AUTH_AVOID_TERMS,
          'Quantity-limit section from the governing pharmacy policy.',
          Math.max(FRAME_PRIMARY_LIMIT, 2),
        ),
      )
    : [];
  const criteriaDocumentPrimaryCandidates = isPharmacyQuantityPriorAuthQuery(queryLower)
    ? context.toSectionCandidates(
        await context.collectDocumentSectionCandidates(
          routingDocuments,
          PRIOR_AUTH_CRITERIA_SECTION_TERMS,
          PRIOR_AUTH_AVOID_TERMS,
          'Pharmacy prior-approval criteria section from the governing policy.',
          Math.max(FRAME_PRIMARY_LIMIT, 2),
        ),
      )
    : [];
  const documentSupportingCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      routingDocuments,
      PRIOR_AUTH_SUPPORT_TERMS,
      PRIOR_AUTH_AVOID_TERMS,
      'Title-matched supporting prior-authorization section from the preferred document.',
      FRAME_SUPPORT_LIMIT * 2,
    ),
  );

  const authoritativeCandidates = lookupDocuments.map((document) => ({
    document: extractDocumentView(document),
    reason: 'Policy lookup result for the prior-authorization question.',
    score: 1.0,
  }));

  const frame = await context.finalizeFrame({
    questionType: 'prior_authorization',
    route,
    authoritativeCandidates,
    primaryCandidates: uniqueBy(
      [
        ...quantityDocumentPrimaryCandidates,
        ...criteriaDocumentPrimaryCandidates,
        ...documentPrimaryCandidates,
        ...primaryCandidates,
      ],
      (candidate) => candidate.sectionId,
    ),
    supportingCandidates: uniqueBy(
      [...documentSupportingCandidates, ...supportingCandidates],
      (candidate) => candidate.sectionId,
    ),
    avoidCandidates,
  });

  return rebalancePriorAuthFrame(frame, queryLower);
}
