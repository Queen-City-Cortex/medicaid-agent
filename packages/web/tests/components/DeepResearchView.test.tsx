import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeepResearchView } from '../../src/components/DeepResearchView';
import type { DeepResearchController } from '../../src/lib/use-deep-research';

const question = (text: string) => ({ question: text, rationale: 'baseline', channels: ['concept' as const], useWeb: false });
const PLAN = { brief: 'Compare PA rules', subQuestions: [question('Scope?'), question('Eligibility?'), question('Appeals?')] };

function makeController(over: Partial<DeepResearchController> = {}): DeepResearchController {
  return {
    status: 'idle',
    recoveryCount: 0,
    recoveryProgress: { completedQuestions: 0, checkpoints: 0 },
    sources: [],
    plan: null,
    report: null,
    error: null,
    notice: null,
    question: '',
    elapsedMs: 0,
    isBusy: false,
    start: vi.fn(),
    approve: vi.fn(),
    decline: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
}

describe('DeepResearchView plan approval', () => {
  it('approves a pruned plan by the positions of the kept sub-questions', () => {
    const controller = makeController({ status: 'awaiting-approval', plan: PLAN });
    render(<DeepResearchView controller={controller} />);
    fireEvent.click(screen.getAllByLabelText('Exclude sub-question')[1]);
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(controller.approve).toHaveBeenCalledWith([0, 2]);
  });

  it('approves an untouched plan without naming sub-questions', () => {
    const controller = makeController({ status: 'awaiting-approval', plan: PLAN });
    render(<DeepResearchView controller={controller} />);
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(controller.approve).toHaveBeenCalledWith(undefined);
  });
});

describe('DeepResearchView daily limit', () => {
  it('shows a refused start as a notice beside the empty state, with nothing to retry', () => {
    const notice = 'You have used both research reports available in a 24-hour period. You can start another after Friday 8:00 AM.';
    render(<DeepResearchView controller={makeController({ notice })} />);
    expect(screen.getByTestId('deep-research-notice')).toHaveTextContent(notice);
    expect(screen.getByTestId('deep-research-empty')).toBeInTheDocument();
    expect(screen.queryByText('The research report could not be released.')).not.toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });
});
