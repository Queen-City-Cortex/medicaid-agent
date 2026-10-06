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
import { beneficiaryGuidanceSource } from '../sources/beneficiary-guidance.js';
import { ncStatuteSource } from '../sources/nc-statutes.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

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
  beneficiary_guidance: beneficiaryGuidanceSource,
  nc_statute: ncStatuteSource,
};

/**
 * Run each family's discovery. A family passes only when its module returns
 * without throwing and lists at least one document; with `enforceMinimums`
 * (default full runs) it must also reach its configured floor. Documents from
 * a family that fell short are still returned: recording them is harmless,
 * but the family is reported as failed so it is not stamped fresh.
 */
export async function discoverDocuments(
  fetcher: Fetcher,
  sourceTypes: SourceType[],
  sinceYear: number,
  options: { enforceMinimums: boolean },
): Promise<{
  documents: DiscoveredDocument[];
  successfulSourceTypes: SourceType[];
  failedSourceTypes: SourceType[];
}> {
  const queue = [...sourceTypes];
  const workerCount = Math.min(
    Math.max(1, config.maxConcurrentDomains),
    queue.length,
  );
  const successfulSourceTypes: SourceType[] = [];
  const failedSourceTypes: SourceType[] = [];
  const workers = Array.from({ length: workerCount }, async () => {
    const documents: DiscoveredDocument[] = [];
    while (queue.length > 0) {
      const sourceType = queue.shift();
      if (!sourceType) break;
      const module = sourceModules[sourceType];
      if (!module) {
        logger.warn(`No discovery module for source type: ${sourceType}`);
        failedSourceTypes.push(sourceType);
        continue;
      }

      try {
        const found = await module.discover(fetcher, sinceYear);
        documents.push(...found);
        const minimum = options.enforceMinimums
          ? config.minDiscoveredDocuments[sourceType]
          : 1;
        if (found.length < minimum) {
          throw new Error(
            `listed ${found.length} documents, expected at least ${minimum}`,
          );
        }
        successfulSourceTypes.push(sourceType);
      } catch (err) {
        failedSourceTypes.push(sourceType);
        logger.error(
          `Discovery failed for ${sourceType}: ${(err as Error).message}`,
          err,
        );
        // Continue with other sources — don't crash the run
      }
    }
    return documents;
  });

  return {
    documents: (await Promise.all(workers)).flat(),
    successfulSourceTypes,
    failedSourceTypes,
  };
}
