import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeepResearch } from '@/lib/use-deep-research';

const PLAN = {
  brief: 'Compare PA rules',
  subQuestions: [{ question: 'Which services need PA?', rationale: 'baseline', channels: ['concept'], useWeb: false }],
};

const REPORT = {
  status: 'completed' as const,
  question: 'Does X?',
  brief: 'b',
  reportMarkdown: '# Report\n\nFindings.',
  subQuestions: [],
  corpusSources: [],
  webSources: [],
  workerFailures: [],
  citationProvenance: null,
  stats: { reflectionRounds: 0, subQuestionCount: 1, corpusSourceCount: 0, webSourceCount: 0 },
};

function run(state: string, extras: Record<string, unknown> = {}) {
  return {
    runId: 'run-1',
    state,
    question: 'Does X?',
    plan: null,
    report: null,
    error: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...extras,
  };
}

function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function setup() {
  let approved = false;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith('/research/runs') && init?.method === 'POST') return json(run('queued'), 202);
    if (url.endsWith('/decision')) {
      approved = true;
      return json(run('researching', { plan: PLAN }), 202);
    }
    if (url.endsWith('/cancel')) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.endsWith('/research/runs/run-1')) {
      return approved
        ? json(run('completed', { plan: PLAN, report: REPORT }))
        : json(run('awaiting_approval', { plan: PLAN }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const getAccessToken = vi.fn().mockResolvedValue('token');
  return { ...renderHook(() => useDeepResearch({ getAccessToken })), fetchMock };
}

afterEach(() => vi.restoreAllMocks());

describe('useDeepResearch', () => {
  it('starts an owned run and surfaces its durable plan', async () => {
    const { result, fetchMock } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/research/runs'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.status).toBe('awaiting-approval');
    expect(result.current.plan?.subQuestions).toHaveLength(1);
  });

  it('approves the owned run and polls its report', async () => {
    const { result, fetchMock } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    await act(async () => { await result.current.approve(); });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/decision'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.status).toBe('done');
    expect(result.current.report?.reportMarkdown).toContain('# Report');
  });

  it('reset aborts polling and clears the plan', async () => {
    const { result } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.plan).toBeNull();
  });

  it('cancels active work through the owned endpoint', async () => {
    const { result, fetchMock } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    await act(async () => { await result.current.cancel(); });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/research/runs/run-1/cancel'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.status).toBe('cancelled');
  });
});
