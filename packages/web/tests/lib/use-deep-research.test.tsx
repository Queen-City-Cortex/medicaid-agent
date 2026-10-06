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

const NO_CONTENT = () => Promise.resolve(new Response(null, { status: 204 }));

interface Backend {
  /** The caller's active run on the server, as `GET /research/runs/current` reports it. */
  active?: ReturnType<typeof run> | null;
  /** Refuse the start as the server does while another run is active. */
  rejectStart?: boolean;
  /** Refuse the start with this response instead. */
  refuseStart?: () => Promise<Response>;
  /** Responses for `GET /research/runs/run-1`, consumed in order before the default. */
  polls?: Array<() => Promise<Response>>;
}

function setup(backend: Backend = {}) {
  let approved = false;
  const polls = [...(backend.polls ?? [])];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith('/research/runs') && init?.method === 'POST') {
      if (backend.refuseStart) return backend.refuseStart();
      return backend.rejectStart
        ? json({ error: { code: 'active_research_run', message: 'Only one active research run is allowed per user.' } }, 409)
        : json(run('queued'), 202);
    }
    if (url.endsWith('/research/runs/current')) return backend.active ? json(backend.active) : NO_CONTENT();
    if (url.endsWith('/decision')) {
      approved = true;
      return json(run('researching', { plan: PLAN }), 202);
    }
    if (url.endsWith('/cancel')) return NO_CONTENT();
    if (url.endsWith('/research/runs/run-1')) {
      const next = polls.shift();
      if (next) return next();
      return approved
        ? json(run('completed', { plan: PLAN, report: REPORT }))
        : json(run('awaiting_approval', { plan: PLAN }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const getAccessToken = vi.fn().mockResolvedValue('token');
  return { ...renderHook(() => useDeepResearch({ getAccessToken, userId: 'owner' })), fetchMock };
}

const requests = (fetchMock: ReturnType<typeof setup>['fetchMock']) =>
  fetchMock.mock.calls.map(([input, init]) => `${init?.method} ${String(input).replace(/^.*(?=\/research\/)/, '')}`);

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear(); });

describe('useDeepResearch', () => {
  it('asks the server for nothing while signed out and stays idle when there is no active run', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(NO_CONTENT);
    const getAccessToken = async () => 'token';
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useDeepResearch({ getAccessToken, userId }),
      { initialProps: { userId: null as string | null } },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ userId: 'owner' });
    await waitFor(() => expect(requests(fetchMock)).toEqual(['GET /research/runs/current']));
    expect(result.current.status).toBe('idle');
  });

  it('stays idle when the active run cannot be looked up', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({ error: 'Unavailable' }, 503));
    const { result } = renderHook(() => useDeepResearch({ getAccessToken: async () => 'token', userId: 'owner' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('ignores an old account response after the account changes', async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    const getAccessToken = async () => 'token';
    const { result, rerender } = renderHook(({ userId }) => useDeepResearch({ getAccessToken, userId }), { initialProps: { userId: 'owner' } });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ userId: 'other-user' });
    await act(async () => { pending[0](await json(run('completed', { report: REPORT }))); });
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.question).toBe('');
  });

  it('shows a pending plan when the tab is reopened, without any browser-stored run id', async () => {
    const { result, fetchMock } = setup({ active: run('awaiting_approval', { plan: PLAN }) });
    await waitFor(() => expect(result.current.status).toBe('awaiting-approval'));
    expect(result.current.question).toBe('Does X?');
    expect(result.current.plan?.subQuestions).toHaveLength(1);
    expect(requests(fetchMock)).toEqual(['GET /research/runs/current']);
    expect(sessionStorage.length).toBe(0);

    await act(async () => { await result.current.approve(); });
    expect(requests(fetchMock)).toContain('POST /research/runs/run-1/decision');
    expect(result.current.status).toBe('done');
  });

  it('follows an in-flight run found on load until it needs the user', async () => {
    const { result, fetchMock } = setup({ active: run('planning') });
    await waitFor(() => expect(result.current.status).toBe('awaiting-approval'));
    expect(requests(fetchMock)).toEqual(['GET /research/runs/current', 'GET /research/runs/run-1']);
  });

  it('adopts the existing run when a start is refused with 409 active_research_run', async () => {
    const backend: Backend = { rejectStart: true };
    const { result, fetchMock } = setup(backend);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The plan was produced after this page looked: the page does not know the run.
    backend.active = run('awaiting_approval', { plan: PLAN });

    await act(async () => { await result.current.start('A different question'); });
    expect(result.current.status).toBe('awaiting-approval');
    expect(result.current.error).toBeNull();
    expect(result.current.question).toBe('Does X?');
    expect(result.current.notice).toMatch(/already have a research run/);

    await act(async () => { await result.current.decline(); });
    expect(requests(fetchMock)).toContain('POST /research/runs/run-1/decision');
    expect(result.current.status).toBe('cancelled');
  });

  it.each([
    ['research_daily_quota', 'You have used both research reports available in a 24-hour period.'],
    ['research_planning_limit', 'You have started the most research plans allowed in a 24-hour period.'],
  ])('shows %s as a notice with the time to try again, not as a failed report', async (code, message) => {
    const retryAt = '2026-07-24T12:00:00.000Z';
    const { result } = setup({ refuseStart: () => json({ error: { code, message, retryAfterSeconds: 3600, retryAt } }, 429) });
    await act(async () => { await result.current.start('Does X?'); });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.isBusy).toBe(false);
    const when = new Date(retryAt).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    expect(result.current.notice).toBe(`${message} You can start another after ${when}.`);

    act(() => result.current.reset());
    expect(result.current.notice).toBeNull();
  });

  it('shows the refusal when no active run can be found after a 409', async () => {
    const { result } = setup({ rejectStart: true });
    await act(async () => { await result.current.start('Does X?'); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Only one active research run is allowed per user.');
  });

  it('cancels the run when resetting from an error so the next start is not blocked', async () => {
    const { result, fetchMock } = setup({ polls: [() => json({ error: { message: 'Research run not found.' } }, 404)] });
    await act(async () => { await result.current.start('Does X?'); });
    expect(result.current.status).toBe('error');
    expect(requests(fetchMock)).not.toContain('POST /research/runs/run-1/cancel');

    await act(async () => { result.current.reset(); });
    expect(requests(fetchMock)).toContain('POST /research/runs/run-1/cancel');
    expect(result.current.status).toBe('idle');
  });

  it('rides out a few consecutive failed polls', async () => {
    vi.useFakeTimers();
    const failed = () => json({ error: { message: 'Bad gateway' } }, 502);
    const { result, fetchMock } = setup({
      polls: [failed, () => Promise.reject(new TypeError('Failed to fetch')), failed],
    });
    await act(async () => {
      const started = result.current.start('Does X?');
      await vi.advanceTimersByTimeAsync(10_000);
      await started;
    });
    expect(result.current.status).toBe('awaiting-approval');
    expect(result.current.error).toBeNull();
    expect(requests(fetchMock).filter(request => request === 'GET /research/runs/run-1')).toHaveLength(4);
  });

  it('shows an error once polls keep failing', async () => {
    vi.useFakeTimers();
    const failed = () => json({ error: { message: 'Bad gateway' } }, 502);
    const { result } = setup({ polls: [failed, failed, failed, failed] });
    await act(async () => {
      const started = result.current.start('Does X?');
      await vi.advanceTimersByTimeAsync(10_000);
      await started;
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Bad gateway');
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

  it('approves a pruned plan by naming the kept positions, never question text', async () => {
    const { result, fetchMock } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    await act(async () => { await result.current.approve([2, 0]); });
    const decision = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/decision'));
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ approved: true, keptSubQuestions: [2, 0] });
  });

  it('approves the whole plan without naming sub-questions', async () => {
    const { result, fetchMock } = setup();
    await act(async () => { await result.current.start('Does X?'); });
    await act(async () => { await result.current.approve(); });
    const decision = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/decision'));
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ approved: true });
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
