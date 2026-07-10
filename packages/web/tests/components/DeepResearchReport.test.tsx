import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeepResearchReportView } from '../../src/components/DeepResearchReport';
import type { DeepResearchReport } from '../../src/lib/use-deep-research';

function makeReport(overrides: Partial<DeepResearchReport> = {}): DeepResearchReport {
  return {
    status: 'completed',
    question: 'q',
    brief: 'brief',
    reportMarkdown: 'Some findings.',
    subQuestions: [],
    corpusSources: [],
    webSources: [],
    verification: { checkedCitations: 3, groundedCitations: 3, fabricatedCitations: 0 },
    stats: { reflectionRounds: 1, subQuestionCount: 2, corpusSourceCount: 3, webSourceCount: 0 },
    ...overrides,
  };
}

describe('DeepResearchReportView verification line (G9 guards)', () => {
  it('shows the green verified line when citations checked out', () => {
    render(<DeepResearchReportView report={makeReport()} />);
    expect(screen.getByTestId('deep-research-verification')).toHaveTextContent(
      'Citations verified: 3/3',
    );
  });

  it('does not claim verification when zero citations were checked', () => {
    render(
      <DeepResearchReportView
        report={makeReport({
          verification: { checkedCitations: 0, groundedCitations: 0, fabricatedCitations: 0 },
        })}
      />,
    );
    const line = screen.getByTestId('deep-research-verification');
    expect(line).toHaveTextContent(/no citations to verify/i);
    expect(line).not.toHaveTextContent(/verified: 0\/0/i);
  });

  it('omits the line entirely when verification is absent', () => {
    render(<DeepResearchReportView report={makeReport({ verification: null })} />);
    expect(screen.queryByTestId('deep-research-verification')).not.toBeInTheDocument();
  });
});

describe('DeepResearchReportView anchor scheme guard (G9)', () => {
  it('renders http(s) markdown links as anchors', () => {
    render(
      <DeepResearchReportView
        report={makeReport({ reportMarkdown: 'See [Policy 8C](https://medicaid.ncdhhs.gov/8c).' })}
      />,
    );
    const link = screen.getByRole('link', { name: 'Policy 8C' });
    expect(link).toHaveAttribute('href', 'https://medicaid.ncdhhs.gov/8c');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('degrades non-http(s) links to plain text', () => {
    render(
      <DeepResearchReportView
        report={makeReport({ reportMarkdown: 'Click [here](javascript:alert(1)) now.' })}
      />,
    );
    expect(screen.queryByRole('link', { name: 'here' })).not.toBeInTheDocument();
    expect(screen.getByText('here')).toBeInTheDocument();
  });
});
