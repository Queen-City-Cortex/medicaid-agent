import { describe, expect, it } from 'vitest';
import {
  FeedbackInputSchema,
  ResearchDecisionInputSchema,
  ResearchStartInputSchema,
} from '../src/index.js';

describe('public contracts', () => {
  it('bounds feedback identifiers and comments', () => {
    expect(FeedbackInputSchema.safeParse({
      messageId: 'm-1',
      threadId: 't-1',
      rating: 'down',
      comment: 'x'.repeat(2_000),
    }).success).toBe(true);
    expect(FeedbackInputSchema.safeParse({
      messageId: 'm-1',
      threadId: 't-1',
      rating: 'down',
      comment: 'x'.repeat(2_001),
    }).success).toBe(false);
  });

  it('does not expose an auto-approval research input', () => {
    const parsed = ResearchStartInputSchema.parse({ question: 'Compare policies', autoApprove: true });
    expect(parsed).toEqual({ question: 'Compare policies' });
  });

  it('bounds edited research plans', () => {
    const item = {
      question: 'Question?',
      rationale: 'Needed',
      channels: ['keyword'] as const,
      useWeb: false,
    };
    expect(ResearchDecisionInputSchema.safeParse({
      approved: true,
      editedSubQuestions: Array.from({ length: 9 }, () => item),
    }).success).toBe(false);
  });
});
