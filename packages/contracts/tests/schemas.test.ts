import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_RETENTION_DAYS,
  FEEDBACK_RETENTION_DAYS,
  FeedbackInputSchema,
  RATE_LIMIT_RETENTION_HOURS,
  ReleaseManifestSchema,
  ResearchDecisionInputSchema,
  ResearchStartInputSchema,
  USAGE_RETENTION_DAYS,
} from '../src/index.js';

describe('public contracts', () => {
  // The privacy page and the runbook state these periods; changing one is a policy decision, not a tuning change.
  it('fixes the retention periods the privacy policy states', () => {
    expect({ CONVERSATION_RETENTION_DAYS, FEEDBACK_RETENTION_DAYS, USAGE_RETENTION_DAYS, RATE_LIMIT_RETENTION_HOURS })
      .toEqual({ CONVERSATION_RETENTION_DAYS: 90, FEEDBACK_RETENTION_DAYS: 180, USAGE_RETENTION_DAYS: 400, RATE_LIMIT_RETENTION_HOURS: 25 });
  });

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

  it('lets a research decision only name proposed sub-questions to keep', () => {
    const accepts = (input: unknown) => ResearchDecisionInputSchema.safeParse(input).success;
    expect(accepts({ approved: true })).toBe(true);
    expect(accepts({ approved: false })).toBe(true);
    expect(accepts({ approved: true, keptSubQuestions: [2, 0] })).toBe(true);
    expect(accepts({ approved: true, keptSubQuestions: [] })).toBe(false);
    expect(accepts({ approved: true, keptSubQuestions: [1, 1] })).toBe(false);
    expect(accepts({ approved: true, keptSubQuestions: [-1] })).toBe(false);
    expect(accepts({ approved: true, keptSubQuestions: [0.5] })).toBe(false);
    expect(accepts({ approved: true, keptSubQuestions: [8] })).toBe(false);
    expect(accepts({ approved: true, keptSubQuestions: ['Question?'] })).toBe(false);
    expect(accepts({
      approved: true,
      editedSubQuestions: [{ question: 'Question?', rationale: 'Needed', channels: ['keyword'], useWeb: false }],
    })).toBe(false);
  });

  it('validates durable corpus release stage results', () => {
    const manifest = ReleaseManifestSchema.parse({
      schemaVersion: 1,
      releaseId: '20260725T220000Z-abcdef1',
      commitSha: 'abcdef1',
      targetColor: 'green',
      previousReleaseId: null,
      sourceSnapshotHash: `sha256:${'a'.repeat(64)}`,
      embeddingModel: 'voyage-4',
      embeddingDimensions: 1024,
      counts: {},
      auditResults: {},
      evaluationResults: {},
      gates: [],
      stageResults: {
        parse: {
          status: 'passed',
          attempt: 1,
          startedAt: '2026-07-25T22:00:00.000Z',
          finishedAt: '2026-07-25T22:01:00.000Z',
          result: { parsed: 3 },
          error: null,
        },
      },
      events: [],
      promotionState: 'building',
      createdAt: '2026-07-25T22:00:00.000Z',
      validatedAt: null,
      promotedAt: null,
      rolledBackAt: null,
      rollbackWindowEndsAt: null,
      volumeRetainUntil: null,
    });

    expect(manifest.releaseId).toBe('20260725T220000Z-abcdef1');
  });
});
