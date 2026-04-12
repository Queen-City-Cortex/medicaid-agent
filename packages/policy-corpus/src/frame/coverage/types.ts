import type { AnswerFrameSection } from '../../types.js';

export interface CoverageScoredSection {
  section: AnswerFrameSection;
  text: string;
  limitation: boolean;
  primaryScore: number;
  supportScore: number;
}

export interface CoverageSectionGroups {
  generalEligibilityAnchorSections: AnswerFrameSection[];
  generalEligibilityContextSections: AnswerFrameSection[];
  generalEligibilityAdministrativeSections: AnswerFrameSection[];
  generalEligibilityLimitationSections: AnswerFrameSection[];
  coverageScopeSections: AnswerFrameSection[];
  congregateCriteriaSections: AnswerFrameSection[];
  congregateServiceSections: AnswerFrameSection[];
  congregateRoomAndBoardSections: AnswerFrameSection[];
  congregateWorkflowSections: AnswerFrameSection[];
  congregateGeneralLimitationSections: AnswerFrameSection[];
}
