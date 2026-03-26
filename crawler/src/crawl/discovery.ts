import type { DiscoveredDocument, Fetcher, SourceType } from '../sources/types.js';
import { clinicalPoliciesSource } from '../sources/clinical-policies.js';
import { bulletinsSource } from '../sources/bulletins.js';
import { logger } from '../utils/logger.js';

// Source modules registered here — add new sources as they're implemented
const sourceModules: Partial<
  Record<SourceType, { discover: (fetcher: Fetcher, sinceYear?: number) => Promise<DiscoveredDocument[]> }>
> = {
  clinical_policy: clinicalPoliciesSource,
  bulletin: bulletinsSource,
  // state_plan_amendment: statePlan, // Task 13
  // waiver: waivers,                 // Task 14
};

export async function discoverDocuments(
  fetcher: Fetcher,
  sourceTypes: SourceType[],
  sinceYear?: number,
): Promise<DiscoveredDocument[]> {
  const allDocuments: DiscoveredDocument[] = [];

  for (const sourceType of sourceTypes) {
    const module = sourceModules[sourceType];
    if (!module) {
      logger.warn(`No discovery module for source type: ${sourceType}`);
      continue;
    }

    try {
      const documents = await module.discover(fetcher, sinceYear);
      allDocuments.push(...documents);
    } catch (err) {
      logger.error(
        `Discovery failed for ${sourceType}: ${(err as Error).message}`,
        err,
      );
      // Continue with other sources — don't crash the run
    }
  }

  return allDocuments;
}
