import type { FrameContext } from '../context.js';
import { uniqueBy, type HydratedSectionCandidate } from '../../internal/shared.js';
import type { DocumentWithSectionsView } from '../../types.js';
import type { CoverageQueryFlags } from './flags.js';
import { buildCoverageDocumentCandidateProfiles, type CoverageDocumentCandidateProfile } from './document-candidate-profiles.js';

export async function collectCoverageDocumentHydratedCandidates({
  context,
  scopedRoutingDocuments,
  queryLower,
  flags,
}: {
  context: FrameContext;
  scopedRoutingDocuments: DocumentWithSectionsView[];
  queryLower: string;
  flags: CoverageQueryFlags;
}): Promise<{
  documentPrimaryHydrated: HydratedSectionCandidate[];
  documentSupportingHydrated: HydratedSectionCandidate[];
}> {
  const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);
  const documentPrimaryHydrated = await collectProfiles(context, scopedRoutingDocuments, profiles.primaryProfiles);
  const documentSupportingHydrated = await collectProfiles(context, scopedRoutingDocuments, profiles.supportingProfiles);

  return {
    documentPrimaryHydrated,
    documentSupportingHydrated,
  };
}

async function collectProfiles(
  context: FrameContext,
  scopedRoutingDocuments: DocumentWithSectionsView[],
  profiles: CoverageDocumentCandidateProfile[],
): Promise<HydratedSectionCandidate[]> {
  const collected: HydratedSectionCandidate[] = [];
  for (const profile of profiles) {
    const results =
      profile.collector === 'likely_limitation'
        ? await context.collectLikelyCoverageLimitationSectionCandidates(
            scopedRoutingDocuments,
            profile.reason,
            profile.limit,
          )
        : await context.collectDocumentSectionCandidates(
            scopedRoutingDocuments,
            profile.includeTerms,
            profile.avoidTerms,
            profile.reason,
            profile.limit,
          );
    collected.push(...results);
  }

  return uniqueBy(collected, (candidate) => candidate.section.id);
}
