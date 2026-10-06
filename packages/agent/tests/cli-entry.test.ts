import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const AGENT_ROOT = fileURLToPath(new URL('..', import.meta.url));
// The gates the evaluation CLI runs, in production order, less the
// prompt-injection detector it is configured without.
const CLI_INPUT_PROCESSORS = [
  'message-length-guard',
  'coverage-boundary',
  'scope-gate',
  'openai-responses-dedup',
  'answer-frame-prefetch',
  'answer-frame-planning',
  'token-limiter',
];

let directory: string;
let runs = 0;

/** Runs `src/cli.ts` as the evaluation does, with no WorkOS variable and no
 *  provider it could reach: the key is a dummy and the OpenAI base URL is a
 *  port no client will open. */
function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: AGENT_ROOT,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        OPENAI_API_KEY: 'sk-test-stub-not-a-real-key',
        OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
        VOYAGE_API_KEY: 'stub',
        ANTHROPIC_API_KEY: '',
        NEO4J_URI: 'bolt://127.0.0.1:1',
        DATABASE_URL: `file:${directory}/cli-${runs++}.db`,
        MASTRA_OBSERVABILITY_PATH: ':memory:',
        SENTRY_DSN: '',
        // Empty, so a developer's .env cannot supply them either.
        WORKOS_API_KEY: '',
        WORKOS_CLIENT_ID: '',
        WORKOS_REDIRECT_URI: '',
        FORCE_COLOR: '0',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI did not exit:\n${stdout}\n${stderr}`));
    }, 40_000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

/** The JSON line after a marker, and the answer text, as answer.py reads them. */
function block(stdout: string, marker: string): any {
  const after = stdout.slice(stdout.indexOf(marker) + marker.length);
  return JSON.parse(after.split('\n').find(line => line.trim().startsWith('{'))!);
}
const answer = (stdout: string) => stdout.slice(stdout.indexOf('---ANSWER---') + '---ANSWER---'.length).trim();

beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), 'cli-entry-')); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe('the CLI entrypoint', () => {
  it('loads without WorkOS settings and runs as far as the model provider', async () => {
    const { code, stdout, stderr } = await runCli(['Does NC Medicaid cover dental cleanings for adults?']);
    const output = stdout + stderr;
    expect(output).not.toMatch(/workos/i);
    // The scope gate ran and failed open on the unreachable classifier, then
    // the chat model call failed: nothing before the provider stopped the run.
    expect(output).toContain('scope_gate.failed_open');
    expect(stderr).toContain('Agent error:');
    expect(stderr).toContain('Cannot connect to API');
    expect(stdout).not.toContain('---ANSWER---');
    expect(code).toBe(1);
  }, 45_000);

  it('reports a coverage-boundary refusal as a withheld outcome that names the gate', async () => {
    const { code, stdout } = await runCli(['What MAGI income table and limits apply in February 2025?']);
    expect(code).toBe(0);
    const evidence = block(stdout, '---EVIDENCE---');
    expect(evidence.sources).toEqual([]);
    expect(evidence.agent_config.input_processors).toEqual(CLI_INPUT_PROCESSORS);
    expect(evidence.agent_config.runtime_options).toEqual({ memory: false, prompt_injection_detector: false });
    expect(evidence.agent_config.agent_model).toEqual(expect.any(String));
    const verifier = block(stdout, '---VERIFIER---');
    expect(verifier).toMatchObject({
      gate: { processor_id: 'coverage-boundary', code: 'coverage-limitation' },
      coverage_policy_id: 'bounded-policy-research-v1',
      outcome: { status: 'withheld', reason: 'coverage-limitation', passCount: 0 },
      pass_count: 0, latency_ms: 0, withholding_reason: 'coverage-limitation',
      supported: false, verifier_unavailable: false,
    });
    // Nothing but the gate's message follows the marker: the harness reads
    // everything after it as the answer.
    expect(answer(stdout)).toBe(verifier.coverage_issue);
    expect(answer(stdout)).toMatch(/^I cannot establish the applicable MAGI income table/);
  }, 45_000);

  it('reports a length-guard refusal without coverage fields', async () => {
    const { code, stdout } = await runCli([`Is this covered? ${'x'.repeat(60)}`], { MAX_MESSAGE_CHARS: '40' });
    expect(code).toBe(0);
    expect(block(stdout, '---VERIFIER---')).toMatchObject({
      gate: { processor_id: 'message-length-guard', code: 'message-too-long' },
      coverage_policy_id: null, coverage_issue: null,
      outcome: { status: 'withheld', reason: 'message-too-long', passCount: 0 },
    });
    expect(answer(stdout)).toMatch(/^That message is too long/);
  }, 45_000);

  it('exits with a usage error when no question is given', async () => {
    for (const args of [[], ['--deep-research']]) {
      const { code, stdout, stderr } = await runCli(args);
      expect(code).toBe(2);
      expect(stderr).toContain('Usage: tsx src/cli.ts');
      expect(stdout).toBe('');
    }
  }, 45_000);
});
