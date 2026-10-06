import type { VerificationOutcome } from '@nc-medicaid/contracts';
import { log, errorFields } from '../logger.js';
import type { PassFindings, VerifierTelemetry } from '../processors/verifier/run.js';
import type { AppDatabase } from './app-database.js';

/** Token counts of one verifier model call. */
export interface VerifierCallUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

/**
 * What the verifier decided about one chat answer and why. `findings` quote
 * short excerpts of the checked text (claims, unmatched links and quotations),
 * so a row is user data: it has an owner, and retention, account deletion and
 * the orphan sweep in `AppDatabase` all cover the table. It never holds the
 * question, the draft, the model's correction or the evidence text.
 */
export interface AnswerAuditRecord {
  /** The stored assistant message, which is also the id feedback is filed under. */
  messageId: string;
  threadId: string;
  resourceId: string;
  outcome: VerificationOutcome;
  /** Counts, evidence budget figures, verifier model and latency. */
  telemetry: VerifierTelemetry;
  /** One entry per pass, in order. */
  findings: PassFindings[];
  /** One entry per verifier model call, in order. */
  usage: VerifierCallUsage[];
  corpusRelease: string | null;
  agentModel: string;
}

/**
 * Operator-only store of verification records. No route reads it: the findings
 * are model-written text about a draft, which the release gate never sends to
 * a browser. An operator reads it with `sqlite3` on the agent volume (see the
 * runbook's data classification section).
 */
export class AnswerAuditRepository {
  constructor(private readonly database: AppDatabase) {}

  /** Store one answer's record. Never throws: a lost record must not fail a released answer. */
  async record(record: AnswerAuditRecord, now = Date.now()): Promise<void> {
    try {
      await this.database.migrate();
      await this.database.client.execute({
        sql: `INSERT OR REPLACE INTO answer_audit
                (message_id, thread_id, resource_id, outcome_json, telemetry_json, findings_json,
                 usage_json, corpus_release, agent_model, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          record.messageId, record.threadId, record.resourceId,
          JSON.stringify(record.outcome), JSON.stringify(record.telemetry), JSON.stringify(record.findings),
          JSON.stringify(record.usage), record.corpusRelease, record.agentModel, new Date(now).toISOString(),
        ],
      });
    } catch (err) {
      log.warn('answer_audit.record_failed', errorFields(err));
    }
  }
}
