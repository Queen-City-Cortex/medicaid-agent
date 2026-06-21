'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MastraClient } from '@mastra/client-js';

// Client-side mirror of the agent's deep-research output schema
// (packages/agent/src/deep-research/schemas.ts). Kept as a local interface so
// the web package doesn't take a build-time dependency on the agent package.

const WORKFLOW_ID = 'deepResearchWorkflow';
const APPROVAL_STEP = 'plan-approval';

export interface DeepResearchSubQuestion {
  question: string;
  rationale: string;
  channels: string[];
  useWeb: boolean;
}

export interface DeepResearchPlan {
  brief: string;
  subQuestions: DeepResearchSubQuestion[];
}

export interface DeepResearchCorpusSource {
  key: string;
  label: string;
  link: string | null;
}

export interface DeepResearchWebSource {
  title: string;
  url: string;
}

export interface DeepResearchVerification {
  checkedCitations: number;
  groundedCitations: number;
  fabricatedCitations: number;
}

export interface DeepResearchReport {
  status: 'completed' | 'cancelled';
  question: string;
  brief: string;
  reportMarkdown: string;
  subQuestions: DeepResearchSubQuestion[];
  corpusSources: DeepResearchCorpusSource[];
  webSources: DeepResearchWebSource[];
  verification: DeepResearchVerification | null;
  stats: {
    reflectionRounds: number;
    subQuestionCount: number;
    corpusSourceCount: number;
    webSourceCount: number;
  };
}

export type DeepResearchStatus =
  | 'idle'
  | 'planning'
  | 'awaiting-approval'
  | 'researching'
  | 'done'
  | 'cancelled'
  | 'error';

interface WorkflowRun {
  startAsync(params: { inputData: Record<string, unknown> }): Promise<unknown>;
  resumeAsync(params: { step?: string; resumeData?: Record<string, unknown> }): Promise<unknown>;
}

interface RawWorkflowResult {
  status: string;
  // Mastra keys the top-level suspend payload by step id, e.g.
  // { 'plan-approval': { brief, subQuestions } }.
  suspendPayload?: Record<string, DeepResearchPlan> & Partial<DeepResearchPlan>;
  steps?: Record<string, { suspendPayload?: DeepResearchPlan }>;
  result?: DeepResearchReport;
  error?: unknown;
}

/** Narrow the loosely-typed WorkflowRunResult into the cases we care about. */
function asResult(r: unknown): RawWorkflowResult {
  return (r ?? {}) as RawWorkflowResult;
}

/** The plan-approval suspend payload lives at one of a few locations depending
 *  on Mastra version; check them all. */
function extractPlan(r: RawWorkflowResult): DeepResearchPlan | null {
  const byStepMap = r.suspendPayload?.[APPROVAL_STEP];
  if (byStepMap?.subQuestions) return byStepMap;
  const byStepResult = r.steps?.[APPROVAL_STEP]?.suspendPayload;
  if (byStepResult?.subQuestions) return byStepResult;
  if (r.suspendPayload?.subQuestions) return r.suspendPayload as DeepResearchPlan;
  return null;
}

/**
 * Drives the deep-research workflow from the browser:
 *   start(question) → plan (suspends) → approve()/decline() → report.
 *
 * Control flow uses startAsync/resumeAsync (which carry an explicit status,
 * suspendPayload, and result) rather than chunk parsing — robust for the MVP.
 * Progress is reported at phase granularity ('planning' / 'researching').
 */
export function useDeepResearch({ mastraClient }: { mastraClient: MastraClient }) {
  const [status, setStatus] = useState<DeepResearchStatus>('idle');
  const [plan, setPlan] = useState<DeepResearchPlan | null>(null);
  const [report, setReport] = useState<DeepResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string>('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const runRef = useRef<WorkflowRun | null>(null);

  // Elapsed-time ticker while a phase is actively working.
  const working = status === 'planning' || status === 'researching';
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [working]);

  const start = useCallback(
    async (q: string) => {
      setQuestion(q);
      setPlan(null);
      setReport(null);
      setError(null);
      setStatus('planning');
      setStartedAt(Date.now());
      setNow(Date.now());
      try {
        const run = (await mastraClient.getWorkflow(WORKFLOW_ID).createRun()) as unknown as WorkflowRun;
        runRef.current = run;
        const res = asResult(await run.startAsync({ inputData: { question: q } }));
        const extracted = extractPlan(res);
        if (res.status === 'suspended' && extracted) {
          setPlan(extracted);
          setStatus('awaiting-approval');
        } else if (res.status === 'success' && res.result) {
          // Shouldn't normally happen (the plan gate suspends), but handle it.
          setReport(res.result);
          setStatus('done');
        } else {
          setError(`Planning ended with status: ${res.status}`);
          setStatus('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [mastraClient],
  );

  const finishResume = useCallback(async (resumeData: Record<string, unknown>) => {
    const run = runRef.current;
    if (!run) return;
    try {
      const res = asResult(await run.resumeAsync({ step: APPROVAL_STEP, resumeData }));
      if (res.status === 'success' && res.result) {
        setReport(res.result);
        setStatus(res.result.status === 'cancelled' ? 'cancelled' : 'done');
      } else {
        setError(`Research ended with status: ${res.status}`);
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const approve = useCallback(
    async (editedSubQuestions?: DeepResearchSubQuestion[]) => {
      setStatus('researching');
      setStartedAt(Date.now());
      setNow(Date.now());
      await finishResume(
        editedSubQuestions?.length ? { approved: true, editedSubQuestions } : { approved: true },
      );
    },
    [finishResume],
  );

  const decline = useCallback(async () => {
    // The decline round-trip just bails the workflow to a cancelled report, so
    // show the cancelled state immediately rather than flashing "Researching…".
    setStatus('cancelled');
    await finishResume({ approved: false });
  }, [finishResume]);

  const reset = useCallback(() => {
    runRef.current = null;
    setStatus('idle');
    setPlan(null);
    setReport(null);
    setError(null);
    setQuestion('');
    setStartedAt(null);
  }, []);

  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const isBusy = status === 'planning' || status === 'researching';

  return { status, plan, report, error, question, elapsedMs, isBusy, start, approve, decline, reset };
}

export type DeepResearchController = ReturnType<typeof useDeepResearch>;
