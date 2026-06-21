import { z } from 'zod';

// ── Plan ──────────────────────────────────────────────────────────────────────

export const SubQuestionSchema = z.object({
  question: z.string().describe('A focused, independently-researchable sub-question.'),
  rationale: z.string().describe('Why answering this advances the overall research goal.'),
  channels: z
    .array(z.enum(['vector', 'keyword', 'concept', 'amendments', 'federal']))
    .describe('Which corpus retrieval angles are most likely to surface evidence.'),
  useWeb: z
    .boolean()
    .describe('True only when the answer likely needs context outside the NC Medicaid corpus (e.g. recent federal guidance).'),
});
export type SubQuestion = z.infer<typeof SubQuestionSchema>;

export const ResearchPlanSchema = z.object({
  brief: z
    .string()
    .describe('A compressed research brief — the "north star" stating the goal, scope, key dimensions (program/population, effective date/version, geography), and what a complete answer must cover.'),
  subQuestions: z.array(SubQuestionSchema).min(1),
});
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
});
export type WebSource = z.infer<typeof WebSourceSchema>;

// ── Final report (workflow output) ────────────────────────────────────────────

// Deep-research reports are long and densely cited; the chat-tuned LLM verifier
// is miscalibrated at that scale (it flags genuinely-cited claims and attempts a
// destructive rewrite). Instead we run the verifier's *deterministic* URL check:
// every citation link must resolve to a source we actually retrieved.
export const VerificationSummarySchema = z.object({
  /** Total inline citation links checked in the report. */
  checkedCitations: z.number(),
  /** Citations whose URL matched a retrieved corpus source. */
  groundedCitations: z.number(),
  /** Citations whose URL appeared in no retrieved source (demoted to plain text). */
  fabricatedCitations: z.number(),
});
export type VerificationSummary = z.infer<typeof VerificationSummarySchema>;

export const DeepResearchReportSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
  question: z.string(),
  brief: z.string(),
  reportMarkdown: z.string(),
  subQuestions: z.array(SubQuestionSchema),
  corpusSources: z.array(CorpusSourceSchema),
  webSources: z.array(WebSourceSchema),
  verification: VerificationSummarySchema.nullable(),
  stats: z.object({
    reflectionRounds: z.number(),
    subQuestionCount: z.number(),
    corpusSourceCount: z.number(),
    webSourceCount: z.number(),
  }),
});
export type DeepResearchReport = z.infer<typeof DeepResearchReportSchema>;

// ── Workflow input + HITL approval ────────────────────────────────────────────

export const DeepResearchInputSchema = z.object({
  question: z.string(),
  /** Skip the plan-approval suspend (used by the CLI/headless runner). */
  autoApprove: z.boolean().optional(),
});

export const PlanApprovalResumeSchema = z.object({
  approved: z.boolean(),
  /** Optional user-edited sub-questions that replace the planner's. */
  editedSubQuestions: z.array(SubQuestionSchema).optional(),
});

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
