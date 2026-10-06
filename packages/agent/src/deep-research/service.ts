import { isValidatedJevRelease, jevCorpusIdentity } from '@nc-medicaid/policy-corpus';
import { withResearchCheckpoints, DEFAULT_RESEARCH_LIMITS } from './checkpoints.js';
import { withSession } from '../neo4j.js';

async function currentCorpusRelease(): Promise<string | null> {
  return withSession(async session => {
    const result = await session.run("OPTIONAL MATCH (r:CorpusRelease {id: 'current'}) OPTIONAL MATCH (m:JevAnnotation {id: 'current'}) RETURN r.release_id AS releaseId, r.jev_annotation_digest AS annotationDigest, m.digest AS liveAnnotationDigest");
    const record = result.records[0];
    const releaseId = record?.get('releaseId') ?? null;
    const annotationDigest = record?.get('annotationDigest') ?? null;
    if (process.env.JEV_SECTION_ROLES_ENABLED === 'true'
      && !isValidatedJevRelease(releaseId, annotationDigest, record?.get('liveAnnotationDigest'))) return null;
    return jevCorpusIdentity(releaseId, annotationDigest);
  });
}
import {
  ResearchPlanSchema,
  ResearchReportSchema,
  type ResearchDecisionInput,
  type ResearchPlan,
} from '@nc-medicaid/contracts';
import { log, errorFields } from '../logger.js';
import { ResearchRepository } from './repository.js';
import type { ResearchApproval } from './schemas.js';
import type { UsageRepository } from '../usage/repository.js';
import { withResearchUsageContext } from './usage.js';

interface WorkflowResultLike {
  status?: string;
  suspendPayload?: Record<string, unknown>;
  steps?: Record<string, { suspendPayload?: unknown }>;
  result?: unknown;
  error?: unknown;
}

interface WorkflowRunLike {
  runId: string;
  start(args: { inputData: { question: string } }): Promise<WorkflowResultLike>;
  resume(args: { step: string; resumeData: ResearchApproval }): Promise<WorkflowResultLike>;
  cancel(): Promise<void>;
}

interface WorkflowLike {
  createRun(options?: { runId?: string; resourceId?: string }): Promise<WorkflowRunLike>;
}

export interface ResearchMastra {
  getWorkflow(id: 'deepResearchWorkflow'): WorkflowLike;
}

function extractPlan(result: WorkflowResultLike): ResearchPlan | null {
  const candidates = [
    result.suspendPayload?.['plan-approval'],
    result.steps?.['plan-approval']?.suspendPayload,
    result.suspendPayload,
  ];
  for (const candidate of candidates) {
    const parsed = ResearchPlanSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export class ResearchService {
  private static readonly LEASE_HEARTBEAT_MS = 60_000;
  private static readonly RECOVERY_SWEEP_MS = 60_000;
  private readonly instanceId = crypto.randomUUID();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly repository: ResearchRepository,
    readonly maxConcurrent = 2,
    readonly usageRepository?: UsageRepository,
    private readonly getCorpusRelease: () => Promise<string | null> = currentCorpusRelease,
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 6) {
      throw new Error('DEEP_RESEARCH_SERVICE_CONCURRENCY must be an integer between 1 and 6');
    }
  }

  private schedulePlanning(runId: string, mastra: ResearchMastra, delayMs = 5_000): void {
    if (this.retryTimers.has(runId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(runId);
      void this.plan(runId, mastra);
    }, delayMs);
    timer.unref?.();
    this.retryTimers.set(runId, timer);
  }

  private async handleFailure(runId: string, error: unknown, leaseOwner: string, mastra: ResearchMastra): Promise<void> {
    await this.repository.failOrRetry(runId, error, leaseOwner);
    const run = await this.repository.getInternal(runId);
    if (run?.state === 'recovering' && run.nextRetryAt) {
      this.schedulePlanning(runId, mastra, Math.max(0, Date.parse(run.nextRetryAt) - Date.now()));
    }
  }

  /** Best-effort: the run row is already cancelled. A failure leaves the run's
   *  workflow id in place, which is what makes the recovery sweep try again. */
  private async cancelWorkflow(runId: string, workflowRunId: string, mastra: ResearchMastra): Promise<void> {
    try {
      const workflowRun = await mastra.getWorkflow('deepResearchWorkflow').createRun({
        runId: workflowRunId,
        resourceId: runId,
      });
      await workflowRun.cancel();
      await this.repository.workflowCancelled(runId);
    } catch (error) {
      log.warn('deep_research.cancel_workflow_failed', { runId, ...errorFields(error) });
    }
  }

  private async sweepRecovery(mastra: ResearchMastra): Promise<void> {
    const expired = await this.repository.recoverExpiredLeases();
    if (expired) log.warn('deep_research.expired_leases_recovering', { count: expired });
    const abandoned = await this.repository.expireAwaitingApproval();
    if (abandoned.length) log.info('deep_research.abandoned_plans_cancelled', { count: abandoned.length });
    // Covers the plans expired just now and any earlier cancel, from this sweep,
    // a decline or a user cancel, whose workflow could not be cancelled then.
    for (const { runId, workflowRunId } of await this.repository.pendingWorkflowCancels()) {
      await this.cancelWorkflow(runId, workflowRunId, mastra);
    }
    for (const runId of await this.repository.listQueued()) {
      this.schedulePlanning(runId, mastra);
    }
  }

  async recover(mastra: ResearchMastra): Promise<void> {
    await this.sweepRecovery(mastra);
    if (this.recoveryTimer) return;
    this.recoveryTimer = setInterval(() => {
      void this.sweepRecovery(mastra).catch((error) => {
        log.error('deep_research.recovery_sweep_failed', errorFields(error));
      });
    }, ResearchService.RECOVERY_SWEEP_MS);
    this.recoveryTimer.unref?.();
  }

  private async withLeaseHeartbeat<T>(
    runId: string,
    leaseOwner: string,
    work: () => Promise<T>,
    cancelWork: () => Promise<void>,
  ): Promise<T> {
    let stopped = false;
    let renewing = false;
    let rejectLease!: (error: Error) => void;
    const leaseLost = new Promise<never>((_, reject) => {
      rejectLease = reject;
    });
    const loseLease = async (cause: unknown): Promise<void> => {
      if (stopped) return;
      stopped = true;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      log.error('deep_research.lease_lost', { runId, ...errorFields(error) });
      rejectLease(error);
      try {
        await cancelWork();
      } catch (cancelError) {
        log.warn('deep_research.cancel_after_lease_loss_failed', {
          runId,
          ...errorFields(cancelError),
        });
      }
    };
    const timer = setInterval(() => {
      if (stopped || renewing) return;
      renewing = true;
      void this.repository.renewLease(runId, leaseOwner)
        .then((renewed) => {
          if (!renewed) return loseLease(new Error('Research execution lease was lost'));
        })
        .catch(loseLease)
        .finally(() => {
          renewing = false;
        });
    }, ResearchService.LEASE_HEARTBEAT_MS);
    timer.unref?.();
    try {
      return await Promise.race([work(), leaseLost]);
    } finally {
      stopped = true;
      clearInterval(timer);
    }
  }

  async plan(runId: string, mastra: ResearchMastra): Promise<void> {
    const pending = await this.repository.getInternal(runId);
    if (!pending || !['queued', 'recovering'].includes(pending.state)) return;
    const leaseOwner = `${this.instanceId}:plan:${runId}:${crypto.randomUUID()}`;
    const acquired = await this.repository.acquire(
      runId,
      pending.state,
      pending.approval ? 'researching' : 'planning',
      leaseOwner,
      this.maxConcurrent,
    );
    if (!acquired) {
      if (['queued', 'recovering'].includes((await this.repository.getInternal(runId))?.state ?? '')) {
        this.schedulePlanning(runId, mastra);
      }
      return;
    }

    try {
      const current = await this.repository.getInternal(runId);
      if (!current) return;
      const workflowRun = await mastra
        .getWorkflow('deepResearchWorkflow')
        .createRun({ resourceId: runId });
      if (!await this.repository.attachWorkflow(runId, workflowRun.runId, leaseOwner)) {
        await workflowRun.cancel();
        return;
      }
      const start = () => workflowRun.start({ inputData: { question: current.question } });
      const result = await this.withLeaseHeartbeat(
        runId,
        leaseOwner,
        () => this.withCheckpoints(runId, leaseOwner, () => this.usageRepository
          ? withResearchUsageContext(
              { repository: this.usageRepository, userId: current.resourceId, runId, stateRepository: this.repository, leaseOwner },
              start,
            )
          : start()),
        () => workflowRun.cancel(),
      );
      if (current.approval) {
        if (result.status !== 'success') throw result.error ?? new Error('Research recovery did not complete');
        await this.repository.complete(runId, ResearchReportSchema.parse(result.result), leaseOwner);
        return;
      }
      if (result.error) throw result.error;
      const plan = extractPlan(result);
      if (result.status !== 'suspended' || !plan) {
        throw new Error(`Research planning did not suspend for approval (status ${result.status ?? 'unknown'})`);
      }
      if (!await this.repository.awaitingApproval(runId, plan, leaseOwner)) {
        await workflowRun.cancel();
      }
    } catch (error) {
      log.error('deep_research.plan_failed', { runId, ...errorFields(error) });
      await this.handleFailure(runId, error, leaseOwner, mastra);
    }
  }

  async decide(
    runId: string,
    resourceId: string,
    decision: ResearchDecisionInput,
    mastra: ResearchMastra,
  ): Promise<'accepted' | 'not_found' | 'conflict' | 'invalid'> {
    const owned = await this.repository.get(runId, resourceId);
    if (!owned) return 'not_found';
    if (owned.state !== 'awaiting_approval') return 'conflict';
    const internal = await this.repository.getInternal(runId);
    if (!internal?.workflowRunId) return 'conflict';
    // Approval is prune-only. Before approval the public plan is exactly the
    // stored planner output, so the kept positions resolve to the planner's
    // own questions; the request supplies no question text.
    const proposed = owned.plan?.subQuestions ?? [];
    const kept = decision.keptSubQuestions ?? proposed.map((_, index) => index);
    if (decision.approved && (!kept.length || kept.some(index => index >= proposed.length))) return 'invalid';
    if (!decision.approved) {
      await this.repository.cancel(runId, resourceId);
      await this.cancelWorkflow(runId, internal.workflowRunId, mastra);
      return 'accepted';
    }
    const workflowRun = await mastra.getWorkflow('deepResearchWorkflow').createRun({
      runId: internal.workflowRunId,
      resourceId: runId,
    });

    // Store the actual approved questions even when the user removed none.
    // Recovery must never substitute a newly generated plan for this decision.
    const approvedDecision: ResearchApproval = { approved: true,
      editedSubQuestions: kept.map(index => proposed[index])
        .slice(0, internal.limits?.maxSubQuestions ?? DEFAULT_RESEARCH_LIMITS.maxSubQuestions) };

    const leaseOwner = `${this.instanceId}:research:${runId}`;
    if (!await this.repository.acquire(
      runId,
      'awaiting_approval',
      'researching',
      leaseOwner,
      this.maxConcurrent,
      Date.now(),
      approvedDecision,
    )) return 'conflict';

    void (async () => {
      try {
        const resume = () => workflowRun.resume({ step: 'plan-approval', resumeData: approvedDecision });
        const result = await this.withLeaseHeartbeat(
          runId,
          leaseOwner,
          () => this.withCheckpoints(runId, leaseOwner, () => this.usageRepository
            ? withResearchUsageContext(
                {
                  repository: this.usageRepository,
                  userId: resourceId,
                  runId,
                  stateRepository: this.repository,
                  leaseOwner,
                },
                resume,
              )
            : resume()),
          () => workflowRun.cancel(),
        );
        if (result.status !== 'success') {
          throw result.error ?? new Error(`Research workflow ended with status ${result.status ?? 'unknown'}`);
        }
        const report = ResearchReportSchema.parse(result.result);
        await this.repository.complete(runId, report, leaseOwner);
      } catch (error) {
        log.error('deep_research.run_failed', { runId, ...errorFields(error) });
        await this.handleFailure(runId, error, leaseOwner, mastra);
      }
    })();
    return 'accepted';
  }

  private async withCheckpoints<T>(runId: string, owner: string, work: () => Promise<T>): Promise<T> {
    const release = await this.getCorpusRelease();
    await this.repository.initializeCheckpointRun(runId, owner, DEFAULT_RESEARCH_LIMITS, release);
    const current = await this.repository.getInternal(runId);
    if (!current || current.checkpointVersion !== 1) throw new Error('Incompatible research checkpoint; start a new run');
    if (current.corpusRelease !== release) throw new Error('Corpus release changed; start a new research run');
    if (current.recoveryCount > 0 && release === null) throw new Error('Corpus release cannot be identified; start a new research run');
    if (current.recoveryCount > 0 && current.approval && await this.repository.checkpoint(runId, 'plan') === undefined) {
      throw new Error('Incompatible research checkpoint: approved plan is missing; start a new run');
    }
    const result = await withResearchCheckpoints({ repository: this.repository, runId, owner,
      approval: current.approval, limits: current.limits as typeof DEFAULT_RESEARCH_LIMITS,
      assertCorpus: async () => {
        if (await this.getCorpusRelease() !== release) throw new Error('Corpus release changed; start a new research run');
      },
    }, work);
    if (await this.getCorpusRelease() !== release) throw new Error('Corpus release changed; start a new research run');
    return result;
  }

  dispose(): void {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }

  async cancel(runId: string, resourceId: string, mastra: ResearchMastra): Promise<boolean> {
    const internal = await this.repository.getInternal(runId);
    if (!internal || !(await this.repository.get(runId, resourceId))) return false;
    const priorState = internal.state;
    clearTimeout(this.retryTimers.get(runId));
    this.retryTimers.delete(runId);
    const cancelled = await this.repository.cancel(runId, resourceId);
    if (!cancelled || cancelled.state !== 'cancelled' || priorState === 'cancelled') return false;
    if (internal.workflowRunId) await this.cancelWorkflow(runId, internal.workflowRunId, mastra);
    return true;
  }
}
