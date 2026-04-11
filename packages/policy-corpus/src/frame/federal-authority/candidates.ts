import type { FrameContext } from '../context.js';
import {
  COVERAGE_AVOID_TERMS,
  COVERAGE_PRIMARY_TERMS,
  FEDERAL_DOCUMENT_SUPPORT_TERMS,
  FRAME_AVOID_LIMIT,
  FRAME_SUPPORT_LIMIT,
  MLR_FEDERAL_SUPPORT_SECTION_TERMS,
  WAIVER_APPLICATION_AVOID_TERMS,
  WAIVER_APPLICATION_PRIMARY_TERMS,
  buildHitText,
  buildSectionCandidates,
  dedupeTerms,
  includesPhrase,
  uniqueBy,
} from '../../internal/shared.js';
import type {
  FederalAuthorityEvidence,
  FederalAuthoritySignals,
  FederalImplementationEvidence,
} from './types.js';

export async function buildFederalAuthorityCandidateSets(
  context: FrameContext,
  signals: FederalAuthoritySignals,
  federalEvidence: FederalAuthorityEvidence,
  implementationEvidence: FederalImplementationEvidence,
) {
  const federalDocumentSupportCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      federalEvidence.primaryFederalDocuments,
      dedupeTerms([
        ...FEDERAL_DOCUMENT_SUPPORT_TERMS,
        ...signals.focusTerms,
        ...(signals.waiverApplicationQuery ? WAIVER_APPLICATION_PRIMARY_TERMS : []),
        ...(signals.mlrQuery ? MLR_FEDERAL_SUPPORT_SECTION_TERMS : []),
      ]),
      signals.publicNoticeQuery || !signals.waiverApplicationQuery ? [] : WAIVER_APPLICATION_AVOID_TERMS,
      'Supporting federal reporting or enforcement section from the same authority document.',
      FRAME_SUPPORT_LIMIT * 2,
    ),
    0.05,
  );
  const implementationDocumentSupportCandidates = context.toSectionCandidates(
    await context.collectDocumentSectionCandidates(
      implementationEvidence.implementationDocuments,
      signals.implementationSectionTerms,
      COVERAGE_AVOID_TERMS,
      'State implementation section from the NC policy document named by the question.',
      FRAME_SUPPORT_LIMIT * 2,
    ),
    0.12,
  );
  const implementationSupportCandidates = buildSectionCandidates(
    implementationEvidence.scopedImplementationHits,
    signals.implementationSectionTerms,
    [],
    FRAME_SUPPORT_LIMIT * 2,
    'NC implementation or oversight evidence related to the federal rule.',
  );
  const avoidCandidates = buildSectionCandidates(
    signals.waiverApplicationQuery
      ? uniqueBy(
          [
            ...implementationEvidence.scopedImplementationHits,
            ...federalEvidence.waiverRankedFederalHits.filter((hit) =>
              includesPhrase(buildHitText(hit), WAIVER_APPLICATION_AVOID_TERMS),
            ),
          ],
          (hit) => hit.sectionId,
        )
      : implementationEvidence.scopedImplementationHits,
    signals.waiverApplicationQuery ? WAIVER_APPLICATION_AVOID_TERMS : COVERAGE_PRIMARY_TERMS,
    [],
    FRAME_AVOID_LIMIT,
    signals.waiverApplicationQuery
      ? 'Procedural federal section that should stay secondary to the waiver authority and application requirements.'
      : 'Service-specific policy evidence that should not displace the federal authority.',
  );

  return {
    primaryCandidates: federalEvidence.primaryCandidates,
    supportingCandidates: uniqueBy(
      signals.implementationQuery
        ? [
            ...implementationDocumentSupportCandidates,
            ...implementationSupportCandidates,
            ...federalDocumentSupportCandidates,
          ]
        : [...federalDocumentSupportCandidates, ...implementationSupportCandidates],
      (candidate) => candidate.sectionId,
    ),
    avoidCandidates,
    authoritativeCandidates: federalEvidence.authoritativeCandidates,
  };
}
