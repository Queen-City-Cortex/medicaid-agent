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
  | 'done'
  | 'cancelled'
  | 'error';

interface ErrorEnvelope {
  error?: { message?: string } | string;
}

type GetAccessToken = () => Promise<string | null | undefined>;

function errorMessage(payload: ErrorEnvelope, status: number): string {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message ?? `Research request failed (${status})`;
}

export function useDeepResearch({ getAccessToken }: { getAccessToken: GetAccessToken }) {
  const [status, setStatus] = useState<DeepResearchStatus>('idle');
  const [plan, setPlan] = useState<DeepResearchPlan | null>(null);
  const [report, setReport] = useState<DeepResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<DeepResearchStatus>('idle');
  statusRef.current = status;

  const working = status === 'planning' || status === 'researching';
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
      throw new Error(errorMessage(payload, response.status));
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }, [getAccessToken]);
  const requestRef = useRef(request);
  requestRef.current = request;

  const applyRun = useCallback((run: ResearchRun): boolean => {
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
    setStatus(run.state === 'queued' || run.state === 'planning' ? 'planning' : 'researching');
    return false;
  }, []);

  const poll = useCallback(async (runId: string, signal: AbortSignal): Promise<void> => {
    for (;;) {
      if (signal.aborted) return;
      const run = await request<ResearchRun>(
        `/research/runs/${encodeURIComponent(runId)}`,
        { method: 'GET' },
        signal,
      );
      if (applyRun(run)) return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1_500);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
  }, [applyRun, request]);

  const start = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setQuestion(q);
    setPlan(null);
    setReport(null);
    setError(null);
    setStatus('planning');
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const run = await request<ResearchRun>('/research/runs', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      }, controller.signal);
      runIdRef.current = run.runId;
      applyRun(run);
      await poll(run.runId, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [applyRun, poll, request]);

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
    if (runId && ['planning', 'awaiting-approval', 'researching'].includes(statusRef.current)) {
      void (async () => {
        const controller = new AbortController();
        try {
          await requestRef.current(
            `/research/runs/${encodeURIComponent(runId)}/cancel`,
            { method: 'POST', body: '{}' },
            controller.signal,
          );
        } catch {
          // Navigation/reset is best-effort; the durable lease still bounds work.
        }
      })();
    }
    setStatus('idle');
    setPlan(null);
    setReport(null);
    setError(null);
    setQuestion('');
    setStartedAt(null);
  }, []);

  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const isBusy = status === 'planning' || status === 'researching';
  return {
    status,
    plan,
    report,
    error,
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
