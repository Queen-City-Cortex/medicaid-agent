import { createTool } from '@mastra/core/tools';
import {
  ANSWER_QUESTION_TYPES,
  ANSWER_ROUTE_LANES,
  ANSWER_ROUTE_WIDENING_POLICIES,
} from '@nc-medicaid/policy-corpus';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';

let emittedEvalRoute = false;

const AnswerFrameSectionSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  sectionNumber: z.string().nullable(),
  content: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  // Revision metadata the system prompt instructs the model to surface for
  // temporal questions — omitting these from the schema silently strips them.
  lastRevised: z.string().nullable(),
  federalRegisterCite: z.string().nullable(),
  documentId: z.string().nullable(),
  documentTitle: z.string().nullable(),
  documentType: z.string().nullable(),
  policyNumber: z.string().nullable(),
  url: z.string().nullable(),
  citationLink: z.string().nullable(),
  status: z.string().nullable(),
  authorityTier: z.string().nullable(),
  answerRole: z.string().nullable(),
  sourceFormat: z.string().nullable(),
  answerReady: z.boolean().nullable(),
  corpusBucket: z.string().nullable(),
  variantGroup: z.string().nullable(),
  variantDate: z.string().nullable(),
  retrievalReady: z.boolean().nullable(),
  reason: z.string().nullable(),
});

const AnswerFrameDocumentSchema = DocumentMetadataSchema.extend({
  reason: z.string().nullable(),
});

const LatestRevisionSchema = z.object({
  marker: z.string().nullable(),
  document: AnswerFrameDocumentSchema.nullable(),
  section: AnswerFrameSectionSchema.nullable(),
});

const AnswerFrameRouteSchema = z.object({
  lane: z.enum(ANSWER_ROUTE_LANES),
  rationale: z.string(),
  widening_policy: z.enum(ANSWER_ROUTE_WIDENING_POLICIES),
  determinism_hints: z.object({
    numeric_evidence_only: z.boolean(),
    latest_revision_only: z.boolean(),
    cite_scope_and_not_covered: z.boolean(),
  }),
});

export const resolveAnswerFrame = createTool({
  id: 'resolve-answer-frame',
  description:
    'Build a structured evidence plan for coverage, prior authorization, amendment-history, federal-authority, ' +
    'or sibling-policy questions. Returns authoritative documents, primary/supporting sections, sections to avoid, and route metadata describing how strict or expansive the answer should be.',
  inputSchema: z.object({
    query: z.string().describe('The user question or research query.'),
    questionType: z
      .enum(ANSWER_QUESTION_TYPES)
      .optional()
      .describe('Optional family hint. Omit to let the corpus detect the question family automatically.'),
  }),
  outputSchema: z.object({
    frame: z.object({
      questionType: z.enum(ANSWER_QUESTION_TYPES),
      route: AnswerFrameRouteSchema,
      authoritativeDocuments: z.array(AnswerFrameDocumentSchema),
      primarySections: z.array(AnswerFrameSectionSchema),
      supportingSections: z.array(AnswerFrameSectionSchema),
      avoidSections: z.array(AnswerFrameSectionSchema),
      latestRevision: LatestRevisionSchema.nullable(),
      variantReasoning: z.string().nullable(),
    }),
  }),
  execute: async (inputData) => {
    const frame = await policyCorpus.resolveAnswerFrame(inputData);

    if (process.env.AGENT_EVAL_CAPTURE_ROUTE === 'true' && !emittedEvalRoute) {
      emittedEvalRoute = true;
      const authoritative = frame.authoritativeDocuments[0] ?? null;
      console.log('\n---ROUTE---\n');
      console.log(
        JSON.stringify({
          route: frame.route,
          authoritative_document: authoritative
            ? {
                id: authoritative.id ?? null,
                policy_number: authoritative.policyNumber ?? null,
                title: authoritative.title ?? null,
              }
            : null,
        }),
      );
    }

    return { frame };
  },
});
