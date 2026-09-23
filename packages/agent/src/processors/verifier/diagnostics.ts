/** Opt-in operator diagnostics. Never attach this payload to public telemetry. */
import { mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type PrivateVerificationCapture = (record: Record<string, unknown>) => void;

export function createPrivateVerificationCapture(): PrivateVerificationCapture | undefined {
  const directory = process.env.VERIFIER_PRIVATE_DIAGNOSTICS_DIR;
  if (!directory) return undefined;
  if (!isAbsolute(directory)) throw new Error('Private verification diagnostics require an absolute directory');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Private verification diagnostics require a private directory (0700)');
  const id = randomUUID();
  let sequence = 0;
  return record => {
    writeFileSync(join(directory, `${id}-${++sequence}.json`), JSON.stringify({ schemaVersion: 1, id, capturedAt: new Date().toISOString(), ...record }, null, 2), { mode: 0o600, flag: 'wx' });
  };
}
