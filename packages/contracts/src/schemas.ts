import { z } from 'zod';

export const IdentifierSchema = z.string().trim().min(1).max(128);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(1_000),
    retryAfterSeconds: z.number().int().positive().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const FeedbackRatingSchema = z.enum(['up', 'down']);
export const FeedbackInputSchema = z.object({
  messageId: IdentifierSchema,
  threadId: IdentifierSchema,
  rating: FeedbackRatingSchema,
  comment: z.string().trim().max(2_000).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const FeedbackSchema = FeedbackInputSchema.extend({
  id: IdentifierSchema,
  resourceId: IdentifierSchema,
  comment: z.string().max(2_000).nullable(),
  createdAt: z.string().datetime(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const ProviderHealthSchema = z.enum(['ok', 'error', 'disabled']);
export const ReadinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  config: z.literal('valid'),
  neo4j: z.enum(['connected', 'error']),
  storage: z.enum(['writable', 'readonly']),
  releaseId: z.string().min(1).max(128).nullable().optional(),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export const DependencyHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  voyage: ProviderHealthSchema,
  openai: ProviderHealthSchema,
  anthropic: ProviderHealthSchema.optional(),
});
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;

export const CorpusStatusSchema = z.object({
  lastUpdated: z.string().datetime().nullable(),
  documentCount: z.number().int().nonnegative(),
  releaseId: z.string().min(1).max(128).nullable().optional(),
  retrievalMode: z.enum(['hybrid', 'lexical-degraded']).optional(),
});
export type CorpusStatus = z.infer<typeof CorpusStatusSchema>;

export const ResearchChannelSchema = z.enum([
  'vector',
  'keyword',
  'concept',
  'amendments',
  'federal',
]);

export const ResearchSubQuestionSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
  rationale: z.string().trim().min(1).max(4_000),
  channels: z.array(ResearchChannelSchema).min(1).max(5),
  useWeb: z.boolean(),
});
export type ResearchSubQuestion = z.infer<typeof ResearchSubQuestionSchema>;

export const ResearchPlanSchema = z.object({
  brief: z.string().trim().min(1).max(20_000),
  subQuestions: z.array(ResearchSubQuestionSchema).min(1).max(8),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const ResearchRunStateSchema = z.enum([
  'queued',
  'planning',
  'awaiting_approval',
  'researching',
  'verifying',
  'completed',
  'cancelled',
  'failed',
]);
export type ResearchRunState = z.infer<typeof ResearchRunStateSchema>;

export const ResearchStartInputSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
});
export type ResearchStartInput = z.infer<typeof ResearchStartInputSchema>;

export const ResearchDecisionInputSchema = z.object({
  approved: z.boolean(),
  editedSubQuestions: z.array(ResearchSubQuestionSchema).min(1).max(8).optional(),
});
export type ResearchDecisionInput = z.infer<typeof ResearchDecisionInputSchema>;

export const CitationProvenanceSchema = z.object({
  checkedCitations: z.number().int().nonnegative(),
  retrievedCitations: z.number().int().nonnegative(),
  unknownCitations: z.number().int().nonnegative(),
});
export type CitationProvenance = z.infer<typeof CitationProvenanceSchema>;

export const ResearchCorpusSourceSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  link: z.string().url().nullable(),
});
export type ResearchCorpusSource = z.infer<typeof ResearchCorpusSourceSchema>;

export const ResearchWebSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});
export type ResearchWebSource = z.infer<typeof ResearchWebSourceSchema>;

export const ResearchWorkerFailureSchema = z.object({
  subQuestion: z.string().min(1).max(10_000),
  message: z.string().min(1).max(500),
});
export type ResearchWorkerFailure = z.infer<typeof ResearchWorkerFailureSchema>;

export const ResearchReportSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
  question: z.string(),
  brief: z.string(),
  reportMarkdown: z.string(),
  subQuestions: z.array(ResearchSubQuestionSchema),
  corpusSources: z.array(ResearchCorpusSourceSchema),
  webSources: z.array(ResearchWebSourceSchema),
  workerFailures: z.array(ResearchWorkerFailureSchema).default([]),
  citationProvenance: CitationProvenanceSchema.nullable(),
  stats: z.object({
    reflectionRounds: z.number().int().nonnegative(),
    subQuestionCount: z.number().int().nonnegative(),
    corpusSourceCount: z.number().int().nonnegative(),
    webSourceCount: z.number().int().nonnegative(),
  }),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

export const ResearchRunSchema = z.object({
  runId: IdentifierSchema,
  state: ResearchRunStateSchema,
  question: z.string().max(10_000),
  plan: ResearchPlanSchema.nullable(),
  report: ResearchReportSchema.nullable(),
  error: z.string().max(2_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ResearchRun = z.infer<typeof ResearchRunSchema>;

export const DeepResearchProgressSchema = z.object({
  type: z.literal('deep-research-progress'),
  stage: z.enum([
    'planning',
    'awaiting-approval',
    'researching',
    'reflecting',
    'synthesizing',
    'verifying',
    'done',
    'cancelled',
  ]),
  detail: z.string(),
  current: z.number().int().positive().optional(),
  total: z.number().int().positive().optional(),
});
export type DeepResearchProgress = z.infer<typeof DeepResearchProgressSchema>;

export const ReleaseGateResultSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  actual: z.number().nullable(),
  threshold: z.number().nullable(),
  overridable: z.boolean(),
  overrideReason: z.string().min(10).max(2_000).nullable(),
});

export const ReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: IdentifierSchema,
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/),
  targetColor: z.enum(['blue', 'green']),
  previousReleaseId: IdentifierSchema.nullable(),
  sourceSnapshotHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  embeddingModel: z.string().min(1),
  embeddingDimensions: z.number().int().positive(),
  counts: z.record(z.string(), z.number().nonnegative()),
  auditResults: z.record(z.string(), z.unknown()),
  evaluationResults: z.record(z.string(), z.number()),
  gates: z.array(ReleaseGateResultSchema),
  promotionState: z.enum(['building', 'rejected', 'validated', 'promoted', 'rolled_back']),
  createdAt: z.string().datetime(),
  promotedAt: z.string().datetime().nullable(),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
