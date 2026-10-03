/** Opt-in operator diagnostics. Never attach this payload to public telemetry. */
import { mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { VerificationOutcome } from '@nc-medicaid/contracts';
import { log } from '../../logger.js';

export interface ChatDiagnostic {
  id: string;
  startedAtMs: number;
  finished: boolean;
}

/** Shared request-local state ensures cancellation/errors cannot double-complete. */
export function finishChatDiagnostic(diagnostic: ChatDiagnostic | undefined,
  outcome: VerificationOutcome | { status: 'failed' | 'cancelled' }, verifierLatencyMs?: number): void {
  if (!diagnostic || diagnostic.finished) return;
  diagnostic.finished = true;
  log.info('chat.diagnostic_finished', { diagnosticId: diagnostic.id, status: outcome.status,
    ...('passCount' in outcome ? { passCount: outcome.passCount } : {}),
    ...('reason' in outcome ? { reason: outcome.reason } : {}),
    ...(verifierLatencyMs !== undefined ? { verifierLatencyMs } : {}),
    elapsedMs: Date.now() - diagnostic.startedAtMs });
}

export type PrivateVerificationCapture = (record: Record<string, unknown>) => void;

export function createPrivateVerificationCapture(diagnosticId?: string): PrivateVerificationCapture | undefined {
  const directory = process.env.VERIFIER_PRIVATE_DIAGNOSTICS_DIR;
  if (!directory) return undefined;
  if (!isAbsolute(directory)) throw new Error('Private verification diagnostics require an absolute directory');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Private verification diagnostics require a private directory (0700)');
  const id = randomUUID();
  let sequence = 0;
  return record => {
    writeFileSync(join(directory, `${id}-${++sequence}.json`), JSON.stringify({ ...record, schemaVersion: 1, id,
      ...(diagnosticId ? { diagnosticId } : {}), capturedAt: new Date().toISOString() }, null, 2), { mode: 0o600, flag: 'wx' });
  };
}
