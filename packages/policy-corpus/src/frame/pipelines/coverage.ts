import type { QueryAnalysis } from '../../contracts.js';
import type { AnswerFrame, CorpusRetrievalHit } from '../../types.js';
import type { FrameContext } from '../context.js';
import { selectAnswerRoute } from '../../internal/answer-routing.js';
import { buildPolicyVariantFrameForDocuments } from './policy-variant.js';
import { rebalanceCoverageFrame } from '../rebalance/coverage.js';
import {
  buildCoverageQueryFlags,
  collectCoverageDocumentHydratedCandidates,
  collectYesNoStructuralCandidates,
  hasCoverageTheme,
  type YesNoStructuralCandidates,
} from '../coverage-sections/candidates.js';
import {
  hasPolicyTemplateSections,
  hasSubstantiveText,
  isEpsdtCrossReferenceNote,
  isEpsdtProvisionHeading,
  isYesNoSupportingTemplateSection,
} from '../coverage-sections/structure.js';
import {
  COVERAGE_AVOID_TERMS,
  COVERAGE_PRIMARY_TERMS,
  COVERAGE_SUPPORT_TERMS,
  FRAME_AVOID_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  HCWD_INCOME_RULE_TERMS,
  PRIOR_AUTH_AVOID_TERMS,
  buildHitText,
  buildSectionCandidates,
  extractDocumentView,
  extractTitleClusterTerms,
  includesPhrase,
  isAttachmentTitle,
  isBoilerplateTitle,
  isGenericSectionTitle,
  looksLikeSiblingPolicySet,
  normalizeSearchText,
  selectSettingPreferredDocuments,
  scoreTermMatches,
  uniqueBy,
  type DocumentCandidate,
  type HydratedSectionCandidate,
  type SectionCandidate,
} from '../../internal/shared.js';

interface CoverageSeedHits {
  candidateHits: CorpusRetrievalHit[];
  limitationHits: CorpusRetrievalHit[];
  primarySeedHits: CorpusRetrievalHit[];
  serviceClusterTerms: string[];
}

// Derives the candidate/limitation/primary-seed hit sets that feed the coverage
// answer frame. Scopes both candidate hits and focused-search hits to the
// preferred policy numbers (see h-012 note), then picks the strongest
// service-focused, weakly service-focused, or coverage-focused seed for the
// primary set, falling back to the top three primary hits.
function selectCoverageSeedHits({
  hits,
  focusHits,
  preferredPolicyNumbers,
  hcwdIncomePremiumQuery,
  serviceFocusTerms,
  queryTerms,
}: {
  hits: CorpusRetrievalHit[];
  focusHits: CorpusRetrievalHit[];
  preferredPolicyNumbers: Set<string>;
  hcwdIncomePremiumQuery: boolean;
  serviceFocusTerms: string[];
  queryTerms: string[];
}): CoverageSeedHits {
  const supplementalCandidateHits = hcwdIncomePremiumQuery
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
  // The focused-search hits must respect the same preferred-document scoping
  // as candidateHits: unioning RAW focusHits into the seed pool let a
  // non-preferred document's section lead primarySections even after routing
  // correctly scoped to the preferred policy (h-012: Residential Treatment's
  // therapeutic-leave section led a Nursing Facilities answer).
  const scopedFocusHits =
    preferredPolicyNumbers.size === 0
      ? focusHits
      : (() => {
          const scoped = focusHits.filter(
            (hit) => hit.policyNumber && preferredPolicyNumbers.has(hit.policyNumber.toUpperCase()),
          );
          return scoped.length > 0 ? scoped : focusHits;
        })();
  const serviceFocusedHits = serviceFocusTerms.length === 0
    ? []
    : uniqueBy([...scopedFocusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
        const focusMatches =
          scoreTermMatches(serviceFocusTerms, hit.sectionTitle) +
          Math.min(scoreTermMatches(serviceFocusTerms, hit.content), 4);
        return focusMatches >= 2;
      });
  const weaklyServiceFocusedHits = serviceFocusTerms.length === 0
    ? []
    : uniqueBy([...scopedFocusHits, ...primaryHits], (hit) => hit.sectionId).filter((hit) => {
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
  return { candidateHits, limitationHits, primarySeedHits, serviceClusterTerms };
}

interface CoverageCandidateSets {
  primaryCandidates: SectionCandidate[];
  supportingCandidates: SectionCandidate[];
}

// Yes/no question on a template policy: the description section leads, chosen
// by structure; the top search hits within the policy follow in score order
// and are read with their text; the template not-covered and covered sections
// (4.1, 4.2.1, 3.2.1) support. Nothing here looks at a section's body.
function buildYesNoCandidates({
  context,
  structural,
  documentPrimaryHydrated,
  documentSupportingHydrated,
  candidateHits,
  avoidTitleHits,
  limitationCandidates,
  themed,
}: {
  context: FrameContext;
  structural: YesNoStructuralCandidates;
  documentPrimaryHydrated: HydratedSectionCandidate[];
  documentSupportingHydrated: HydratedSectionCandidate[];
  candidateHits: CorpusRetrievalHit[];
  avoidTitleHits: CorpusRetrievalHit[];
  limitationCandidates: SectionCandidate[];
  /** The question has a theme whose rebalance branch ranks the title-matched profile sections. */
  themed: boolean;
}): CoverageCandidateSets {
  const avoidTitleHitIds = new Set(avoidTitleHits.map((hit) => hit.sectionId));
  const rankedHits = candidateHits
    .filter(
      (hit) =>
        !avoidTitleHitIds.has(hit.sectionId) &&
        // The EPSDT provision is supporting evidence, offered by its profile.
        !isEpsdtProvisionHeading({ sectionNumber: hit.sectionNumber, title: hit.sectionTitle }) &&
        // Nor is a section whose whole text is the note that points to it.
        !isEpsdtCrossReferenceNote(hit) &&
        !isAttachmentTitle(hit.sectionTitle) &&
        !isGenericSectionTitle(hit.sectionTitle) &&
        !isBoilerplateTitle(hit.sectionTitle) &&
        !normalizeSearchText(hit.sectionTitle).includes('requesting '),
    )
    .map((hit, index) => ({ hit, index }))
    .sort((left, right) => right.hit.score - left.hit.score || left.index - right.index)
    .map(({ hit }) => hit);
  const toCandidate = (hit: CorpusRetrievalHit): SectionCandidate => ({
    sectionId: hit.sectionId,
    reason: 'Search hit within the policy for the yes/no coverage question.',
  });
  const topHitCandidates = rankedHits.filter((hit) => !isYesNoSupportingTemplateSection(hit)).map(toCandidate);
  // A template section that is itself a hit is read last among the primary
  // candidates: rebalance lists it as supporting, and it leads only when the
  // policy offers no description and no other hit.
  const templateHitCandidates = rankedHits.filter((hit) => isYesNoSupportingTemplateSection(hit)).map(toCandidate);
  const profilePrimaryCandidates = context.toSectionCandidates(
    documentPrimaryHydrated.filter((candidate) => !isYesNoSupportingTemplateSection(candidate.section)),
  );
  const profileSupportingCandidates = context.toSectionCandidates(documentSupportingHydrated);
  return {
    primaryCandidates: uniqueBy(
      [
        ...context.toSectionCandidates(structural.descriptionHydrated),
        // Title-matched profile sections are read ahead of the hits only for
        // a themed question; otherwise they would crowd the hits out again.
        ...(themed ? profilePrimaryCandidates : []),
        ...topHitCandidates,
        ...(themed ? [] : profilePrimaryCandidates),
        ...templateHitCandidates,
      ],
      (candidate) => candidate.sectionId,
    ).slice(0, FRAME_PRIMARY_LIMIT * 2),
    supportingCandidates: uniqueBy(
      [
        ...context.toSectionCandidates(documentSupportingHydrated.filter((candidate) => isEpsdtProvisionHeading(candidate.section))),
        // As with the primary candidates: a themed question reads its
        // profile sections before the template criteria sections.
        ...(themed ? profileSupportingCandidates : []),
        ...context.toSectionCandidates(structural.templateSupportingHydrated),
        ...(themed ? [] : profileSupportingCandidates),
        ...topHitCandidates,
        ...limitationCandidates,
      ],
      (candidate) => candidate.sectionId,
    ).slice(0, FRAME_SUPPORT_LIMIT * 4),
  };
}

function buildServiceCandidates({
  context,
  documentPrimaryHydrated,
  documentSupportingHydrated,
  candidateHits,
  limitationHits,
  limitationCandidates,
  primarySeedHits,
  serviceFocusTerms,
  serviceClusterTerms,
}: {
  context: FrameContext;
  documentPrimaryHydrated: HydratedSectionCandidate[];
  documentSupportingHydrated: HydratedSectionCandidate[];
  candidateHits: CorpusRetrievalHit[];
  limitationHits: CorpusRetrievalHit[];
  limitationCandidates: SectionCandidate[];
  primarySeedHits: CorpusRetrievalHit[];
  serviceFocusTerms: string[];
  serviceClusterTerms: string[];
}): CoverageCandidateSets {
  const primaryCandidateLimit = serviceFocusTerms.length > 0 ? 2 : FRAME_PRIMARY_LIMIT * 2;
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
  return {
    primaryCandidates: uniqueBy(
      [
        ...context.toSectionCandidates(documentPrimaryHydrated),
        ...buildSectionCandidates(
          primarySeedHits,
          COVERAGE_PRIMARY_TERMS,
          COVERAGE_AVOID_TERMS,
          primaryCandidateLimit,
          'Primary coverage evidence.',
        ),
      ],
      (candidate) => candidate.sectionId,
    ).slice(0, FRAME_PRIMARY_LIMIT * 2),
    supportingCandidates: uniqueBy(
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
    ).slice(0, FRAME_SUPPORT_LIMIT * 4),
  };
}

export async function resolveCoverageFrame(
  context: FrameContext,
  analysis: QueryAnalysis,
): Promise<AnswerFrame> {
  const { query, normalizedQuery: queryLower, route, searchTerms: queryTerms, serviceFocusTerms } = analysis;
  const flags = buildCoverageQueryFlags(queryLower);
  const baseHits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 16 : route.lane === 'baseline_hybrid' ? 18 : 24,
  });
  const hcwdHistoryHits =
    flags.hcwdIncomePremiumQuery && flags.earnedIncomeLimitQuery
      ? await context.collectHcwdIncomeHistoryHits()
      : [];
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
  const { documents: routingDocuments, droppedDocuments } = await context.collectCoverageRoutingDocuments(query, hits);
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
  // A yes/no question about a clinical coverage policy written on the
  // template is framed by that template's structure. Manuals and other
  // documents keep the service-focused selection, whatever their sections
  // are numbered.
  const yesNoStructure =
    flags.yesNoCoverageQuery &&
    scopedRoutingDocuments[0]?.documentType === 'clinical_policy' &&
    hasPolicyTemplateSections(scopedRoutingDocuments[0].sections);
  const { candidateHits, limitationHits, primarySeedHits, serviceClusterTerms } = selectCoverageSeedHits({
    hits,
    focusHits,
    preferredPolicyNumbers,
    hcwdIncomePremiumQuery: flags.hcwdIncomePremiumQuery,
    serviceFocusTerms,
    queryTerms,
  });
  const profileCandidates = await collectCoverageDocumentHydratedCandidates({
    context,
    scopedRoutingDocuments,
    queryLower,
    flags,
    yesNoStructure,
  });
  // A section with no body is never offered for a primary or supporting slot.
  const documentPrimaryHydrated = profileCandidates.documentPrimaryHydrated.filter((candidate) => hasSubstantiveText(candidate.section));
  const documentSupportingHydrated = profileCandidates.documentSupportingHydrated.filter((candidate) =>
    hasSubstantiveText(candidate.section),
  );
  // A hit is negative guidance only when its own heading carries an avoid
  // term the question did not use. Matching avoid terms in body text put the
  // answering section in the avoid list, and a question about "contact
  // lenses" is asking for the section with "contact" in its title.
  const avoidTerms = [
    ...PRIOR_AUTH_AVOID_TERMS,
    ...COVERAGE_AVOID_TERMS,
    ...(flags.telehealthQuery ? flags.telehealthAvoidTerms : []),
  ].filter((term) => !queryLower.includes(term));
  const avoidTitleHits = candidateHits.filter((hit) => includesPhrase(normalizeSearchText(hit.sectionTitle), avoidTerms));
  const limitationCandidates = buildSectionCandidates(
    limitationHits,
    ['not covered', 'limitation', 'limitations', 'exclusion'],
    [],
    FRAME_SUPPORT_LIMIT * 4,
    'Supporting limitation evidence.',
  );
  const { primaryCandidates, supportingCandidates } = yesNoStructure
    ? buildYesNoCandidates({
        context,
        structural: await collectYesNoStructuralCandidates({ context, scopedRoutingDocuments }),
        documentPrimaryHydrated,
        documentSupportingHydrated,
        candidateHits,
        avoidTitleHits,
        limitationCandidates,
        themed: hasCoverageTheme(flags),
      })
    : buildServiceCandidates({
        context,
        documentPrimaryHydrated,
        documentSupportingHydrated,
        candidateHits,
        limitationHits,
        limitationCandidates,
        primarySeedHits,
        serviceFocusTerms,
        serviceClusterTerms,
      });
  const avoidCandidates = buildSectionCandidates(
    avoidTitleHits,
    avoidTerms,
    [],
    FRAME_AVOID_LIMIT,
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
    variantReasoning: variantFrame?.variantReasoning ?? settingPreference.reason,
    latestRevisionSections: [],
  });
  // Avoid sections are read here, with their text, so that rebalance judges
  // them on what they say and a section it promotes keeps its body. Rebalance
  // strips the text from whatever is still an avoid section when it returns.
  const surfacedIds = new Set([...frame.primarySections, ...frame.supportingSections].map((section) => section.id));
  const avoidSections = (await context.hydrateSectionCandidates(avoidCandidates, FRAME_AVOID_LIMIT, surfacedIds)).map(
    (candidate) => candidate.section,
  );
  const rebalanced = rebalanceCoverageFrame({ ...frame, avoidSections }, queryLower, serviceFocusTerms, serviceClusterTerms, yesNoStructure);
  // A document routing dropped can come back through the variant or EPSDT
  // paths; only one the finished frame does not carry is reported as dropped.
  const framePolicies = new Set(rebalanced.authoritativeDocuments.map((document) => document.policyNumber?.toUpperCase()));
  const stillDropped = droppedDocuments.filter((document) => !framePolicies.has(document.policyNumber?.toUpperCase()));
  if (stillDropped.length === 0) return rebalanced;
  return {
    ...rebalanced,
    droppedDocuments: stillDropped.map((document) => ({
      ...extractDocumentView(document),
      reason: 'Lower-ranked document left out of the frame by inferred coverage routing; not read.',
    })),
  };
}
