import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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

  // User agent
  userAgent:
    'NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)',

  // File limits
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  maxRedirects: 5,

  // Sources
  sources: {
    clinical_policy: {
      indexUrl:
        'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies',
      enabled: true,
    },
    bulletin: {
      indexUrl: 'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin',
      blogListingUrl: 'https://medicaid.ncdhhs.gov/blog-category/bulletins',
      digestsUrl:
        'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests',
      archiveBaseUrl:
        'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive',
      enabled: true,
    },
    state_plan_amendment: {
      indexUrl:
        'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices',
      enabled: true,
    },
    waiver: {
      seedUrls: [
        'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver',
        'https://medicaid.ncdhhs.gov/beneficiaries/1915i',
      ],
      enabled: true,
    },
    provider_manual: {
      indexUrl: 'https://www.nctracks.nc.gov/content/public/providers/provider-manuals.html',
      enabled: true,
    },
    dhhs_policy: {
      indexUrl: 'https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/',
      enabled: true,
    },
  },
} as const;

// Source type directory mapping
export const SOURCE_TYPE_DIRS: Record<string, string> = {
  clinical_policy: 'clinical-policies',
  bulletin: 'bulletins',
  state_plan_amendment: 'state-plan-amendments',
  waiver: 'waivers',
  provider_manual: 'provider-manuals',
  dhhs_policy: 'dhhs-policies',
};
