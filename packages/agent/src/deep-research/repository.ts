import {
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
  'queued',
  'planning',
  'awaiting_approval',
  'researching',
  'verifying',
];
const DAY_MS = 86_400_000;
const LEASE_MS = 15 * 60_000;

export interface InternalResearchRun extends ResearchRun {
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
  return ResearchRunSchema.parse({
    runId: row.id,
    state: row.state,
    question: row.question,
    plan: parseJson(row.plan_json, ResearchPlanSchema),
    report: parseJson(row.report_json, ResearchReportSchema),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toInternalRun(row: Row): InternalResearchRun {
  return {
    ...toRun(row),
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
      sql: 'SELECT * FROM research_runs WHERE id = ? AND resource_id = ?',
      args: [runId, resourceId],
    });
    return result.rows[0] ? toRun(result.rows[0]) : null;
  }

  async getInternal(runId: string): Promise<InternalResearchRun | null> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: 'SELECT * FROM research_runs WHERE id = ?',
      args: [runId],
    });
    return result.rows[0] ? toInternalRun(result.rows[0]) : null;
  }

  async listQueued(): Promise<string[]> {
    await this.database.migrate();
    const result = await this.database.client.execute(
      `SELECT id FROM research_runs WHERE state = 'queued' ORDER BY created_at`,
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
  ): Promise<boolean> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
            WHERE id = ? AND state = ?
              AND (
                SELECT COUNT(*) FROM research_runs
                WHERE state IN ('planning', 'researching', 'verifying')
                  AND lease_expires_at > ?
              ) < ?
            RETURNING id`,
      args: [
        toState,
        leaseOwner,
        now + LEASE_MS,
        new Date(now).toISOString(),
        runId,
        fromState,
        now,
        maxConcurrent,
      ],
    });
    return result.rows.length === 1;
  }

  async attachWorkflow(runId: string, workflowRunId: string, leaseOwner: string): Promise<boolean> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs SET workflow_run_id = ?
            WHERE id = ? AND lease_owner = ? AND state = 'planning'
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
              AND lease_owner = ?
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
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND resource_id = ?
              AND state IN ('queued', 'planning', 'awaiting_approval', 'researching', 'verifying')
            RETURNING *`,
      args: [new Date(now).toISOString(), runId, resourceId],
    });
    if (result.rows[0]) return toRun(result.rows[0]);
    return this.get(runId, resourceId);
  }

  async setPlan(
    runId: string,
    plan: ResearchPlan,
    workflowRunId: string,
    now = Date.now(),
  ): Promise<ResearchRun | null> {
    const parsed = ResearchPlanSchema.parse(plan);
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'awaiting_approval',
                plan_json = ?,
                workflow_run_id = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND state = 'planning'
            RETURNING *`,
      args: [JSON.stringify(parsed), workflowRunId, new Date(now).toISOString(), runId],
    });
    return result.rows[0] ? toRun(result.rows[0]) : null;
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
            WHERE id = ? AND state = 'planning' AND lease_owner = ?
            RETURNING id`,
      args: [JSON.stringify(parsed), new Date(now).toISOString(), runId, leaseOwner],
    });
    return result.rows.length === 1;
  }

  async markVerifying(runId: string, leaseOwner: string, now = Date.now()): Promise<boolean> {
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'verifying', updated_at = ?
            WHERE id = ? AND state = 'researching' AND lease_owner = ?
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
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'completed',
                report_json = ?,
                error = NULL,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = ?
            WHERE id = ? AND state IN ('researching', 'verifying') AND lease_owner = ?
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
    const message = error instanceof Error ? error.message : String(error);
    const leaseClause = leaseOwner ? ' AND lease_owner = ?' : '';
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
    return result.rows.length === 1;
  }

  async failExpiredLeases(now = Date.now()): Promise<number> {
    await this.database.migrate();
    const result = await this.database.client.execute({
      sql: `UPDATE research_runs
            SET state = 'failed',
                error = 'Research worker lease expired before completion',
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
}
