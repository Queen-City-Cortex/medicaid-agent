'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ResearchPlan,
  ResearchReport,
  ResearchRun,
  ResearchSubQuestion,
} from '@nc-medicaid/contracts';
import { MASTRA_URL } from './mastra-url';

export type DeepResearchSubQuestion = ResearchSubQuestion;
export type DeepResearchPlan = ResearchPlan;
export type DeepResearchReport = ResearchReport;

export type DeepResearchStatus =
  | 'idle'
  | 'planning'
  | 'awaiting-approval'
  | 'researching'
  | 'recovering'
  | 'verifying'
  | 'done'
  | 'cancelled'
  | 'error';

interface ErrorEnvelope {
  error?: { code?: string; message?: string } | string;
}

type GetAccessToken = () => Promise<string | null | undefined>;
const POLL_INTERVAL_MS = 1_500;
// Consecutive failed polls tolerated before the run is shown as an error.
const MAX_FAILED_POLLS = 3;

class ResearchRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

// A missing or forbidden run will not come back; anything else may be a blip.
function isTransientPollError(cause: unknown): boolean {
  return !(cause instanceof ResearchRequestError) || cause.status === 429 || cause.status >= 500;
}

function errorMessage(payload: ErrorEnvelope, status: number): string {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message ?? `Research request failed (${status})`;
}

export function useDeepResearch({ getAccessToken, userId }: { getAccessToken: GetAccessToken; userId: string | null }) {
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [recoveryProgress, setRecoveryProgress] = useState<ResearchRun['recoveryProgress']>({ completedQuestions: 0, checkpoints: 0 });
  const [sources, setSources] = useState<ResearchRun['sources']>([]);
  const [status, setStatus] = useState<DeepResearchStatus>('idle');
  const [plan, setPlan] = useState<DeepResearchPlan | null>(null);
  const [report, setReport] = useState<DeepResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<DeepResearchStatus>('idle');
  statusRef.current = status;

  const working = ['planning', 'researching', 'recovering', 'verifying'].includes(status);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [working]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const request = useCallback(async <T,>(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<T> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Authentication expired. Sign in again and retry.');
    const response = await fetch(`${MASTRA_URL}${path}`, {
      ...init,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new ResearchRequestError(
        errorMessage(payload, response.status),
        response.status,
        typeof payload.error === 'object' ? payload.error.code : undefined,
      );
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }, [getAccessToken]);
  const requestRef = useRef(request);
  requestRef.current = request;

  const applyRun = useCallback((run: ResearchRun): boolean => {
    setQuestion(run.question);
    setRecoveryCount(run.recoveryCount ?? 0);
    setRecoveryProgress(run.recoveryProgress ?? { completedQuestions: 0, checkpoints: 0 });
    setSources(run.sources ?? []);
    setPlan(run.plan);
    if (run.state === 'awaiting_approval') {
      setStatus('awaiting-approval');
      return true;
    }
    if (run.state === 'completed' && run.report) {
      setReport(run.report);
      setStatus('done');
      return true;
    }
    if (run.state === 'cancelled') {
      setReport(run.report);
      setStatus('cancelled');
      return true;
    }
    if (run.state === 'failed') {
      setError(run.error ?? 'Research failed.');
      setStatus('error');
      return true;
    }
    setStatus(run.state === 'queued' || run.state === 'planning' ? 'planning' : run.state === 'recovering' ? 'recovering' : run.state === 'verifying' ? 'verifying' : 'researching');
    return false;
  }, []);

  const poll = useCallback(async (runId: string, signal: AbortSignal): Promise<void> => {
    let failedPolls = 0;
    for (;;) {
      if (signal.aborted) return;
      try {
        const run = await request<ResearchRun>(
          `/research/runs/${encodeURIComponent(runId)}`,
          { method: 'GET' },
          signal,
        );
        if (signal.aborted) return;
        failedPolls = 0;
        if (applyRun(run)) return;
      } catch (cause) {
        if (signal.aborted) return;
        failedPolls += 1;
        if (!isTransientPollError(cause) || failedPolls > MAX_FAILED_POLLS) throw cause;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, POLL_INTERVAL_MS);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
  }, [applyRun, request]);

  // The server owns the run. Adopt the caller's active one, which survives a
  // closed tab, and follow it to a state that needs the user or is terminal.
  const adopt = useCallback(async (run: ResearchRun, signal: AbortSignal): Promise<void> => {
    runIdRef.current = run.runId;
    if (!applyRun(run)) await poll(run.runId, signal);
  }, [applyRun, poll]);
  const currentRun = useCallback((signal: AbortSignal) => request<ResearchRun | undefined>(
    '/research/runs/current',
    { method: 'GET' },
    signal,
  ), [request]);

  const loadRef = useRef({ adopt, currentRun });
  loadRef.current = { adopt, currentRun };
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current = null;
    setStatus('idle');
    setPlan(null);
    setReport(null);
    setSources([]);
    setQuestion('');
    setError(null);
    setNotice(null);
    setStartedAt(null);
    setRecoveryCount(0);
    setRecoveryProgress({ completedQuestions: 0, checkpoints: 0 });
    if (!userId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      let run: ResearchRun | undefined;
      try {
        run = await loadRef.current.currentRun(controller.signal);
      } catch {
        // Not knowing is not an error to show: starting a run asks again.
        return;
      }
      if (!run || controller.signal.aborted) return;
      try {
        await loadRef.current.adopt(run, controller.signal);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    })();
    return () => { controller.abort(); runIdRef.current = null; };
  }, [userId]);

  const start = useCallback(async (q: string) => {
    if (!userId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setQuestion(q);
    setPlan(null);
    setReport(null);
    setSources([]);
    setRecoveryCount(0);
    setRecoveryProgress({ completedQuestions: 0, checkpoints: 0 });
    setError(null);
    setNotice(null);
    setStatus('planning');
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const run = await request<ResearchRun>('/research/runs', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      }, controller.signal);
      if (controller.signal.aborted) return;
      runIdRef.current = run.runId;
      applyRun(run);
      await poll(run.runId, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) return;
      let shown = cause;
      if (cause instanceof ResearchRequestError && cause.code === 'active_research_run') {
        // The start was refused because a run already exists: show that run,
        // which the user can approve or cancel, rather than a dead end.
        let active: ResearchRun | undefined;
        try {
          active = await currentRun(controller.signal);
        } catch { /* Keep the refusal as the message. */ }
        if (controller.signal.aborted) return;
        if (active) {
          setNotice('You already have a research run in progress. Finish or cancel it before starting another.');
          try {
            await adopt(active, controller.signal);
            return;
          } catch (adoptCause) {
            if (controller.signal.aborted) return;
            shown = adoptCause;
          }
        }
      }
      setError(shown instanceof Error ? shown.message : String(shown));
      setStatus('error');
    }
  }, [adopt, applyRun, currentRun, poll, request, userId]);

  const approve = useCallback(async (editedSubQuestions?: DeepResearchSubQuestion[]) => {
    const runId = runIdRef.current;
    if (!runId) return;
    setStatus('researching');
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const controller = abortRef.current ?? new AbortController();
      abortRef.current = controller;
      await request(`/research/runs/${encodeURIComponent(runId)}/decision`, {
        method: 'POST',
        body: JSON.stringify(editedSubQuestions?.length
          ? { approved: true, editedSubQuestions }
          : { approved: true }),
      }, controller.signal);
      await poll(runId, controller.signal);
    } catch (cause) {
      if (abortRef.current?.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [poll, request]);

  const decline = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    setStatus('cancelled');
    try {
      const controller = abortRef.current ?? new AbortController();
      abortRef.current = controller;
      await request(`/research/runs/${encodeURIComponent(runId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ approved: false }),
      }, controller.signal);
    } catch (cause) {
      if (abortRef.current?.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [request]);

  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await request(
        `/research/runs/${encodeURIComponent(runId)}/cancel`,
        { method: 'POST', body: '{}' },
        controller.signal,
      );
      setStatus('cancelled');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [request]);

  const reset = useCallback(() => {
    const runId = runIdRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current = null;
    // `error` is included: the run may still be active on the server, and
    // forgetting it without cancelling would block the next start.
    if (runId && !['idle', 'done', 'cancelled'].includes(statusRef.current)) {
      void (async () => {
        const controller = new AbortController();
        try {
          await requestRef.current(
            `/research/runs/${encodeURIComponent(runId)}/cancel`,
            { method: 'POST', body: '{}' },
            controller.signal,
          );
        } catch {
          // Navigation/reset is best-effort; the server still bounds the run.
        }
      })();
    }
    setStatus('idle');
    setPlan(null);
    setReport(null);
    setSources([]);
    setRecoveryCount(0);
    setRecoveryProgress({ completedQuestions: 0, checkpoints: 0 });
    setError(null);
    setNotice(null);
    setQuestion('');
    setStartedAt(null);
  }, []);

  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const isBusy = ['planning', 'researching', 'recovering', 'verifying'].includes(status);
  return {
    status,
    recoveryCount,
    recoveryProgress,
    sources,
    plan,
    report,
    error,
    notice,
    question,
    elapsedMs,
    isBusy,
    start,
    approve,
    decline,
    cancel,
    reset,
  };
}

export type DeepResearchController = ReturnType<typeof useDeepResearch>;
