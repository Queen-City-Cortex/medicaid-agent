import { renderHook, act, waitFor } from '@testing-library/react';
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
  return { ...renderHook(() => useDeepResearch({ getAccessToken, userId: 'owner' })), fetchMock };
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe('useDeepResearch', () => {
  it('does not restore another account or an ownerless legacy run', async () => {
    sessionStorage.setItem('nc-medicaid-research-run:other-user', 'private-run');
    sessionStorage.setItem('nc-medicaid-research-run', 'legacy-run');
    const { result, fetchMock } = setup();
    expect(result.current.status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('nc-medicaid-research-run')).toBeNull();
  });
  it.each([401, 403, 404])('forgets inaccessible restored runs (%s)', async status => {
    sessionStorage.setItem('nc-medicaid-research-run:owner', 'missing');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({ error: 'Not accessible' }, status));
    const { result } = renderHook(() => useDeepResearch({ getAccessToken: async () => 'token', userId: 'owner' }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(sessionStorage.getItem('nc-medicaid-research-run:owner')).toBeNull();
  });
  it('ignores an old account response after the account changes', async () => {
    sessionStorage.setItem('nc-medicaid-research-run:owner', 'run-1');
    let complete!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const getAccessToken = async () => 'token';
    const { result, rerender } = renderHook(({ userId }) => useDeepResearch({ getAccessToken, userId }), { initialProps: { userId: 'owner' } });
    await waitFor(() => expect(complete).toBeDefined());
    rerender({ userId: 'other-user' });
    await act(async () => { complete(await json(run('completed', { report: REPORT }))); });
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.question).toBe('');
  });

  it('reloads a waiting plan without approving or starting a new run', async () => {
    sessionStorage.setItem('nc-medicaid-research-run:owner', 'run-1');
    const { result, fetchMock } = setup();
    await waitFor(() => expect(result.current.status).toBe('awaiting-approval'));
    expect(result.current.question).toBe('Does X?');
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });
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
