import type { QueryAnalysis, RetrievalProfile } from '../contracts.js';
import type { SearchSectionsInput } from '../types.js';
import { buildRetrievalProfileSignals } from './retrieval-signals.js';

export function selectRetrievalProfile(
  input: SearchSectionsInput,
  analysis: QueryAnalysis,
): RetrievalProfile {
  const signals = buildRetrievalProfileSignals(input, analysis);

  return {
    name: signals.profileName,
    lane: analysis.route.lane,
    wideningPolicy: analysis.route.widening_policy,
    hasExplicitDocumentTypes: signals.hasExplicitDocumentTypes,
    typeGroups: signals.typeGroups,
    perGroupK: signals.perGroupK,
    enabledBackends: signals.enabledBackends,
  };
}
