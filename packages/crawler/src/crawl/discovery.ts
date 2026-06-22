import type { DiscoveredDocument, Fetcher, SourceModule, SourceType } from '../sources/types.js';
import { clinicalPoliciesSource } from '../sources/clinical-policies.js';
import { bulletinsSource } from '../sources/bulletins.js';
import { statePlanSource } from '../sources/state-plan.js';
import { waiversSource } from '../sources/waivers.js';
import { ncTracksSource } from '../sources/nctracks.js';
import { dhhsPoliciesSource } from '../sources/dhhs-policies.js';
import { feeSchedulesSource } from '../sources/fee-schedules.js';
import { billingGuidanceSource } from '../sources/billing-guidance.js';
import { managedCareGuidanceSource } from '../sources/managed-care-guidance.js';
import { managedCareContractsSource } from '../sources/managed-care-contracts.js';
import { logger } from '../utils/logger.js';

// Source modules registered here — add new sources as they're implemented
const sourceModules: Partial<Record<SourceType, SourceModule>> = {
  clinical_policy: clinicalPoliciesSource,
  bulletin: bulletinsSource,
  state_plan_amendment: statePlanSource,
  waiver: waiversSource,
  provider_manual: ncTracksSource,
  dhhs_policy: dhhsPoliciesSource,
  fee_schedule: feeSchedulesSource,
  billing_guidance: billingGuidanceSource,
  managed_care_guidance: managedCareGuidanceSource,
  managed_care_contract: managedCareContractsSource,
};

export async function discoverDocuments(
  fetcher: Fetcher,
  sourceTypes: SourceType[],
  sinceYear: number,
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
