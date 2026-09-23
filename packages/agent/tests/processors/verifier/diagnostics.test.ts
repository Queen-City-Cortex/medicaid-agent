import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateVerificationCapture } from '../../../src/processors/verifier/diagnostics.js';
import { runVerificationForAnswer } from '../../../src/processors/verifier/run.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('private verifier diagnostics', () => {
  it('is off by default', () => { vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', ''); expect(createPrivateVerificationCapture()).toBeUndefined(); });
  it('writes candidates only into private files and keeps withheld text safe', async () => {
    const root = mkdtempSync(join(tmpdir(), 'verifier-private-')); roots.push(root);
    vi.stubEnv('VERIFIER_PRIVATE_DIAGNOSTICS_DIR', root);
    const sentinel = 'UNCHECKED_PRIVATE_DRAFT_SENTINEL';
    const result = await runVerificationForAnswer({ question: 'Question', answerText: sentinel, sources: [], verify: vi.fn().mockResolvedValue({ supported: false, relevant: true, citationsComplete: false, unsupportedClaims: [{ claim: sentinel, reason: 'not evidenced' }], correctedAnswer: '' }) });
    expect(result.finalAnswer).not.toContain(sentinel);
    expect(JSON.stringify(result.telemetry)).not.toContain(sentinel);
    const files = readdirSync(root);
    expect(files).toHaveLength(3);
    expect(files.some(file => readFileSync(join(root, file), 'utf8').includes(sentinel))).toBe(true);
    for (const file of files) expect(statSync(join(root, file)).mode & 0o777).toBe(0o600);
  });
});
