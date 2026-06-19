import type { QueryAnalysis } from '../../contracts.js';
import type { AnswerFrame, DocumentWithSectionsView } from '../../types.js';
import type { FrameContext } from '../context.js';
import {
  AMENDMENT_PRIMARY_TERMS,
  AMENDMENT_SUPPORT_TERMS,
  COVERAGE_AVOID_TERMS,
  FRAME_AVOID_LIMIT,
  FRAME_PRIMARY_LIMIT,
  FRAME_SUPPORT_LIMIT,
  buildSectionCandidates,
  changeMarkerValueForHit,
  dedupeTerms,
  isRevisionHeaderTitle,
  uniqueBy,
} from '../../internal/shared.js';

export async function resolveAmendmentFrame(
  context: FrameContext,
  analysis: QueryAnalysis,
): Promise<AnswerFrame> {
  const { query, route, flags: { asksForHistory } } = analysis;
  const hits = await context.searchSectionsDetailed({
    query,
    topK: route.lane === 'deterministic_evidence' ? 10 : 12,
  });
  const latestRevisionOnly = route.determinism_hints.latest_revision_only;
  const revisionHeaderHits = hits.filter((hit) => isRevisionHeaderTitle(hit.sectionTitle));
  const latestRevisionMarkerValue = revisionHeaderHits.reduce<number | null>((latest, hit) => {
    const candidate = changeMarkerValueForHit(hit);
    if (candidate === null) return latest;
    if (latest === null || candidate > latest) return candidate;
    return latest;
  }, null);
  const latestRevisionHeaderHits =
    latestRevisionOnly && latestRevisionMarkerValue !== null
      ? revisionHeaderHits.filter((hit) => changeMarkerValueForHit(hit) === latestRevisionMarkerValue)
      : revisionHeaderHits;
  const latestRevisionPrimaryCandidates =
    latestRevisionOnly && latestRevisionHeaderHits.length > 0
      ? buildSectionCandidates(
          latestRevisionHeaderHits,
          AMENDMENT_PRIMARY_TERMS,
          COVERAGE_AVOID_TERMS,
          FRAME_PRIMARY_LIMIT * 2,
          'Latest revision header from the governing policy document.',
        )
      : [];
  const latestRevisionHydrated = latestRevisionOnly
    ? await context.hydrateSectionCandidates(latestRevisionPrimaryCandidates, FRAME_PRIMARY_LIMIT)
    : [];
  const lookupDocuments = await context.collectLookupDocuments(query);
  const baseDocuments = lookupDocuments.length > 0
    ? lookupDocuments
    : uniqueBy(
        (
          await Promise.all(
            dedupeTerms(hits.map((hit) => hit.sectionId)).slice(0, 4).map(async (sectionId) => {
              const section = await context.getSection(sectionId);
              if (!section?.documentId) return null;
              return context.getDocument(section.documentId);
            }),
          )
        ).filter((document): document is DocumentWithSectionsView => document != null),
        (document) => document.id,
      );
  const amendmentViews = await Promise.all(baseDocuments.map((document) => context.getAmendments(document.id)));
  const authoritativeCandidates = [
    ...(await context.collectDocumentsForSections(
      latestRevisionHydrated.map((candidate) => candidate.section),
      'Document containing the latest verified revision marker.',
    )).map((candidate, index) => ({
      ...candidate,
      score: 1.7 - index * 0.05,
    })),
  ];
  for (const [index, view] of amendmentViews.entries()) {
    if (!latestRevisionOnly && view.authoritativeDocument) {
      authoritativeCandidates.push({
        document: view.authoritativeDocument,
        reason: 'Authoritative document from amendment lookup.',
        score: 1.3 - index * 0.05,
      });
    }
    if (!latestRevisionOnly && view.baseDocument) {
      authoritativeCandidates.push({
        document: view.baseDocument,
        reason: 'Base document referenced by the amendment trail.',
        score: 0.9 - index * 0.05,
      });
    }
  }

  // When the user explicitly names a policy (via lookupPolicy), those
  // documents must outrank revision-header matches from *other* policies.
  // Otherwise a query that explicitly asks about Policy 8C routes to some
  // unrelated MA-series doc whose section titles happen to include
  // "REVISED / CHANGE NO." (clinical coverage policies use "Revision
  // Information:" which doesn't match the title heuristic). Only boost
  // when the looked-up document isn't already represented in the
  // authoritative candidates — otherwise we double-count.
  const existingAuthoritativeIds = new Set(authoritativeCandidates.map((c) => c.document.id));
  lookupDocuments.forEach((document, index) => {
    if (existingAuthoritativeIds.has(document.id)) return;
    authoritativeCandidates.push({
      document,
      reason: 'Explicit policy lookup (takes precedence over unrelated revision-header hits).',
      score: 1.8 - index * 0.05,
    });
  });

  const primaryCandidates = uniqueBy(
    [
      ...latestRevisionPrimaryCandidates,
      ...buildSectionCandidates(
        latestRevisionOnly && latestRevisionHeaderHits.length > 0 ? latestRevisionHeaderHits : hits,
        AMENDMENT_PRIMARY_TERMS,
        COVERAGE_AVOID_TERMS,
        FRAME_PRIMARY_LIMIT * 2,
        latestRevisionOnly ? 'Latest revision header or marker section.' : 'Revision header or amendment section.',
      ),
    ],
    (candidate) => candidate.sectionId,
  );
  const supportingCandidates = asksForHistory
    ? buildSectionCandidates(
        hits,
        AMENDMENT_SUPPORT_TERMS,
        [],
        FRAME_SUPPORT_LIMIT * 2,
        'Older amendment context requested by the question.',
      )
    : [];
  const avoidCandidates = asksForHistory || latestRevisionOnly
    ? []
    : buildSectionCandidates(
        latestRevisionOnly && latestRevisionHeaderHits.length > 0
          ? hits.filter((hit) => !latestRevisionHeaderHits.some((headerHit) => headerHit.sectionId === hit.sectionId))
          : hits,
        latestRevisionOnly
          ? ['content of change', 'change notice', 'effective date', 'history', 'background']
          : ['effective date', 'history', 'background'],
        [],
        FRAME_AVOID_LIMIT,
        latestRevisionOnly
          ? 'Older amendment details that should not displace the latest verified revision marker.'
          : 'Older or low-signal amendment context that should not displace the latest revision.',
      );

  return context.finalizeFrame({
    questionType: 'amendment',
    route,
    authoritativeCandidates,
    primaryCandidates,
    supportingCandidates,
    avoidCandidates,
  });
}
