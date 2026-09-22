import { describe, expect, it } from 'vitest';
import { discoverBeneficiaryGuidance } from '../../src/sources/beneficiary-guidance.js';

const MEDICAID_IS_CHANGING_URL =
  'https://medicaid.ncdhhs.gov/beneficiaries/medicaid-is-changing';
const WORK_REQUIREMENTS_URL =
  'https://medicaid.ncdhhs.gov/beneficiaries/impact-hr-1-and-federal-changes-medicaid/nc-medicaid-work-and-community-engagement-requirements';

describe('beneficiary guidance source', () => {
  it('discovers the two canonical beneficiary guidance pages', () => {
    const docs = discoverBeneficiaryGuidance();

    expect(docs).toEqual([
      expect.objectContaining({
        source_url: MEDICAID_IS_CHANGING_URL,
        source_type: 'beneficiary_guidance',
        title: 'Medicaid is Changing',
      }),
      expect.objectContaining({
        source_url: WORK_REQUIREMENTS_URL,
        source_type: 'beneficiary_guidance',
        title: 'The Work and Community Engagement Requirement',
      }),
    ]);
  });
});
