import type { AnswerFrameSection } from '../types.js';
import { combineText, includesPhrase, isPriorAuthCriteriaSection, isPriorAuthProcessSection,
  isCoverageLimitationText, isCoverageBoilerplateTitle, isAdministrativeFormTitle,
  GENERAL_CRITERIA_SECTION_TERMS, YES_NO_COVERAGE_SECTION_TERMS } from '../internal/shared.js';
/** Transparent reference to the corpus's existing predicates and term lists. */
export function sectionRoleHeuristics(section: AnswerFrameSection) {
  const text = combineText(section.title, section.content);
  return {
    scope: includesPhrase(text, ['eligibility', 'eligible beneficiaries', 'scope']),
    covered_services: includesPhrase(text, [...GENERAL_CRITERIA_SECTION_TERMS, ...YES_NO_COVERAGE_SECTION_TERMS]),
    exclusions: isCoverageLimitationText(text), pa_criteria: isPriorAuthCriteriaSection(section),
    pa_procedure: isPriorAuthProcessSection(section),
    billing_workflow: includesPhrase(text, ['billing', 'claims submission', 'reimbursement']),
    boilerplate: isCoverageBoilerplateTitle(section.title), forms: isAdministrativeFormTitle(section.title),
  };
}
