import { rankPriorAuthRoles } from '../../jev/prior-auth.js';
import { asksForPriorAuthSubmissionProcess } from '../../internal/query-intent.js';
import type { QueryAnalysis } from '../../contracts.js';
import type { AnswerFrame, AnswerFrameSection } from '../../types.js';
import type { FrameContext } from '../context.js';
import { isPharmacyQuantityPriorAuthQuery } from '../../internal/query-intent.js';
import { rebalancePriorAuthFrame } from '../rebalance/prior-auth.js';
import {
  FRAME_AVOID_LIMIT,
  FRAME_DOCUMENT_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  PRIOR_AUTH_AVOID_TERMS,
  PRIOR_AUTH_CRITERIA_SECTION_TERMS,
  NOT_COVERED_SECTION_TERMS,
  PRIOR_AUTH_DOCUMENT_SECTION_TERMS,
  PRIOR_AUTH_HEADING_TERMS,
  PRIOR_AUTH_PRIMARY_TERMS,
  PRIOR_AUTH_QUANTITY_TERMS,
  PRIOR_AUTH_SUPPORT_TERMS,
  buildSectionCandidates,
  extractDocumentView,
  includesPhrase,
  normalizeSearchText,
  uniqueBy,
} from '../../internal/shared.js';
import { hasSubstantiveText } from '../coverage-sections/structure.js';

function isNotCoveredHeading(title: string | null | undefined): boolean {
  return includesPhrase(normalizeSearchText(title), NOT_COVERED_SECTION_TERMS);
}

// A "Not Covered" heading never leads a prior-authorization frame, and a
// heading without text of its own gives the plan nothing to cite.
function primaryDocumentSections<T extends { section: AnswerFrameSection }>(candidates: T[]): T[] {
  return candidates.filter((candidate) => !isNotCoveredHeading(candidate.section.title) && hasSubstantiveText(candidate.section));
}

export async function resolvePriorAuthFrame(
  context: FrameContext,
  analysis: QueryAnalysis,
): Promise<AnswerFrame> {
  const { query, normalizedQuery: queryLower, route } = analysis;
  const hits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 10 : 12,
  });
  const lookupDocuments = await context.collectLookupDocuments(query);
  const routingDocuments =
    lookupDocuments.length > 0 ? lookupDocuments : await context.collectPolicyDocumentsFromHits(query, hits, FRAME_DOCUMENT_LIMIT);
  // Hits from documents outside the routing set do not enter the frame, and a
  // hit is negative guidance only when its own heading carries an avoid term
  // the question did not use.
  const routingSectionIds = new Set(routingDocuments.flatMap((document) => document.sections.map((section) => section.id)));
  // With no routing document resolved there is nothing to scope to: keep the hits.
  const scopedHits = routingSectionIds.size > 0 ? hits.filter((hit) => routingSectionIds.has(hit.sectionId)) : hits;
  const avoidTerms = PRIOR_AUTH_AVOID_TERMS.filter((term) => !includesPhrase(queryLower, [term]));
  const avoidTitleHits = scopedHits.filter((hit) => includesPhrase(normalizeSearchText(hit.sectionTitle), avoidTerms));
  const primaryHits = scopedHits.filter((hit) => !isNotCoveredHeading(hit.sectionTitle));
  const primaryCandidates = buildSectionCandidates(
    primaryHits,
    PRIOR_AUTH_PRIMARY_TERMS,
    PRIOR_AUTH_AVOID_TERMS,
    FRAME_PRIMARY_LIMIT * 2,
    'Primary prior-authorization criteria section.',
  );
  const supportingCandidates = buildSectionCandidates(
    scopedHits,
    PRIOR_AUTH_SUPPORT_TERMS,
    PRIOR_AUTH_AVOID_TERMS,
    FRAME_SUPPORT_LIMIT * 2,
    'Supporting medical-necessity or coverage section.',
  );
  const avoidCandidates = buildSectionCandidates(
    avoidTitleHits,
    avoidTerms,
    [],
    FRAME_AVOID_LIMIT,
    'Submission or request-process section that is secondary to the criteria.',
  );
  const headingPrimaryCandidates = context.toSectionCandidates(
    primaryDocumentSections(
      await context.collectDocumentSectionCandidates(
        routingDocuments,
        PRIOR_AUTH_HEADING_TERMS,
        PRIOR_AUTH_AVOID_TERMS,
        'Prior Approval heading from the preferred document.',
        FRAME_PRIMARY_LIMIT * 2,
      ),
    ),
  );
  const documentPrimaryCandidates = context.toSectionCandidates(
    primaryDocumentSections(
      await context.collectDocumentSectionCandidates(
        routingDocuments,
        PRIOR_AUTH_DOCUMENT_SECTION_TERMS,
        PRIOR_AUTH_AVOID_TERMS,
        'Title-matched prior-authorization criteria section from the preferred document.',
        FRAME_PRIMARY_LIMIT * 2,
      ),
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

  const rankCandidates = async (candidates: Parameters<typeof context.hydrateSectionCandidates>[0]) => {
    if (process.env.JEV_SECTION_ROLES_ENABLED !== 'true') return candidates;
    const hydrated = await context.hydrateSectionCandidates(candidates, candidates.length);
    return context.toSectionCandidates(rankPriorAuthRoles(hydrated.map(c => c.section), asksForPriorAuthSubmissionProcess(queryLower)).map(section => ({ section })));
  };

  const frame = await context.finalizeFrame({
    questionType: 'prior_authorization',
    route,
    authoritativeCandidates,
    primaryCandidates: await rankCandidates(uniqueBy(
      [
        ...quantityDocumentPrimaryCandidates,
        ...criteriaDocumentPrimaryCandidates,
        ...headingPrimaryCandidates,
        ...documentPrimaryCandidates,
        ...primaryCandidates,
      ],
      (candidate) => candidate.sectionId,
    )),
    supportingCandidates: await rankCandidates(uniqueBy(
      [...documentSupportingCandidates, ...supportingCandidates],
      (candidate) => candidate.sectionId,
    )),
    avoidCandidates,
  });

  return rebalancePriorAuthFrame(frame, queryLower);
}
