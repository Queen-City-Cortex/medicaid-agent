import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../src/internal/shared.js';
import { buildCoverageDocumentCandidateProfiles, buildCoverageQueryFlags } from '../src/frame/coverage/candidates.js';

describe('coverage document candidate profiles', () => {
  it('enables eligibility primary and supporting profiles for CAP/DA criteria questions', () => {
    const queryLower = normalizeSearchText('What are the general eligibility criteria for CAP/DA services under NC Medicaid?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('eligibility-baseline-primary');
    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('eligibility-general-primary');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('eligibility-scope-supporting');
    expect(profiles.primaryProfiles.map((profile) => profile.id)).not.toContain('telehealth-primary');
  });

  it('enables telehealth and yes/no profiles together for telehealth coverage questions', () => {
    const queryLower = normalizeSearchText('Does Policy 10A cover telehealth speech therapy?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('telehealth-primary');
    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('coverage-scope-primary');
    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('yes-no-coverage-primary');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('telehealth-supporting');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('likely-limitation-supporting');
  });

  it('enables congregate-specific primary and supporting profiles for assisted-living PCS questions', () => {
    const queryLower = normalizeSearchText('Is PCS covered in assisted living or other congregate settings?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('congregate-criteria-primary');
    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('congregate-service-primary');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('congregate-not-covered-supporting');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('congregate-support-supporting');
  });
});
