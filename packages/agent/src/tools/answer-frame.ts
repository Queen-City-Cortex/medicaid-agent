import { visibleSection } from './section-metadata.js';
import { createTool } from '@mastra/core/tools';
import {
  ANSWER_QUESTION_TYPES,
  ANSWER_ROUTE_LANES,
  ANSWER_ROUTE_WIDENING_POLICIES,
} from '@nc-medicaid/policy-corpus';
import { z } from 'zod';
import { policyCorpus } from '../policy-corpus.js';
import { DocumentMetadataSchema } from './document-metadata.js';
import { SectionWindowSchema } from './read.js';

// Once-per-process latch for the eval-route emission below. It is intentional
// that this never resets: AGENT_EVAL_CAPTURE_ROUTE is only set by the eval
// harness, which runs the CLI (`npx tsx src/cli.ts "<question>"`) as a fresh
// subprocess per question, so "once per process" means "once per question".
// The harness's `---ROUTE---` extractor reads a single block per run; the
// first resolveAnswerFrame call is the routing decision it must capture.
// Long-lived server processes never set the env var, so the latch is inert there.
let emittedEvalRoute = false;

const AnswerFrameSectionSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  sectionNumber: z.string().nullable(),
  content: z.string().nullable(),
  // A frame section holds the first window of its text; these say when more remains.
  ...SectionWindowSchema.shape,
  effectiveDate: z.string().nullable(),
  sourceModifiedDate: z.string().nullable().optional(),
  retrievedAt: z.string().nullable().optional(),
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
      coverageScope: z.object({
        policyId: z.string(), limitationIds: z.array(z.string()), notice: z.string().nullable(),
        requestedDate: z.string().nullable(), requiredSourceUrls: z.array(z.string()), requirements: z.array(z.string()),
      }).optional(),
      droppedDocuments: z.array(AnswerFrameDocumentSchema).optional(),
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

    return { frame: {
      ...frame,
      primarySections: frame.primarySections.map(visibleSection),
      supportingSections: frame.supportingSections.map(visibleSection),
      avoidSections: frame.avoidSections.map(visibleSection),
      latestRevision: frame.latestRevision ? { ...frame.latestRevision, section: frame.latestRevision.section ? visibleSection(frame.latestRevision.section) : null } : null,
    } };
  },
});
