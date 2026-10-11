// Playwright config for verify-medicaid-agent. Run only through scripts/verify.sh,
// which launches the instance first and sets VERIFY_EVIDENCE_DIR / VERIFY_BASE_URL.
// No webServer block: this config never starts or reuses a server by itself.
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const here = import.meta.dirname;
const e2e = path.resolve(here, '../../../../e2e');
const evidence = process.env.VERIFY_EVIDENCE_DIR;
if (!evidence) throw new Error('VERIFY_EVIDENCE_DIR is not set: drive through scripts/verify.sh');
// The minted session lives in the run's scratch dir, never in the evidence.
const authFile = process.env.VERIFY_AUTH_FILE ?? path.join(evidence, '..', '.session.json');

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(evidence, 'playwright-output'),
  reporter: [['list'], ['json', { outputFile: path.join(evidence, 'report.json') }]],
  use: {
    baseURL: process.env.VERIFY_BASE_URL ?? 'http://localhost:3000',
    trace: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      // Mints the hermetic test session (same code CI uses) into the run's scratch dir (VERIFY_AUTH_FILE).
      name: 'session',
      testDir: path.join(here),
      testMatch: /session\.setup\.ts/,
    },
    {
      name: 'verify',
      testDir: here,
      testMatch: /\.verify\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['session'],
      timeout: 90_000,
    },
    {
      // The repo's own mocked specs, run against this run's instance.
      name: 'e2e-mocked',
      testDir: path.join(e2e, 'tests/mocked'),
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['session'],
      timeout: 60_000,
    },
  ],
});
