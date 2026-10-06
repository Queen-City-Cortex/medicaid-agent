import { getConfig as getVerifierConfig } from '../processors/verifier/config.js';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import type { OnIterationCompleteHandler } from '@mastra/core/agent';
import { z } from 'zod';
import { RESEARCH_GAP_NOTICE } from '@nc-medicaid/contracts';
import { checkpointed, questionKey, researchLimits, researchApproval, reserveResearchStep, publishResearchFollowUps, publishResearchVerification } from './checkpoints.js';
import { FindingWithheldError, VerificationWithheldError, isRetryableResearchError } from './recovery-errors.js';
import { verifyAnswer, VERIFICATION_UNAVAILABLE } from '../processors/verifier/verify.js';
import { log } from '../logger.js';
import {
  extractSourcesFromToolResults,
  runVerificationForAnswer,
  validateAnswerUrls,
  answerUrlSet,
  normalizeUrl,
  RESEARCH_FINDING_TOOL,
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
import { WEB_SEARCH_ENABLED, DEEP_RESEARCH_MODEL } from './config.js';
import { markResearchVerifying, recordResearchUsage } from './usage.js';
import {
  isSystemicWorkerError,
  runSettledBatches,
  type BatchFailure,
} from './worker-pool.js';

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
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
});
const ApprovalStepOut = z.object({
  question: z.string(),
  brief: z.string(),
  subQuestions: z.array(SubQuestionSchema),
  // Proposed questions the user did not approve. Any entry makes approval
  // binding: the research step must not reflect its way back to them.
  removedQuestions: z.array(z.string()),
});
const ResearchStepOut = ApprovalStepOut.extend({
  findings: z.array(FindingOut),
  workerFailures: z.array(z.object({ subQuestion: z.string(), message: z.string() })),
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
  workerFailures: z.array(z.object({ subQuestion: z.string(), message: z.string() })),
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
    const results = (r.result as { results?: Array<{ title?: string; url?: string; snippet?: string }> })?.results ?? [];
    for (const item of results) {
      if (item?.url) web.push({ title: item.title ?? item.url, url: item.url, snippet: item.snippet });
    }
  }
  return web;
}

function verificationSources(corpus: SourceEntry[], web: WebSource[]): SourceEntry[] {
  return [...corpus, ...web.filter(source => source.snippet?.trim()).map(source => ({
    evidenceRole: 'supplementary' as const, toolName: 'webSearch', key: `web:${source.url}`, link: source.url,
    text: `Title: ${source.title}\nSupplementary web evidence (not governing NC Medicaid policy):\n${source.snippet}`,
  }))];
}

/** Report-level evidence for one finding. The header uses the verifier
 *  prompt's evidence-authority vocabulary so its existing rule applies: a
 *  finding that passed verification does not turn what it attributes to a web
 *  source into governing policy. */
function findingEvidence(finding: Finding, index: number, web: WebSource[]): SourceEntry {
  const cited = answerUrlSet(finding.summary);
  const webUrls = [...new Set(web.map(source => source.url).filter(url => cited.has(normalizeUrl(url))))];
  const role = webUrls.length
    ? `Supplementary sources cited by this finding: ${webUrls.join(', ')}\nThose are web excerpts with evidenceRole="supplementary". Statements this finding attributes to them remain supplementary evidence: they can support explicitly labeled background context only and cannot independently support any governing policy claim. The answer may not strengthen them into NC Medicaid policy.`
    : 'Supplementary sources cited by this finding: none. It cites retrieved corpus documents only.';
  return { toolName: RESEARCH_FINDING_TOOL, key: `finding:${index + 1}`,
    text: `[researchFinding]\nA research worker's summary of one sub-question, verified against the sources that worker retrieved. It is a summary, not a corpus document.\n${role}\nSub-question: ${finding.subQuestion}\n\nVerified finding:\n${finding.summary}` };
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
  if (iteration >= researchLimits().workerMaxSteps - 2 && finishReason === 'tool-calls') {
    return {
      feedback:
        'You are out of research steps. Stop calling tools and write your final compressed, citation-bearing summary NOW from what you have already read. Cite each claim with the citationLink from the tool results; state explicitly where the corpus was silent.',
      continue: false,
    };
  }
  return undefined;
};

async function verifyResearchAnswer(key: string, question: string, answerText: string, sources: SourceEntry[], verifierSources?: SourceEntry[]) {
  let pass = 0;
  return runVerificationForAnswer({ question, answerText, sources, verifierSources,
    onUsage: usage => recordResearchUsage('verifier', getVerifierConfig().model, { usage }),
    verify: (...args) => checkpointed(`${key}:verification:${++pass}`, () => verifyAnswer(...args),
      value => !value.unsupportedClaims.some(c => c.reason === VERIFICATION_UNAVAILABLE)),
  });
}

async function researchOne(sq: SubQuestion): Promise<ResearchOutcome> {
  const key = `worker:${questionKey(sq)}`;
  return checkpointed(key, async () => {
    const draft = await checkpointed(`${key}:draft`, async () => {
      const res = await deepResearchWorkerAgent.generate(workerPrompt(sq), {
        maxSteps: researchLimits().workerMaxSteps,
        prepareStep: async () => { await reserveResearchStep(key, researchLimits().workerMaxSteps); },
        onIterationComplete: forceWorkerSynthesis,
      });
      recordResearchUsage('worker', DEEP_RESEARCH_MODEL, res);
      const records = normalizeToolResults(res.toolResults);
      return { text: res.text ?? '', corpus: extractSourcesFromToolResults(records), web: extractWebSources(records) };
    });
    const sources = verificationSources(draft.corpus, draft.web);
    const verified = await verifyResearchAnswer(key, sq.question, draft.text, sources);
    // A withheld draft stays in its private checkpoint. Only the report step
    // publishes a verification outcome and source list for the run.
    if (verified.outcome.status === 'withheld') {
      throw verified.outcome.reason === 'unavailable' ? new VerificationWithheldError(verified.retryable) : new FindingWithheldError();
    }
    return { finding: { subQuestion: sq.question, summary: verified.finalAnswer, foundEvidence: sources.length > 0 },
      corpus: draft.corpus, web: draft.web };
  });
}

/** Sub-questions whose worker did not return a verified finding. A grounding
 *  withhold or a one-off worker error becomes a gap the report names, in fixed
 *  wording: neither the withheld draft nor the error text leaves the server. A
 *  transient error, a verifier outage, a budget, lease, corpus or checkpoint
 *  error, a systemic provider error, or gaps in more than half of the batch
 *  end the step instead. */
function gapsOrThrow(failures: BatchFailure<SubQuestion>[], batchSize: number): Array<{ subQuestion: string; message: string }> {
  const fatal = failures.find(f => isRetryableResearchError(f.error)
    || (f.error instanceof VerificationWithheldError && !(f.error instanceof FindingWithheldError))
    || /budget|lease|corpus|checkpoint/i.test(String(f.error)));
  if (fatal) throw fatal.error;
  if (failures.some(({ error }) => isSystemicWorkerError(error)) || failures.length > batchSize / 2) throw failures[0].error;
  for (const { error } of failures) {
    log.warn('deep_research.sub_question_gap', { reason: error instanceof FindingWithheldError ? 'grounding_withheld' : 'worker_failed' });
  }
  return failures.map(({ item }) => ({ subQuestion: item.question, message: RESEARCH_GAP_NOTICE }));
}

function uniqueQuestions(questions: SubQuestion[], prior: SubQuestion[] = []): SubQuestion[] {
  const seen = new Set(prior.map(questionKey));
  return questions.filter(question => {
    const key = questionKey(question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Step 1: plan ──────────────────────────────────────────────────────────────

const planStep = createStep({
  id: 'plan',
  inputSchema: DeepResearchInputSchema,
  outputSchema: PlanStepOut,
  execute: async ({ inputData, writer }) => checkpointed('plan', async () => {
    await emit(writer, { stage: 'planning', detail: 'Decomposing the question into a research plan…' });
    const res = await deepResearchPlannerAgent.generate(
      `Plan a deep-research run for this NC Medicaid question:\n\n${inputData.question}`,
      { structuredOutput: { schema: ResearchPlanSchema }, maxSteps: researchLimits().plannerMaxSteps,
        prepareStep: async () => { await reserveResearchStep('plan', researchLimits().plannerMaxSteps); } },
    );
    recordResearchUsage('planner', DEEP_RESEARCH_MODEL, res);
    const plan = res.object as { brief: string; subQuestions: SubQuestion[] } | undefined;
    if (!plan?.subQuestions?.length) {
      throw new Error('Planner did not produce a research plan');
    }
    const subQuestions = plan.subQuestions.slice(0, researchLimits().maxSubQuestions);
    log.info('deep_research.planned', { subQuestions: subQuestions.length });
    return { question: inputData.question, brief: plan.brief, subQuestions };
  }),
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

    // First pass — pause and ask the user to approve or edit the plan.
    resumeData = researchApproval() ?? resumeData;
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
        workerFailures: [],
        citationProvenance: null,
        stats: { reflectionRounds: 0, subQuestionCount: 0, corpusSourceCount: 0, webSourceCount: 0 },
      });
    }
    const subQuestions = uniqueQuestions(resumeData.editedSubQuestions?.length
      ? resumeData.editedSubQuestions
      : inputData.subQuestions
    ).slice(0, researchLimits().maxSubQuestions);
    const approved = new Set(subQuestions.map(sq => sq.question.trim()));
    const removedQuestions = inputData.subQuestions.map(sq => sq.question.trim()).filter(q => !approved.has(q));
    return { ...base, subQuestions, removedQuestions };
  },
});

// ── Step 3: research (fan-out + bounded reflection) ───────────────────────────

const researchStep = createStep({
  id: 'research',
  inputSchema: ApprovalStepOut,
  outputSchema: ResearchStepOut,
  execute: async ({ inputData, writer }) => checkpointed('research', async () => {
    const { question, brief } = inputData;
    const allSubQuestions: SubQuestion[] = [...inputData.subQuestions];
    const findings: Finding[] = [];
    const corpusByKey = new Map<string, SourceEntry>();
    const webByUrl = new Map<string, WebSource>();
    const workerFailures: Array<{ subQuestion: string; message: string }> = [];
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
    const initial = await runSettledBatches(
      inputData.subQuestions,
      researchLimits().researchConcurrency,
      async (sq) => {
        const outcome = await researchOne(sq);
        done += 1;
        await emit(writer, { stage: 'researching', detail: sq.question, current: done, total });
        return outcome;
      },
    );
    absorb(initial.values);
    workerFailures.push(...gapsOrThrow(initial.failures, inputData.subQuestions.length));

    // Bounded reflection loop with a closed-corpus novelty stop. A plan the
    // user pruned gets no follow-ups: the brief was written for the full plan,
    // so reflection would re-propose what they removed without a second approval.
    let reflectionRounds = 0;
    const pruned = inputData.removedQuestions.length > 0;
    if (pruned) log.info('deep_research.reflection_skipped', { reason: 'plan_pruned', removed: inputData.removedQuestions.length });
    let remaining = pruned ? 0 : researchLimits().maxSubQuestions - allSubQuestions.length;
    while (reflectionRounds < researchLimits().maxReflectionRounds && remaining > 0) {
      await emit(writer, { stage: 'reflecting', detail: `Checking for gaps (round ${reflectionRounds + 1})…` });
      const reflPrompt = `Research brief:\n${brief}\n\nFindings so far:\n${findings
        .map((f, i) => `${i + 1}. ${f.subQuestion}\n${f.summary}`)
        .join('\n\n')}\n\nIdentify remaining gaps versus the brief and propose up to ${remaining} follow-up sub-questions that would close them. If the findings already cover the brief, set sufficient=true and return no follow-ups.`;
      const reflection = await checkpointed(`reflection:${reflectionRounds}`, async () => {
        const reflRes = await deepResearchPlannerAgent.generate(reflPrompt, {
          // 'warn' returns no object on a malformed reflection instead of throwing.
          structuredOutput: { schema: ReflectionSchema, errorStrategy: 'warn' },
          maxSteps: researchLimits().plannerMaxSteps,
          prepareStep: async () => { await reserveResearchStep(`reflection:${reflectionRounds}`, researchLimits().plannerMaxSteps); },
          // The prompt is our own brief plus verified findings, not user input:
          // the planner's chat-input guards must not classify or block it.
          inputProcessors: [],
        });
        recordResearchUsage('reflection', DEEP_RESEARCH_MODEL, reflRes);
        // Reflection is an optional improvement. Losing it must not cost the
        // user the findings already paid for, so go on to synthesis instead.
        const parsed = ReflectionSchema.safeParse(reflRes.object);
        if (reflRes.tripwire || !parsed.success) {
          log.warn('deep_research.reflection_skipped', {
            reason: reflRes.tripwire ? 'tripwire' : 'invalid_reflection', round: reflectionRounds,
            ...(reflRes.tripwire ? { processorId: reflRes.tripwire.processorId } : {}),
          });
          return null;
        }
        return parsed.data;
      });
      if (!reflection || reflection.sufficient || !reflection.followUps?.length) break;

      const followUps: SubQuestion[] = uniqueQuestions(reflection.followUps, allSubQuestions).slice(0, remaining);
      if (!followUps.length) break;
      remaining -= followUps.length;
      allSubQuestions.push(...followUps);
      await publishResearchFollowUps(allSubQuestions.slice(inputData.subQuestions.length));
      const before = seenIds.size;
      const fuTotal = followUps.length;
      let fuDone = 0;
      const followUpResults = await runSettledBatches(
        followUps,
        researchLimits().researchConcurrency,
        async (sq) => {
          const outcome = await researchOne(sq);
          fuDone += 1;
          await emit(writer, { stage: 'researching', detail: sq.question, current: fuDone, total: fuTotal });
          return outcome;
        },
      );
      absorb(followUpResults.values);
      workerFailures.push(...gapsOrThrow(followUpResults.failures, followUps.length));
      reflectionRounds += 1;
      if (seenIds.size - before < researchLimits().noveltyMinNewIds) break; // corpus exhausted
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
      removedQuestions: inputData.removedQuestions,
      findings,
      workerFailures,
      corpusSources: [...corpusByKey.values()],
      webSources: [...webByUrl.values()],
      reflectionRounds,
    };
  }),
});

// ── Step 4: synthesize the report ─────────────────────────────────────────────

const synthesizeStep = createStep({
  id: 'synthesize',
  inputSchema: ResearchStepOut,
  outputSchema: SynthStepOut,
  execute: async ({ inputData, writer }) => checkpointed('synthesis', async () => {
    await emit(writer, { stage: 'synthesizing', detail: 'Writing the research report…' });
    const findingsBlock = inputData.findings
      .map((f, i) => `### Sub-question ${i + 1}: ${f.subQuestion}\n${f.summary}`)
      .join('\n\n');
    const webBlock = inputData.webSources.length
      ? `\n\nSupplementary web sources consulted:\n${inputData.webSources.map((w) => `- ${w.title} (${w.url})`).join('\n')}`
      : '';
    // The writer sees only the sub-question text of a gap, never the draft
    // that was withheld for it.
    const gapBlock = inputData.workerFailures.length
      ? `\n\nUnresolved gaps: these sub-questions could not be answered from verified sources. State each one as an unresolved gap. Do not answer them, and do not write what their answers might be:\n${inputData.workerFailures.map((f) => `- ${f.subQuestion}`).join('\n')}`
      : '';
    const prompt = `Original question:\n${inputData.question}\n\nResearch brief:\n${inputData.brief}\n\nFindings (each already carries inline citations):\n\n${findingsBlock}${webBlock}${gapBlock}\n\nWrite the full report now.`;
    const res = await deepResearchReportAgent.generate(prompt, {
      maxSteps: 1, prepareStep: async () => { await reserveResearchStep('synthesis', 1); },
    });
    recordResearchUsage('reporter', DEEP_RESEARCH_MODEL, res);
    return {
      question: inputData.question,
      brief: inputData.brief,
      subQuestions: inputData.subQuestions,
      reportMarkdown: res.text ?? '',
      corpusSources: inputData.corpusSources,
      webSources: inputData.webSources,
      workerFailures: inputData.workerFailures,
      reflectionRounds: inputData.reflectionRounds,
    };
  }),
});

// ── Step 5: verify (reuse the hallucination verifier) ─────────────────────────

const verifyStep = createStep({
  id: 'verify',
  inputSchema: SynthStepOut,
  outputSchema: DeepResearchReportSchema,
  execute: async ({ inputData, writer, getStepResult }) => checkpointed('report', async () => {
    await markResearchVerifying();
    await emit(writer, { stage: 'verifying', detail: 'Checking the report against sources…' });
    const sources = verificationSources(inputData.corpusSources, inputData.webSources);
    // The report restates findings that each passed verification against
    // their own sources, so the model checks it against those findings and the
    // role-tagged web excerpts instead of every worker's raw evidence. The
    // coverage, URL and quotation checks still read the raw sources.
    const verifierSources: SourceEntry[] = [
      ...getStepResult(researchStep).findings.map((finding, i) => findingEvidence(finding, i, inputData.webSources)),
      ...sources.filter(source => source.evidenceRole === 'supplementary'),
    ];
    const verified = await verifyResearchAnswer('report', inputData.question, inputData.reportMarkdown, sources, verifierSources);
    const safeSources = sources.map(s => ({ key: s.key, label: sourceLabel(s), link: s.link ?? null }));
    await publishResearchVerification(verified.outcome, safeSources);
    if (verified.outcome.status === 'withheld') throw new VerificationWithheldError(verified.retryable);
    const reportMarkdown = verified.finalAnswer;
    const urls = validateAnswerUrls(reportMarkdown, sources);
    const citationProvenance = { checkedCitations: urls.checkedUrlCount, retrievedCitations: urls.retrievedUrlCount, allowedCitations: urls.allowedUrlCount, unknownCitations: urls.unknownUrls.length };

    await emit(writer, { stage: 'done', detail: 'Research complete.' });
    return {
      verification: verified.outcome,
      status: 'completed' as const,
      question: inputData.question,
      brief: inputData.brief,
      reportMarkdown,
      subQuestions: inputData.subQuestions,
      corpusSources: inputData.corpusSources.map((s) => ({ key: s.key, label: sourceLabel(s), link: s.link ?? null })),
      webSources: inputData.webSources.map(({ title, url }) => ({ title, url })),
      workerFailures: inputData.workerFailures,
      citationProvenance,
      stats: {
        reflectionRounds: inputData.reflectionRounds,
        subQuestionCount: inputData.subQuestions.length,
        corpusSourceCount: inputData.corpusSources.length,
        webSourceCount: inputData.webSources.length,
      },
    };
  }),
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
