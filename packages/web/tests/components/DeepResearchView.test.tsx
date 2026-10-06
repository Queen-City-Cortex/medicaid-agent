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

describe('DeepResearchView exclusions', () => {
  it('starts the next plan with nothing excluded', () => {
    const first = makeController({ status: 'awaiting-approval', plan: PLAN });
    const { rerender } = render(<DeepResearchView controller={first} />);
    fireEvent.click(screen.getAllByLabelText('Exclude sub-question')[1]);
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(first.approve).toHaveBeenCalledWith([0, 2]);

    // The view stays mounted while the mode is on: the run finishes and a new question is planned.
    rerender(<DeepResearchView controller={makeController({ status: 'researching', plan: PLAN })} />);
    rerender(<DeepResearchView controller={makeController({ status: 'planning' })} />);
    const second = makeController({ status: 'awaiting-approval', plan: { brief: 'Compare appeal rights', subQuestions: [question('Notice?'), question('Deadlines?'), question('Hearings?')] } });
    rerender(<DeepResearchView controller={second} />);

    expect(screen.getAllByLabelText('Exclude sub-question')).toHaveLength(3);
    expect(screen.queryByLabelText('Include sub-question')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(second.approve).toHaveBeenCalledWith(undefined);
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

describe('DeepResearchView phase announcements', () => {
  it('has one status element whose text follows the phase and does not change with the clock', () => {
    const { rerender } = render(<DeepResearchView controller={makeController()} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveClass('sr-only');

    const phases: Array<[Partial<DeepResearchController>, string]> = [
      [{ status: 'planning' }, 'Deep Research: planning.'],
      [{ status: 'awaiting-approval', plan: PLAN }, 'Deep Research: plan ready for your approval.'],
      [{ status: 'researching', plan: PLAN }, 'Deep Research: researching.'],
      [{ status: 'recovering', plan: PLAN, recoveryCount: 1 }, 'Deep Research: recovering completed work.'],
      [{ status: 'verifying', plan: PLAN }, 'Deep Research: verifying the report.'],
      [{ status: 'cancelled' }, 'Deep Research: cancelled.'],
      [{ status: 'error', error: 'failed' }, 'Deep Research: the report could not be released.'],
      [{ status: 'done' }, 'Deep Research: report ready.'],
    ];
    for (const [over, text] of phases) {
      rerender(<DeepResearchView controller={makeController(over)} />);
      // The same element throughout, and the only live region in the view.
      expect(screen.getAllByRole('status')).toEqual([status]);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(status).toHaveTextContent(new RegExp(`^${text.replace(/\./g, '\\.')}$`));
    }
  });

  it('does not rewrite the status text while a phase lasts', async () => {
    const { rerender } = render(<DeepResearchView controller={makeController({ status: 'researching', plan: PLAN })} />);
    const status = screen.getByRole('status');
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => { changes.push(...records); });
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    // Each poll and each second of the clock renders the view again.
    for (const elapsedMs of [1000, 2000, 61_000]) {
      rerender(<DeepResearchView controller={makeController({ status: 'researching', plan: PLAN, elapsedMs })} />);
    }
    await Promise.resolve();
    observer.disconnect();

    expect(changes).toEqual([]);
    expect(screen.getByText(/1m 1s/)).toBeInTheDocument();
  });
});
