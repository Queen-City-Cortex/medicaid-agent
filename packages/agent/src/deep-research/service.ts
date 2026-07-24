import {
  ResearchPlanSchema,
  ResearchReportSchema,
  type ResearchDecisionInput,
  type ResearchPlan,
} from '@nc-medicaid/contracts';
import { log, errorFields } from '../logger.js';
import { ResearchRepository } from './repository.js';
import type { UsageRepository } from '../usage/repository.js';
import { withResearchUsageContext } from './usage.js';

interface WorkflowResultLike {
  status?: string;
  suspendPayload?: Record<string, unknown>;
  steps?: Record<string, { suspendPayload?: unknown }>;
  result?: unknown;
}

interface WorkflowRunLike {
  runId: string;
  start(args: { inputData: { question: string } }): Promise<WorkflowResultLike>;
  resume(args: { step: string; resumeData: ResearchDecisionInput }): Promise<WorkflowResultLike>;
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
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 6) {
      throw new Error('DEEP_RESEARCH_SERVICE_CONCURRENCY must be an integer between 1 and 6');
    }
  }

  private schedulePlanning(runId: string, mastra: ResearchMastra): void {
    if (this.retryTimers.has(runId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(runId);
      void this.plan(runId, mastra);
    }, 5_000);
    timer.unref?.();
    this.retryTimers.set(runId, timer);
  }

  private async sweepRecovery(mastra: ResearchMastra): Promise<void> {
    const expired = await this.repository.failExpiredLeases();
    if (expired) log.warn('deep_research.expired_leases_failed', { count: expired });
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
    const leaseOwner = `${this.instanceId}:plan:${runId}`;
    const acquired = await this.repository.acquire(
      runId,
      'queued',
      'planning',
      leaseOwner,
      this.maxConcurrent,
    );
    if (!acquired) {
      if ((await this.repository.getInternal(runId))?.state === 'queued') {
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
        () => this.usageRepository
          ? withResearchUsageContext(
              { repository: this.usageRepository, userId: current.resourceId, runId },
              start,
            )
          : start(),
        () => workflowRun.cancel(),
      );
      const plan = extractPlan(result);
      if (result.status !== 'suspended' || !plan) {
        throw new Error(`Research planning did not suspend for approval (status ${result.status ?? 'unknown'})`);
      }
      if (!await this.repository.awaitingApproval(runId, plan, leaseOwner)) {
        await workflowRun.cancel();
      }
    } catch (error) {
      log.error('deep_research.plan_failed', { runId, ...errorFields(error) });
      await this.repository.fail(runId, error, leaseOwner);
    }
  }

  async decide(
    runId: string,
    resourceId: string,
    decision: ResearchDecisionInput,
    mastra: ResearchMastra,
  ): Promise<'accepted' | 'not_found' | 'conflict'> {
    const owned = await this.repository.get(runId, resourceId);
    if (!owned) return 'not_found';
    if (owned.state !== 'awaiting_approval') return 'conflict';
    const internal = await this.repository.getInternal(runId);
    if (!internal?.workflowRunId) return 'conflict';
    const workflowRun = await mastra.getWorkflow('deepResearchWorkflow').createRun({
      runId: internal.workflowRunId,
      resourceId: runId,
    });

    if (!decision.approved) {
      await this.repository.cancel(runId, resourceId);
      try {
        await workflowRun.cancel();
      } catch (error) {
        log.warn('deep_research.cancel_workflow_failed', { runId, ...errorFields(error) });
      }
      return 'accepted';
    }

    const leaseOwner = `${this.instanceId}:research:${runId}`;
    if (!await this.repository.acquire(
      runId,
      'awaiting_approval',
      'researching',
      leaseOwner,
      this.maxConcurrent,
    )) return 'conflict';

    void (async () => {
      try {
        const resume = () => workflowRun.resume({ step: 'plan-approval', resumeData: decision });
        const result = await this.withLeaseHeartbeat(
          runId,
          leaseOwner,
          () => this.usageRepository
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
            : resume(),
          () => workflowRun.cancel(),
        );
        if (result.status !== 'success') {
          throw new Error(`Research workflow ended with status ${result.status ?? 'unknown'}`);
        }
        const report = ResearchReportSchema.parse(result.result);
        await this.repository.complete(runId, report, leaseOwner);
      } catch (error) {
        log.error('deep_research.run_failed', { runId, ...errorFields(error) });
        await this.repository.fail(runId, error, leaseOwner);
      }
    })();
    return 'accepted';
  }

  async cancel(runId: string, resourceId: string, mastra: ResearchMastra): Promise<boolean> {
    const internal = await this.repository.getInternal(runId);
    if (!internal || !(await this.repository.get(runId, resourceId))) return false;
    const priorState = internal.state;
    const cancelled = await this.repository.cancel(runId, resourceId);
    if (!cancelled || cancelled.state !== 'cancelled' || priorState === 'cancelled') return false;
    if (internal.workflowRunId) {
      try {
        const workflowRun = await mastra.getWorkflow('deepResearchWorkflow').createRun({
          runId: internal.workflowRunId,
          resourceId: runId,
        });
        await workflowRun.cancel();
      } catch (error) {
        log.warn('deep_research.cancel_workflow_failed', { runId, ...errorFields(error) });
      }
    }
    return true;
  }
}
