import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS_MANIFEST, getSourceFamily } from './corpus-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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

export const config = {
  // Paths (resolved relative to crawler/ root)
  dataDir: path.join(projectRoot, 'data'),
  documentsDir: path.join(projectRoot, 'data', 'documents'),
  dbPath: path.join(projectRoot, 'data', 'crawler.db'),
  logPath: path.join(projectRoot, 'data', 'crawl.log'),

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
  },
} as const;

// Source type directory mapping
export const SOURCE_TYPE_DIRS: Record<string, string> = Object.fromEntries(
  CORPUS_MANIFEST.source_families.map((family) => [
    family.source_type,
    family.directory_name,
  ]),
);
