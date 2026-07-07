import { createWorkflow, createStep } from '@mastra/core/workflows';
import type { OnIterationCompleteHandler } from '@mastra/core/agent';
import { z } from 'zod';
import { isVerifierEnabled } from '../env.js';
import { log } from '../logger.js';
import {
  extractSourcesFromToolResults,
  validateAnswerUrls,
  type SourceEntry,
  type ToolResultRecord,
} from '../processors/hallucination-verifier.js';
import {
  deepResearchPlannerAgent,
  deepResearchWorkerAgent,
  deepResearchReportAgent,
} from './agents.js';
import {
  DeepResearchInputSchema,
  DeepResearchReportSchema,
  ResearchPlanSchema,
  ReflectionSchema,
  SubQuestionSchema,
  WebSourceSchema,
  DEEP_RESEARCH_PROGRESS,
  type SubQuestion,
  type Finding,
  type WebSource,
  type DeepResearchProgress,
} from './schemas.js';
import {
  MAX_SUB_QUESTIONS,
  MAX_REFLECTION_ROUNDS,
  WORKER_MAX_STEPS,
  PLANNER_MAX_STEPS,
  RESEARCH_CONCURRENCY,
  NOVELTY_MIN_NEW_IDS,
  WEB_SEARCH_ENABLED,
} from './config.js';

// ── Internal schemas (carry heavy state between steps) ────────────────────────

const SourceEntrySchema = z.object({
  toolName: z.string(),
  key: z.string(),
  text: z.string(),
  link: z.string().nullable().optional(),
});
const FindingOut = z.object({
  subQuestion: z.string(),
  summary: z.string(),
  foundEvidence: z.boolean(),
});

const PlanStepOut = z.object({
  question: z.string(),
  autoApprove: z.boolean().optional(),
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
});
const ApprovalStepOut = z.object({
  question: z.string(),
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
});
const ResearchStepOut = ApprovalStepOut.extend({
  findings: z.array(FindingOut),
  corpusSources: z.array(SourceEntrySchema),
  webSources: z.array(WebSourceSchema),
  reflectionRounds: z.number(),
});
const SynthStepOut = z.object({
  question: z.string(),
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
  reportMarkdown: z.string(),
  corpusSources: z.array(SourceEntrySchema),
  webSources: z.array(WebSourceSchema),
  reflectionRounds: z.number(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type Writer = { write: (data: unknown) => Promise<void> } | undefined;

async function emit(writer: Writer, p: Omit<DeepResearchProgress, 'type'>): Promise<void> {
  try {
    await writer?.write({ type: DEEP_RESEARCH_PROGRESS, ...p });
  } catch {
    // Progress is best-effort; never let a write failure abort a research run.
    log.debug('deep_research.progress_write_failed', { stage: p.stage });
  }
}

// Tool-result payload shapes vary across Mastra + AI SDK versions; this is the
// boundary where we normalize both the flat AI SDK shape and Mastra's envelope.
interface RawToolResult {
  payload?: RawToolResult;
  toolName?: string;
  tool_name?: string;
  toolCallId?: string;
  tool_call_id?: string;
  result?: unknown;
  output?: unknown;
}

/** Normalize an agent's FullOutput.toolResults into flat {toolName, result} records.
 *  Accepts both the AI SDK shape and Mastra's envelope (mirrors the CLI runner). */
function normalizeToolResults(toolResults: unknown): ToolResultRecord[] {
  const out: ToolResultRecord[] = [];
  for (const raw of (toolResults as RawToolResult[]) ?? []) {
    if (!raw) continue;
    const p = raw.payload ?? raw;
    const toolName = p.toolName ?? p.tool_name ?? '';
    if (!toolName) continue;
    out.push({
      toolName,
      toolCallId: p.toolCallId ?? p.tool_call_id,
      result: p.result ?? p.output,
    });
  }
  return out;
}

/** A human-readable label for a source — the project forbids exposing raw
 *  internal IDs (sec:doc:…) in the UI. Parse the serialized evidence text
 *  (Title:/Section:/Policy: lines) into something like
 *  "Policy 5B § 2.3 — Therapeutic Leave", falling back to the key only if the
 *  text carries no usable metadata. */
function sourceLabel(s: SourceEntry): string {
  const field = (name: string) => s.text.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim();
  const title = field('Title');
  const section = field('Section');
  const policy = field('Policy');
  let label: string;
  if (policy && section) label = `Policy ${policy} § ${section}${title ? ` — ${title}` : ''}`;
  else if (policy) label = `Policy ${policy}${title ? ` — ${title}` : ''}`;
  else if (title) label = title;
  else label = s.key;
  return label.length > 120 ? `${label.slice(0, 117)}…` : label;
}

function extractWebSources(records: ToolResultRecord[]): WebSource[] {
  const web: WebSource[] = [];
  for (const r of records) {
    if (r.toolName !== 'webSearch') continue;
    const results = (r.result as { results?: Array<{ title?: string; url?: string }> })?.results ?? [];
    for (const item of results) {
      if (item?.url) web.push({ title: item.title ?? item.url, url: item.url });
    }
  }
  return web;
}

function workerPrompt(sq: SubQuestion): string {
  return `Research this NC Medicaid sub-question and return a compressed, citation-bearing summary.

Sub-question: ${sq.question}
Why it matters: ${sq.rationale}
Suggested retrieval angles: ${sq.channels.join(', ') || 'any'}
${sq.useWeb && WEB_SEARCH_ENABLED ? 'Supplementary web search is permitted for context outside the corpus.' : 'Use the corpus only.'}`;
}

interface ResearchOutcome {
  finding: Finding;
  corpus: SourceEntry[];
  web: WebSource[];
}

// Without this, a worker that spends its whole step budget on tool calls
// returns empty text (finishReason 'tool-calls') — the findings come back blank
// and the report writer has nothing to synthesize. Mirror the chat agent: two
// steps before the limit, force the worker to stop and write its summary.
const forceWorkerSynthesis: OnIterationCompleteHandler = ({ iteration, finishReason }) => {
  if (iteration >= WORKER_MAX_STEPS - 2 && finishReason === 'tool-calls') {
    return {
      feedback:
        'You are out of research steps. Stop calling tools and write your final compressed, citation-bearing summary NOW from what you have already read. Cite each claim with the citationLink from the tool results; state explicitly where the corpus was silent.',
      continue: false,
    };
  }
  return undefined;
};

async function researchOne(sq: SubQuestion): Promise<ResearchOutcome> {
  const res = await deepResearchWorkerAgent.generate(workerPrompt(sq), {
    maxSteps: WORKER_MAX_STEPS,
    onIterationComplete: forceWorkerSynthesis,
  });
  const records = normalizeToolResults(res.toolResults);
  const corpus = extractSourcesFromToolResults(records);
  const web = extractWebSources(records);
  const summary = res.text ?? '';
  return {
    finding: { subQuestion: sq.question, summary, foundEvidence: corpus.length > 0 || web.length > 0 },
    corpus,
    web,
  };
}

/** Run `fn` over items in batches so peak concurrency stays at `limit`. */
async function mapBatched<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

// ── Step 1: plan ──────────────────────────────────────────────────────────────

const planStep = createStep({
  id: 'plan',
  inputSchema: DeepResearchInputSchema,
  outputSchema: PlanStepOut,
  execute: async ({ inputData, writer }) => {
    await emit(writer, { stage: 'planning', detail: 'Decomposing the question into a research plan…' });
    const res = await deepResearchPlannerAgent.generate(
      `Plan a deep-research run for this NC Medicaid question:\n\n${inputData.question}`,
      { structuredOutput: { schema: ResearchPlanSchema }, maxSteps: PLANNER_MAX_STEPS },
    );
    const plan = res.object as { brief: string; subQuestions: SubQuestion[] } | undefined;
    if (!plan?.subQuestions?.length) {
      throw new Error('Planner did not produce a research plan');
    }
    const subQuestions = plan.subQuestions.slice(0, MAX_SUB_QUESTIONS);
    log.info('deep_research.planned', { subQuestions: subQuestions.length });
    return { question: inputData.question, autoApprove: inputData.autoApprove, brief: plan.brief, subQuestions };
  },
});

// ── Step 2: plan approval (HITL suspend/resume) ───────────────────────────────

const approvalStep = createStep({
  id: 'plan-approval',
  inputSchema: PlanStepOut,
  outputSchema: ApprovalStepOut,
  resumeSchema: z.object({
    approved: z.boolean(),
    editedSubQuestions: z.array(SubQuestionSchema).optional(),
  }),
  suspendSchema: z.object({ brief: z.string(), subQuestions: z.array(SubQuestionSchema) }),
  execute: async ({ inputData, resumeData, suspend, writer, bail }) => {
    const base = { question: inputData.question, brief: inputData.brief, subQuestions: inputData.subQuestions };

    // Headless / CLI: skip the approval gate entirely.
    if (inputData.autoApprove) return base;

    // First pass — pause and ask the user to approve or edit the plan.
    if (!resumeData) {
      await emit(writer, { stage: 'awaiting-approval', detail: 'Waiting for you to approve the research plan.' });
      return await suspend({ brief: inputData.brief, subQuestions: inputData.subQuestions });
    }

    // Resumed with a decision.
    if (!resumeData.approved) {
      await emit(writer, { stage: 'cancelled', detail: 'Research plan was declined.' });
      return bail({
        status: 'cancelled' as const,
        question: inputData.question,
        brief: inputData.brief,
        reportMarkdown: '_Research was cancelled before it ran._',
        subQuestions: inputData.subQuestions,
        corpusSources: [],
        webSources: [],
        verification: null,
        stats: { reflectionRounds: 0, subQuestionCount: 0, corpusSourceCount: 0, webSourceCount: 0 },
      });
    }
    const subQuestions = (resumeData.editedSubQuestions?.length
      ? resumeData.editedSubQuestions
      : inputData.subQuestions
    ).slice(0, MAX_SUB_QUESTIONS);
    return { ...base, subQuestions };
  },
});

// ── Step 3: research (fan-out + bounded reflection) ───────────────────────────

const researchStep = createStep({
  id: 'research',
  inputSchema: ApprovalStepOut,
  outputSchema: ResearchStepOut,
  execute: async ({ inputData, writer }) => {
    const { question, brief } = inputData;
    const allSubQuestions: SubQuestion[] = [...inputData.subQuestions];
    const findings: Finding[] = [];
    const corpusByKey = new Map<string, SourceEntry>();
    const webByUrl = new Map<string, WebSource>();
    const seenIds = new Set<string>();

    const absorb = (outcomes: ResearchOutcome[]) => {
      for (const o of outcomes) {
        findings.push(o.finding);
        for (const s of o.corpus) {
          if (!corpusByKey.has(s.key)) corpusByKey.set(s.key, s);
          seenIds.add(s.key);
        }
        for (const w of o.web) if (!webByUrl.has(w.url)) webByUrl.set(w.url, w);
      }
    };

    // Initial pass over the approved sub-questions.
    let done = 0;
    const total = inputData.subQuestions.length;
    await emit(writer, { stage: 'researching', detail: `Researching ${total} sub-questions…`, current: 0, total });
    absorb(
      await mapBatched(inputData.subQuestions, RESEARCH_CONCURRENCY, async (sq) => {
        const outcome = await researchOne(sq);
        done += 1;
        await emit(writer, { stage: 'researching', detail: sq.question, current: done, total });
        return outcome;
      }),
    );

    // Bounded reflection loop with a closed-corpus novelty stop.
    let reflectionRounds = 0;
    let remaining = MAX_SUB_QUESTIONS - allSubQuestions.length;
    while (reflectionRounds < MAX_REFLECTION_ROUNDS && remaining > 0) {
      await emit(writer, { stage: 'reflecting', detail: `Checking for gaps (round ${reflectionRounds + 1})…` });
      const reflPrompt = `Research brief:\n${brief}\n\nFindings so far:\n${findings
        .map((f, i) => `${i + 1}. ${f.subQuestion}\n${f.summary}`)
        .join('\n\n')}\n\nIdentify remaining gaps versus the brief and propose up to ${remaining} follow-up sub-questions that would close them. If the findings already cover the brief, set sufficient=true and return no follow-ups.`;
      const reflRes = await deepResearchPlannerAgent.generate(reflPrompt, {
        structuredOutput: { schema: ReflectionSchema },
        maxSteps: PLANNER_MAX_STEPS,
      });
      const reflection = reflRes.object as
        | { sufficient: boolean; followUps: SubQuestion[] }
        | undefined;
      if (!reflection || reflection.sufficient || !reflection.followUps?.length) break;

      const followUps: SubQuestion[] = reflection.followUps.slice(0, remaining);
      remaining -= followUps.length;
      allSubQuestions.push(...followUps);
      const before = seenIds.size;
      const fuTotal = followUps.length;
      let fuDone = 0;
      absorb(
        await mapBatched(followUps, RESEARCH_CONCURRENCY, async (sq) => {
          const outcome = await researchOne(sq);
          fuDone += 1;
          await emit(writer, { stage: 'researching', detail: sq.question, current: fuDone, total: fuTotal });
          return outcome;
        }),
      );
      reflectionRounds += 1;
      if (seenIds.size - before < NOVELTY_MIN_NEW_IDS) break; // corpus exhausted
    }

    log.info('deep_research.researched', {
      subQuestions: allSubQuestions.length,
      reflectionRounds,
      corpusSources: corpusByKey.size,
      webSources: webByUrl.size,
    });
    return {
      question,
      brief,
      subQuestions: allSubQuestions,
      findings,
      corpusSources: [...corpusByKey.values()],
      webSources: [...webByUrl.values()],
      reflectionRounds,
    };
  },
});

// ── Step 4: synthesize the report ─────────────────────────────────────────────

const synthesizeStep = createStep({
  id: 'synthesize',
  inputSchema: ResearchStepOut,
  outputSchema: SynthStepOut,
  execute: async ({ inputData, writer }) => {
    await emit(writer, { stage: 'synthesizing', detail: 'Writing the research report…' });
    const findingsBlock = inputData.findings
      .map((f, i) => `### Sub-question ${i + 1}: ${f.subQuestion}\n${f.summary}`)
      .join('\n\n');
    const webBlock = inputData.webSources.length
      ? `\n\nSupplementary web sources consulted:\n${inputData.webSources.map((w) => `- ${w.title} (${w.url})`).join('\n')}`
      : '';
    const prompt = `Original question:\n${inputData.question}\n\nResearch brief:\n${inputData.brief}\n\nFindings (each already carries inline citations):\n\n${findingsBlock}${webBlock}\n\nWrite the full report now.`;
    const res = await deepResearchReportAgent.generate(prompt);
    return {
      question: inputData.question,
      brief: inputData.brief,
      subQuestions: inputData.subQuestions,
      reportMarkdown: res.text ?? '',
      corpusSources: inputData.corpusSources,
      webSources: inputData.webSources,
      reflectionRounds: inputData.reflectionRounds,
    };
  },
});

// ── Step 5: verify (reuse the hallucination verifier) ─────────────────────────

const verifyStep = createStep({
  id: 'verify',
  inputSchema: SynthStepOut,
  outputSchema: DeepResearchReportSchema,
  execute: async ({ inputData, writer }) => {
    const verifierEnabled = isVerifierEnabled();
    let reportMarkdown = inputData.reportMarkdown;
    let verification = null as null | {
      checkedCitations: number;
      groundedCitations: number;
      fabricatedCitations: number;
    };

    if (verifierEnabled && reportMarkdown) {
      await emit(writer, { stage: 'verifying', detail: 'Verifying citations against the corpus…' });
      try {
        const sources: SourceEntry[] = inputData.corpusSources;
        // Deterministic citation grounding: any link not backed by a retrieved
        // source is demoted to plain text (not clickable) and counted. This is
        // the right check for long reports — it never strips real, cited claims.
        const { validatedAnswer, unknownUrls, checkedUrlCount } = validateAnswerUrls(reportMarkdown, sources);
        reportMarkdown = validatedAnswer;
        verification = {
          checkedCitations: checkedUrlCount,
          groundedCitations: checkedUrlCount - unknownUrls.length,
          fabricatedCitations: unknownUrls.length,
        };
        if (unknownUrls.length > 0) {
          log.warn('deep_research.fabricated_citations', { count: unknownUrls.length });
        }
      } catch (err) {
        log.error('deep_research.verify_failed', { error: String(err) });
      }
    }

    await emit(writer, { stage: 'done', detail: 'Research complete.' });
    return {
      status: 'completed' as const,
      question: inputData.question,
      brief: inputData.brief,
      reportMarkdown,
      subQuestions: inputData.subQuestions,
      corpusSources: inputData.corpusSources.map((s) => ({ key: s.key, label: sourceLabel(s), link: s.link ?? null })),
      webSources: inputData.webSources,
      verification,
      stats: {
        reflectionRounds: inputData.reflectionRounds,
        subQuestionCount: inputData.subQuestions.length,
        corpusSourceCount: inputData.corpusSources.length,
        webSourceCount: inputData.webSources.length,
      },
    };
  },
});

// ── Workflow ──────────────────────────────────────────────────────────────────

export const deepResearchWorkflow = createWorkflow({
  id: 'deepResearchWorkflow',
  inputSchema: DeepResearchInputSchema,
  outputSchema: DeepResearchReportSchema,
})
  .then(planStep)
  .then(approvalStep)
  .then(researchStep)
  .then(synthesizeStep)
  .then(verifyStep)
  .commit();
