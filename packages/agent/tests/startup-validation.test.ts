import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const AGENT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function runAgent(env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: AGENT_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`agent startup did not terminate after invalid configuration:\n${output}`));
    }, 20_000);

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

describe('agent startup validation', () => {
  it('refuses an ephemeral database in production before starting the service', async () => {
    const { code, output } = await runAgent({
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'test-openai-key',
      VOYAGE_API_KEY: 'test-voyage-key',
      WORKOS_CLIENT_ID: 'client_production',
      WORKOS_API_KEY: 'sk_live_production',
      DATABASE_URL: 'file:./mastra.db',
      NEO4J_URI: 'neo4j+s://graph.example.com',
      NEO4J_USER: 'neo4j',
      NEO4J_PASSWORD: 'production-password',
      CORS_ORIGINS: 'https://app.example.com',
      FORCE_COLOR: '0',
    });

    expect(code).not.toBe(0);
    expect(output).toContain('DATABASE_URL must use persistent storage in production');
  }, 25_000);

  it('refuses a reasoning effort outside the allow-list', async () => {
    const { code, output } = await runAgent({
      PATH: process.env.PATH,
      OPENAI_API_KEY: 'test-openai-key',
      VOYAGE_API_KEY: 'test-voyage-key',
      AGENT_REASONING_EFFORT: 'extreme',
      FORCE_COLOR: '0',
    });

    expect(code).not.toBe(0);
    expect(output).toContain('AGENT_REASONING_EFFORT must be one of: none, minimal, low, medium, high, xhigh');
  }, 25_000);
});
