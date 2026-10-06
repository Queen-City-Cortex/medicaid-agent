import { z } from 'zod';
import {
  ResearchPlanSchema,
  ResearchReportSchema,
  ResearchStartInputSchema,
  ResearchSubQuestionSchema,
} from '@nc-medicaid/contracts';

// ── Plan ──────────────────────────────────────────────────────────────────────

export const SubQuestionSchema = ResearchSubQuestionSchema;
export type SubQuestion = z.infer<typeof SubQuestionSchema>;

export { ResearchPlanSchema };
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

// ── Findings ──────────────────────────────────────────────────────────────────

export const FindingSchema = z.object({
  subQuestion: z.string(),
  summary: z
    .string()
    .describe('Markdown findings for this sub-question, WITH inline citations after every factual claim, using the citationLink from the tools. Abstain explicitly where the corpus is silent.'),
  foundEvidence: z
    .boolean()
    .describe('True if corpus/web evidence was found; false if the answer is genuinely not addressed.'),
});
export type Finding = z.infer<typeof FindingSchema>;

// ── Reflection ────────────────────────────────────────────────────────────────

export const ReflectionSchema = z.object({
  sufficient: z.boolean().describe('True if the accumulated findings adequately cover the brief.'),
  gaps: z.string().describe('What is still missing or unresolved (empty when sufficient).'),
  followUps: z
    .array(SubQuestionSchema)
    .describe('New sub-questions that would close the gaps (empty when sufficient).'),
});
export type Reflection = z.infer<typeof ReflectionSchema>;

// ── Sources (for the report appendix + verification) ──────────────────────────

export const CorpusSourceSchema = z.object({
  key: z.string(),
  label: z.string(),
  link: z.string().nullable(),
});
export type CorpusSource = z.infer<typeof CorpusSourceSchema>;

export const WebSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  // Private checkpoint evidence; stripped from the public report.
  snippet: z.string().optional(),
});
export type WebSource = z.infer<typeof WebSourceSchema>;

// ── Final report (workflow output) ────────────────────────────────────────────

// Deep-research reports share the public report contract. The workflow applies
// both claim-level entailment verification and deterministic URL provenance.
export const DeepResearchReportSchema = ResearchReportSchema;
export type DeepResearchReport = z.infer<typeof DeepResearchReportSchema>;

// ── Workflow input + HITL approval ────────────────────────────────────────────

export const DeepResearchInputSchema = ResearchStartInputSchema;

// The stored approval, which is also what the workflow resumes with. Only
// `ResearchService.decide` builds it, from the stored plan: the questions are
// the planner's own, never text from the approval request.
export const ResearchApprovalSchema = z.object({
  approved: z.boolean(),
  editedSubQuestions: z.array(SubQuestionSchema).min(1).max(8).optional(),
});
export type ResearchApproval = z.infer<typeof ResearchApprovalSchema>;

export const PlanApprovalSuspendSchema = z.object({
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
});

// ── Progress events (streamed to the UI via writer.write) ─────────────────────

export const DEEP_RESEARCH_PROGRESS = 'deep-research-progress' as const;

export type DeepResearchStage =
  | 'planning'
  | 'awaiting-approval'
  | 'researching'
  | 'reflecting'
  | 'synthesizing'
  | 'verifying'
  | 'done'
  | 'cancelled';

export interface DeepResearchProgress {
  type: typeof DEEP_RESEARCH_PROGRESS;
  stage: DeepResearchStage;
  detail: string;
  /** For "researching": 1-based index and total of sub-questions in flight. */
  current?: number;
  total?: number;
}
