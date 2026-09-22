import { isRetryableResearchError } from './recovery-errors.js';
import { log } from '../logger.js';
import {
  ResearchDecisionInputSchema,
  VerificationOutcomeSchema,
  type ResearchDecisionInput,
  type VerificationOutcome,
  ResearchPlanSchema,
  ResearchReportSchema,
  ResearchRunSchema,
  type ResearchPlan,
  type ResearchReport,
  type ResearchRun,
  type ResearchRunState,
} from '@nc-medicaid/contracts';
import type { Row } from '@libsql/client';
import type { AppDatabase } from '../storage/app-database.js';

const ACTIVE_STATES: readonly ResearchRunState[] = [
  'recovering',
  'queued',
  'planning',
  'awaiting_approval',
  'researching',
  'verifying',
];
const DAY_MS = 86_400_000;
const LEASE_MS = 15 * 60_000;
const RUN_SELECT = `SELECT research_runs.*,
  (SELECT COUNT(*) FROM research_checkpoints WHERE run_id = research_runs.id AND key GLOB 'worker:*' AND key NOT LIKE '%:draft' AND key NOT LIKE '%:verification:%') AS completed_questions,
  (SELECT COUNT(*) FROM research_checkpoints WHERE run_id = research_runs.id) AS checkpoint_count
  FROM research_runs`;

export interface InternalResearchRun extends ResearchRun {
  approval: ResearchDecisionInput | null;
  limits: Record<string, number> | null;
  corpusRelease: string | null;
  checkpointVersion: number;
  resourceId: string;
  workflowRunId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
}

export type ResearchStartRejectionReason = 'active_run' | 'daily_quota';

export class ResearchStartRejectedError extends Error {
  constructor(readonly reason: ResearchStartRejectionReason) {
    super(reason === 'active_run'
      ? 'Only one active research run is allowed'
      : 'The daily research-run limit has been reached');
    this.name = 'ResearchStartRejectedError';
  }
}

function parseJson<T>(
  value: unknown,
  schema: { parse(input: unknown): T },
): T | null {
  if (typeof value !== 'string') return null;
  return schema.parse(JSON.parse(value));
}

function toRun(row: Row): ResearchRun {
  const report = parseJson(row.report_json, ResearchReportSchema);
  const plan = parseJson(row.plan_json, ResearchPlanSchema);
  const approval = parseJson(row.approval_json, ResearchDecisionInputSchema);
  const legacy = row.state === 'completed' && report && !report.verification;
  return ResearchRunSchema.parse({
    recoveryProgress: { completedQuestions: Number(row.completed_questions ?? 0), checkpoints: Number(row.checkpoint_count ?? 0) },
    recoveryCount: row.recovery_count ?? 0,
    nextRetryAt: typeof row.next_retry_at === 'number' ? new Date(row.next_retry_at).toISOString() : null,
    verification: parseJson(row.verification_json, VerificationOutcomeSchema),
    sources: typeof row.sources_json === 'string' ? JSON.parse(row.sources_json) : [],
    runId: row.id,
    state: legacy ? 'failed' : row.state,
    question: row.question,
    plan: plan && approval?.editedSubQuestions ? { ...plan, subQuestions: approval.editedSubQuestions } : plan,
    report: row.state === 'completed' && report?.verification && report.verification.status !== 'withheld' ? report : null,
    error: legacy ? 'This previous report was not verified before release. Please start a new run.' : row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toInternalRun(row: Row): InternalResearchRun {
  return {
    ...toRun(row),
    approval: parseJson(row.approval_json, ResearchDecisionInputSchema),
    limits: typeof row.limits_json === 'string' ? JSON.parse(row.limits_json) : null,
    corpusRelease: typeof row.corpus_release === 'string' ? row.corpus_release : null,
    checkpointVersion: Number(row.checkpoint_version),
    resourceId: String(row.resource_id),
    workflowRunId: typeof row.workflow_run_id === 'string' ? row.workflow_run_id : null,
    leaseOwner: typeof row.lease_owner === 'string' ? row.lease_owner : null,
    leaseExpiresAt: typeof row.lease_expires_at === 'number' ? row.lease_expires_at : null,
  };
}

export class ResearchRepository {
  constructor(private readonly database: AppDatabase) {}

  async create(
    runId: string,
    resourceId: string,
    question: string,
    now = Date.now(),
  ): Promise<ResearchRun> {
    await this.database.migrate();
    const timestamp = new Date(now).toISOString();
    const dayCutoff = new Date(now - DAY_MS).toISOString();
    const activePlaceholders = ACTIVE_STATES.map(() => '?').join(', ');
    const result = await this.database.client.execute({
      sql: `INSERT INTO research_runs
              (id, resource_id, state, question, created_at, updated_at)
            SELECT ?, ?, 'queued', ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM research_runs
              WHERE resource_id = ? AND state IN (${activePlaceholders})
            )
            AND (
              SELECT COUNT(*) FROM research_runs
              WHERE resource_id = ? AND created_at > ?
            ) < 2
            RETURNING *`,
      args: [
        runId,
        resourceId,
        question,
        timestamp,
        timestamp,
        resourceId,
        ...ACTIVE_STATES,
        resourceId,
        dayCutoff,
      ],
    });
    const row = result.rows[0];
    if (row) return toRun(row);

    const active = await this.database.client.execute({
      sql: `SELECT 1 FROM research_runs
            WHERE resource_id = ? AND state IN (${activePlaceholders})
            LIMIT 1`,
      args: [resourceId, ...ACTIVE_STATES],
    });
    throw new ResearchStartRejectedError(active.rows.length > 0 ? 'active_run' : 'daily_quota');
  }

  async get(runId: string, resourceId: string): Promise<ResearchRun | null> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `${RUN_SELECT} WHERE id = ? AND resource_id = ?`,
      args: [runId, resourceId],
    });
    return result.rows[0] ? toRun(result.rows[0]) : null;
  }

  async getInternal(runId: string): Promise<InternalResearchRun | null> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `${RUN_SELECT} WHERE id = ?`,
      args: [runId],
    });
    return result.rows[0] ? toInternalRun(result.rows[0]) : null;
  }

  async listQueued(): Promise<string[]> {
    await this.database.migrate();
    const result = await this.database.client.execute(
      `SELECT id FROM research_runs WHERE state = 'queued' OR (state = 'recovering' AND next_retry_at <= ${Date.now()}) ORDER BY created_at`,
    );
    return result.rows.map((row) => String(row.id));
  }

  async acquire(
    runId: string,
    fromState: ResearchRunState,
    toState: 'planning' | 'researching' | 'verifying',
    leaseOwner: string,
    maxConcurrent: number,
    now = Date.now(),
    approval?: ResearchDecisionInput,
  ): Promise<boolean> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?,
                approval_json = COALESCE(?, approval_json),
                recovery_count = recovery_count + CASE WHEN state = 'recovering' THEN 1 ELSE 0 END,
                next_retry_at = NULL
            WHERE id = ? AND state = ?
              AND (state != 'recovering' OR (recovery_count < 2 AND next_retry_at <= ?))
              AND (
                SELECT COUNT(*) FROM research_runs
                WHERE state IN ('planning', 'researching', 'verifying')
                  AND lease_expires_at > ?
              ) < ?
            RETURNING id, recovery_count`,
      args: [
        toState,
        leaseOwner,
        now + LEASE_MS,
        new Date(now).toISOString(),
        approval ? JSON.stringify(approval) : null,
        runId,
        fromState,
        now,
        now,
        maxConcurrent,
      ],
    });
    if (result.rows[0] && fromState === 'recovering') log.info('deep_research.recovery_claimed', { runId, attempt: result.rows[0].recovery_count });
    return result.rows.length === 1;
  }

  async attachWorkflow(runId: string, workflowRunId: string, leaseOwner: string): Promise<boolean> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs SET workflow_run_id = ?
            WHERE id = ? AND lease_owner = ? AND state IN ('planning', 'researching', 'verifying') AND lease_expires_at > ${Date.now()}
            RETURNING id`,
      args: [workflowRunId, runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async renewLease(runId: string, leaseOwner: string, now = Date.now()): Promise<boolean> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET lease_expires_at = ?, updated_at = ?
            WHERE id = ?
              AND lease_owner = ? AND lease_expires_at > ${now}
              AND state IN ('planning', 'researching', 'verifying')
            RETURNING id`,
      args: [now + LEASE_MS, new Date(now).toISOString(), runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async cancel(runId: string, resourceId: string, now = Date.now()): Promise<ResearchRun | null> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'cancelled',
                next_retry_at = NULL,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND resource_id = ?
              AND state IN ('queued', 'planning', 'awaiting_approval', 'researching', 'verifying', 'recovering')
            RETURNING *`,
      args: [new Date(now).toISOString(), runId, resourceId],
    });
    if (result.rows[0]) return toRun(result.rows[0]);
    return this.get(runId, resourceId);
  }

  async awaitingApproval(
    runId: string,
    plan: ResearchPlan,
    leaseOwner: string,
    now = Date.now(),
  ): Promise<boolean> {
    const parsed = ResearchPlanSchema.parse(plan);
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'awaiting_approval',
                plan_json = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND state = 'planning' AND lease_owner = ? AND lease_expires_at > ${now}
            RETURNING id`,
      args: [JSON.stringify(parsed), new Date(now).toISOString(), runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async markVerifying(runId: string, leaseOwner: string, now = Date.now()): Promise<boolean> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'verifying', updated_at = ?
            WHERE id = ? AND state = 'researching' AND lease_owner = ? AND lease_expires_at > ${now}
            RETURNING id`,
      args: [new Date(now).toISOString(), runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async complete(
    runId: string,
    report: ResearchReport,
    leaseOwner: string,
    now = Date.now(),
  ): Promise<boolean> {
    const parsed = ResearchReportSchema.parse(report);
    if (!parsed.verification || parsed.verification.status === 'withheld') throw new Error('Unverified research report cannot be released');
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'completed',
                report_json = ?,
                error = NULL,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND state IN ('researching', 'verifying') AND lease_owner = ? AND lease_expires_at > ${now}
            RETURNING id`,
      args: [JSON.stringify(parsed), new Date(now).toISOString(), runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async fail(
    runId: string,
    error: unknown,
    leaseOwner?: string,
    now = Date.now(),
  ): Promise<boolean> {
    const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    const message = /^(Corpus release|Incompatible research checkpoint|Research (step budget|execution lease|recovery attempts)|Answer grounding failed|Verification service unavailable)/.test(detail)
      ? detail : 'Research could not be completed. Please start a new run.';
    const leaseClause = leaseOwner ? ` AND lease_owner = ? AND lease_expires_at > ${now}` : '';
    const category = /corpus/i.test(detail) ? 'corpus_changed' : /checkpoint/i.test(detail) ? 'checkpoint_incompatible'
      : /budget/i.test(detail) ? 'budget_exhausted' : /grounding/i.test(detail) ? 'grounding_failed'
      : /recovery attempts/i.test(detail) ? 'recovery_exhausted' : /auth|api.?key|credential|config|401|403/i.test(detail) ? 'configuration' : 'execution_failed';
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'failed',
                error = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND state NOT IN ('completed', 'cancelled', 'failed')${leaseClause}
            RETURNING id`,
      args: [
        message.slice(0, 2_000),
        new Date(now).toISOString(),
        runId,
        ...(leaseOwner ? [leaseOwner] : []),
      ],
    });
    if (result.rows.length) log.warn('deep_research.terminal_failure', { runId, category });
    return result.rows.length === 1;
  }

  async recoverExpiredLeases(now = Date.now()): Promise<number> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = CASE WHEN recovery_count < 2 THEN 'recovering' ELSE 'failed' END,
                next_retry_at = CASE WHEN recovery_count < 2 THEN ${now} ELSE NULL END,
                error = 'Research execution was interrupted; recovery attempts are bounded at two',
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE state IN ('planning', 'researching', 'verifying')
              AND lease_expires_at <= ?
            RETURNING id`,
      args: [new Date(now).toISOString(), now],
    });
    return result.rows.length;
  }

  async initializeCheckpointRun(runId: string, owner: string, limits: Record<string, number>, corpusRelease: string | null): Promise<void> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs SET limits_json = COALESCE(limits_json, ?), corpus_release = CASE WHEN limits_json IS NULL THEN ? ELSE corpus_release END
        WHERE id = ? AND lease_owner = ? AND lease_expires_at > ? RETURNING id`,
      args: [JSON.stringify(limits), corpusRelease, runId, owner, Date.now()],
    });
    if (!result.rows.length) throw new Error('Research execution lease was lost');
  }

  async checkpoint<T>(runId: string, key: string): Promise<T | undefined> {
    const result = await this.database.client.execute({ sql: 'SELECT value_json, version FROM research_checkpoints WHERE run_id = ? AND key = ?', args: [runId, key] });
    const row = result.rows[0];
    if (!row) return undefined;
    if (row.version !== 1) throw new Error('Incompatible research checkpoint; start a new run');
    return JSON.parse(String(row.value_json)) as T;
  }

  async saveCheckpoint(runId: string, owner: string, key: string, value: unknown): Promise<void> {
    const result = await this.database.client.execute({
      sql: `INSERT INTO research_checkpoints (run_id, key, value_json, version)
        SELECT id, ?, ?, 1 FROM research_runs WHERE id = ? AND lease_owner = ? AND lease_expires_at > ?
        AND state IN ('planning', 'researching', 'verifying')
        ON CONFLICT(run_id, key) DO UPDATE SET value_json = excluded.value_json RETURNING run_id`,
      args: [key, JSON.stringify(value), runId, owner, Date.now()],
    });
    if (!result.rows.length) throw new Error('Research execution lease was lost');
  }

  async reserveStep(runId: string, owner: string, key: string, limit: number): Promise<void> {
    const result = await this.database.client.execute({
      sql: `INSERT INTO research_budgets (run_id, key, used, limit_value)
        SELECT id, ?, 1, ? FROM research_runs WHERE id = ? AND lease_owner = ? AND lease_expires_at > ?
        AND state IN ('planning', 'researching', 'verifying')
        ON CONFLICT(run_id, key) DO UPDATE SET used = used + 1 WHERE used < limit_value RETURNING used`,
      args: [key, limit, runId, owner, Date.now()],
    });
    if (!result.rows.length) throw new Error('Research step budget exhausted or execution lease lost');
  }

  async saveVerification(runId: string, owner: string, outcome: VerificationOutcome, sources: unknown): Promise<void> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs SET verification_json = ?, sources_json = ? WHERE id = ? AND lease_owner = ? AND lease_expires_at > ? RETURNING id`,
      args: [JSON.stringify(outcome), JSON.stringify(sources), runId, owner, Date.now()],
    });
    if (!result.rows.length) throw new Error('Research execution lease was lost');
  }

  async failOrRetry(runId: string, error: unknown, owner: string, now = Date.now()): Promise<void> {
    if (!isRetryableResearchError(error)) { await this.fail(runId, error, owner, now); return; }
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs SET state = 'recovering', error = 'Research was interrupted. Recovering completed work.',
        next_retry_at = ? + CASE WHEN recovery_count = 0 THEN 30000 ELSE 120000 END,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND lease_owner = ? AND lease_expires_at > ? AND recovery_count < 2
        AND state IN ('planning', 'researching', 'verifying') RETURNING id, recovery_count, next_retry_at`,
      args: [now, new Date(now).toISOString(), runId, owner, now],
    });
    if (result.rows[0]) log.info('deep_research.recovery_scheduled', { runId, attemptsUsed: result.rows[0].recovery_count, nextRetryAt: result.rows[0].next_retry_at });
    else await this.fail(runId, new Error('Research recovery attempts exhausted. Please start a new run.'), owner, now);
  }
}
