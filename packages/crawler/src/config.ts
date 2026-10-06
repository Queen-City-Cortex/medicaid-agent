import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS_MANIFEST, getSourceFamily } from './corpus-manifest.js';
import type { SourceType } from './sources/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const corpusDataRoot = process.env.CORPUS_DATA_ROOT?.trim();
const dataRoot = corpusDataRoot
  ? path.resolve(corpusDataRoot, 'crawler')
  : path.join(projectRoot, 'data');

const clinicalPolicySource = getSourceFamily('clinical_policy');
const bulletinSource = getSourceFamily('bulletin');
const statePlanSource = getSourceFamily('state_plan_amendment');
const waiverSource = getSourceFamily('waiver');
const providerManualSource = getSourceFamily('provider_manual');
const dhhsPolicySource = getSourceFamily('dhhs_policy');
const feeScheduleSource = getSourceFamily('fee_schedule');
const billingGuidanceSource = getSourceFamily('billing_guidance');
const managedCareGuidanceSource = getSourceFamily('managed_care_guidance');
const managedCareContractSource = getSourceFamily('managed_care_contract');
const beneficiaryGuidanceSource = getSourceFamily('beneficiary_guidance');

export const config = {
  // Paths (resolved relative to crawler/ root)
  dataDir: dataRoot,
  documentsDir: path.join(dataRoot, 'documents'),
  dbPath: path.join(dataRoot, 'crawler.db'),
  logPath: path.join(dataRoot, 'crawl.log'),

  // Rate limiting
  defaultDelayMs: 2000,
  maxConcurrentDomains: 3,
  requestTimeoutMs: 30000,
  maxRetries: 5,
  backoffBaseMs: 30000,
  backoffMaxMs: 600000,

  // Crawl scope
  defaultSinceYear: 2018,

  // A document is only marked 'removed' after it 404s on this many
  // consecutive attempts — transient 404s (CDN hiccups, mid-deploy windows)
  // stay 'error' and retry on the next run.
  notFoundRemovalThreshold: 3,

  // Fewest documents a default full crawl may list for a family before its
  // discovery counts as failed. Each floor is about half the lowest count in
  // workstation runs #24-#26 (2026-08-29 to 2026-09-26), taking bulletins from
  // #24 and #25 only: the broken listing parser returned 96 in run #26, which
  // the floor must stay above. These numbers await the owner's confirmation.
  // Lower a floor deliberately when the agency really shrinks a family.
  minDiscoveredDocuments: {
    clinical_policy: 90, // 177
    bulletin: 190, // 388-389
    state_plan_amendment: 190, // 385-393
    waiver: 6, // 12
    provider_manual: 16, // 33
    dhhs_policy: 450, // 920-1037
    fee_schedule: 1000, // 1998
    billing_guidance: 9, // 19-20
    managed_care_guidance: 120, // 249
    managed_care_contract: 50, // 111
    beneficiary_guidance: 1, // static seed list; nothing is fetched
  } satisfies Record<SourceType, number>,

  // User agent
  userAgent:
    'NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)',

  // File limits
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  maxRedirects: 5,

  // Sources
  sources: {
    clinical_policy: {
      indexUrl: clinicalPolicySource.landing_pages[0],
      enabled: true,
    },
    bulletin: {
      indexUrl: bulletinSource.landing_pages[0],
      blogListingUrl: bulletinSource.landing_pages[1],
      digestsUrl: bulletinSource.landing_pages[2],
      archiveBaseUrl: bulletinSource.landing_pages[3],
      enabled: true,
    },
    state_plan_amendment: {
      indexUrl: statePlanSource.landing_pages[0],
      enabled: true,
    },
    waiver: {
      seedUrls: waiverSource.seed_urls,
      enabled: true,
    },
    provider_manual: {
      indexUrl: providerManualSource.landing_pages[0],
      enabled: true,
    },
    dhhs_policy: {
      indexUrl: dhhsPolicySource.landing_pages[0],
      enabled: true,
    },
    fee_schedule: {
      landingPages: feeScheduleSource.landing_pages,
      enabled: true,
    },
    billing_guidance: {
      landingPages: billingGuidanceSource.landing_pages,
      enabled: true,
    },
    managed_care_guidance: {
      landingPages: managedCareGuidanceSource.landing_pages,
      enabled: true,
    },
    managed_care_contract: {
      landingPages: managedCareContractSource.landing_pages,
      enabled: true,
    },
    beneficiary_guidance: {
      landingPages: beneficiaryGuidanceSource.landing_pages,
      seedUrls: beneficiaryGuidanceSource.seed_urls,
      enabled: true,
    },
  },
} as const;

// Source type directory mapping
export const SOURCE_TYPE_DIRS: Record<string, string> = Object.fromEntries(
  CORPUS_MANIFEST.source_families.map((family) => [
    family.source_type,
    family.directory_name,
  ]),
);
