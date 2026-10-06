import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../src/internal/shared.js';
import {
  buildCoverageDocumentCandidateProfiles,
  buildCoverageQueryFlags,
  isAdultCoverageQuestion,
} from '../src/frame/coverage-sections/candidates.js';

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

  it('keeps the telehealth profiles and the likely-limitation profile for yes/no telehealth questions', () => {
    const queryLower = normalizeSearchText('Does Policy 10A cover telehealth speech therapy?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(profiles.primaryProfiles.map((profile) => profile.id)).toContain('telehealth-primary');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('telehealth-supporting');
    expect(profiles.supportingProfiles.map((profile) => profile.id)).toContain('likely-limitation-supporting');
  });

  it('has no title-matched scope profile: a yes/no frame takes its description and criteria sections by structure', () => {
    const queryLower = normalizeSearchText('Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?');
    const flags = buildCoverageQueryFlags(queryLower);

    const general = buildCoverageDocumentCandidateProfiles(queryLower, flags);
    const structural = buildCoverageDocumentCandidateProfiles(queryLower, flags, true);

    expect(general.primaryProfiles.map((profile) => profile.id)).toEqual(['coverage-detail-primary']);
    expect(structural.primaryProfiles).toEqual([]);
    expect(structural.supportingProfiles.map((profile) => profile.id)).toEqual(['epsdt-exception-supporting']);
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

  it('puts the epsdt-exception profile first for adult yes/no and not-covered questions', () => {
    for (const question of [
      'Does Policy 10A cover routine massage therapy for beneficiaries over age 21?',
      'Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?',
      'What ambulance services are NOT covered by NC Medicaid?',
      'Does Policy 10A cover telehealth speech therapy?',
    ]) {
      const queryLower = normalizeSearchText(question);
      const flags = buildCoverageQueryFlags(queryLower);

      const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

      expect(profiles.supportingProfiles[0]?.id, question).toBe('epsdt-exception-supporting');
    }
  });

  it('puts the epsdt-exception profile first for adult coverage questions that are not a leading yes/no', () => {
    for (const question of [
      'What does Medicaid cover for acupuncture?',
      'Would Medicaid cover a gym membership?',
      'My mom needs dentures, are they covered?',
      'What does Policy 10A cover for outpatient specialized therapies?',
    ]) {
      const queryLower = normalizeSearchText(question);
      const flags = buildCoverageQueryFlags(queryLower);

      expect(flags.yesNoCoverageQuery, question).toBe(false);
      expect(isAdultCoverageQuestion(queryLower), question).toBe(true);
      expect(buildCoverageDocumentCandidateProfiles(queryLower, flags).supportingProfiles[0]?.id, question).toBe(
        'epsdt-exception-supporting',
      );
    }
  });

  it('does not count a question that mentions no coverage, or one about a child, as an adult coverage question', () => {
    expect(isAdultCoverageQuestion('what are the requirements for home modifications under cap/da?')).toBe(false);
    expect(isAdultCoverageQuestion('how do i recover a lost medicaid card?')).toBe(false);
    expect(isAdultCoverageQuestion('are braces covered for children?')).toBe(false);
    expect(isAdultCoverageQuestion('are braces covered for a beneficiary under age 21?')).toBe(false);
    expect(isAdultCoverageQuestion('what does epsdt cover?')).toBe(false);
  });

  it('omits the epsdt-exception profile when the question already asks about under-21/EPSDT', () => {
    const queryLower = normalizeSearchText('How does the EPSDT special provision affect outpatient therapy for children under 21?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(profiles.supportingProfiles.map((profile) => profile.id)).not.toContain('epsdt-exception-supporting');
  });

  it('omits the epsdt-exception profile for a yes/no question that is already pediatric', () => {
    const queryLower = normalizeSearchText('Does NC Medicaid cover speech therapy for children under EPSDT?');
    const flags = buildCoverageQueryFlags(queryLower);

    const profiles = buildCoverageDocumentCandidateProfiles(queryLower, flags);

    expect(flags.yesNoCoverageQuery).toBe(true);
    expect(profiles.supportingProfiles.map((profile) => profile.id)).not.toContain('epsdt-exception-supporting');
  });
});
