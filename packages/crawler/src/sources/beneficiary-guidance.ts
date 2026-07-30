import { getSourceFamily } from '../corpus-manifest.js';
import type { DiscoveredDocument, SourceModule } from './types.js';

const sourceFamily = getSourceFamily('beneficiary_guidance');

const TITLES = new Map<string, string>([
  [
    'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing',
    'Medicaid is Changing',
  ],
  [
    'https://medicaid.ncdhhs.gov/beneficiaries/impact-hr-1-and-federal-changes-medicaid/nc-medicaid-work-and-community-engagement-requirements',
    'NC Medicaid Work and Community Engagement Requirements',
  ],
]);

export function discoverBeneficiaryGuidance(): DiscoveredDocument[] {
  return sourceFamily.seed_urls.map((sourceUrl) => ({
    source_url: sourceUrl,
    discovered_from: sourceUrl,
    source_type: 'beneficiary_guidance',
    title: TITLES.get(sourceUrl) ?? null,
    policy_number: null,
    category: 'Beneficiary Guidance',
  }));
}

export const beneficiaryGuidanceSource: SourceModule = {
  async discover() {
    return discoverBeneficiaryGuidance();
  },
};
