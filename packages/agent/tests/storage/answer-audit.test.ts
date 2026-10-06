import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerAuditRepository, type AnswerAuditRecord } from '../../src/storage/answer-audit.js';
import { AppDatabase } from '../../src/storage/app-database.js';
import { log } from '../../src/logger.js';

const RECORD: AnswerAuditRecord = {
  messageId: 'message-1', threadId: 'thread-1', resourceId: 'user-1',
  outcome: { status: 'withheld', reason: 'unsupported', passCount: 2 },
  telemetry: { latency_ms: 1200, pass_count: 2, verifier_model: 'gpt-5.6-terra' } as AnswerAuditRecord['telemetry'],
  findings: [{ pass: 1, unsupportedClaims: [{ claim: 'Covers 40 visits', reason: 'The source says 8' }], missingCitationClaims: [],
    relevanceIssues: [], unknownUrls: [], unknownQuotes: [] }],
  usage: [{ inputTokens: 900, outputTokens: 50 }],
  corpusRelease: 'release-7', agentModel: 'gpt-5.6-terra',
};

describe('AnswerAuditRepository', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    databases.splice(0).forEach(database => database.close());
  });
  function open() {
    const database = new AppDatabase(createClient({ url: ':memory:' }));
    databases.push(database);
    return database;
  }

  it('stores one row per answer, keyed by message id and owned by the user', async () => {
    const database = open();
    const now = Date.parse('2026-10-05T12:00:00Z');
    await new AnswerAuditRepository(database).record(RECORD, now);

    const rows = (await database.client.execute('SELECT * FROM answer_audit')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message_id: 'message-1', thread_id: 'thread-1', resource_id: 'user-1',
      corpus_release: 'release-7', agent_model: 'gpt-5.6-terra', created_at: '2026-10-05T12:00:00.000Z' });
    expect(JSON.parse(String(rows[0].outcome_json))).toEqual(RECORD.outcome);
    expect(JSON.parse(String(rows[0].telemetry_json))).toEqual(RECORD.telemetry);
    expect(JSON.parse(String(rows[0].findings_json))).toEqual(RECORD.findings);
    expect(JSON.parse(String(rows[0].usage_json))).toEqual(RECORD.usage);
    // What the table can hold at all: no column for the question, the draft or the evidence.
    expect(Object.keys(rows[0]).sort()).toEqual(['agent_model', 'corpus_release', 'created_at', 'findings_json', 'message_id',
      'outcome_json', 'resource_id', 'telemetry_json', 'thread_id', 'usage_json']);
  });

  it('keeps the latest record when the same message is verified again', async () => {
    const database = open();
    const repository = new AnswerAuditRepository(database);
    await repository.record(RECORD);
    await repository.record({ ...RECORD, outcome: { status: 'passed', passCount: 1 } });
    const rows = (await database.client.execute('SELECT outcome_json FROM answer_audit')).rows;
    expect(rows.map(row => JSON.parse(String(row.outcome_json)).status)).toEqual(['passed']);
  });

  it('never throws, and logs the failure without the record', async () => {
    const database = open();
    await database.migrate();
    await database.client.execute('DROP TABLE answer_audit');
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    await expect(new AnswerAuditRepository(database).record(RECORD)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('answer_audit.record_failed', expect.anything());
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Covers 40 visits');
  });
});
