import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDeepResearch } from '@/lib/use-deep-research';
import type { MastraRunner } from '@/lib/use-mastra-client';

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
  verification: null,
  stats: { reflectionRounds: 0, subQuestionCount: 1, corpusSourceCount: 0, webSourceCount: 0 },
};

function setup() {
  const startAsync = vi.fn().mockResolvedValue({
    status: 'suspended',
    suspendPayload: { 'plan-approval': PLAN },
  });
  const resumeAsync = vi.fn().mockResolvedValue({ status: 'success', result: REPORT });
  // createRun returns a run carrying whatever runId it was (re-)created with;
  // a fresh start has no runId so it mints 'run-1'.
  const createRun = vi.fn((params?: { runId?: string }) =>
    Promise.resolve({ runId: params?.runId ?? 'run-1', startAsync, resumeAsync }),
  );
  const getWorkflow = vi.fn(() => ({ createRun }));
  const client = { getWorkflow };
  // Pass-through runner (real fresh-token + 401-retry is unit-tested in
  // tests/lib/mastra-client.test.ts).
  const run: MastraRunner = (op) => op(client as never);
  return { ...renderHook(() => useDeepResearch({ run })), createRun, startAsync, resumeAsync };
}

describe('useDeepResearch', () => {
  it('starts the workflow through the runner and surfaces the suspended plan', async () => {
    const { result, startAsync } = setup();

    await act(async () => {
      await result.current.start('Does X?');
    });

    expect(startAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('awaiting-approval');
    expect(result.current.plan?.subQuestions).toHaveLength(1);
  });

  it('re-attaches to the stored runId on approve and renders the report', async () => {
    const { result, createRun, resumeAsync } = setup();

    await act(async () => {
      await result.current.start('Does X?');
    });
    await act(async () => {
      await result.current.approve();
    });

    // The resume must re-create the run by the SAME runId captured at start —
    // this is what lets a suspended run survive the token expiring during the
    // plan-approval gate (each createRun gets a freshly-tokened client).
    expect(createRun).toHaveBeenCalledTimes(2);
    expect(createRun).toHaveBeenLastCalledWith({ runId: 'run-1' });
    expect(resumeAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('done');
    expect(result.current.report?.reportMarkdown).toContain('# Report');
  });

  it('reset returns to idle and clears the plan', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.start('Does X?');
    });
    expect(result.current.status).toBe('awaiting-approval');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.plan).toBeNull();
  });
});
