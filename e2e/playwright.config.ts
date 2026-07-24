import { defineConfig, devices } from '@playwright/test';
import { config as dotenv } from 'dotenv';
import path from 'path';
// Dependency-free import: this file loads for every run (including real-login
// smoke/design), so the hermetic-only deps (jose, iron-session) must stay out
// of the config's import graph — they live in test-auth.ts, loaded only by
// the hermetic setup project.
import { HERMETIC_ENV } from './helpers/hermetic-env';

dotenv({ path: path.resolve(import.meta.dirname, '../.env') });

// Hermetic auth: the mocked project normally depends on a real WorkOS login
// (auth.setup.ts), which needs live credentials and network — impossible in
// CI. With HERMETIC_AUTH=1 (default in CI):
//   - setup switches to auth.hermetic.setup.ts, which mints + seals a test
//     session locally (helpers/test-auth.ts, fixtures/test-jwk.json);
//   - a local JWKS stub (helpers/jwks-stub.mjs) serves the matching public
//     key so the middleware's jwtVerify succeeds with zero WorkOS calls;
//   - the web dev server starts with WORKOS_* overrides pointing at the stub.
//     reuseExistingServer is OFF in hermetic mode: an already-running server
//     with real WorkOS env can't unseal the test cookie (different cookie
//     password) and every spec would bounce to the real login.
// The smoke and design projects keep the real login — they exercise the true
// auth flow by design.
const HERMETIC = process.env.HERMETIC_AUTH === '1' || (!!process.env.CI && process.env.HERMETIC_AUTH !== '0');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A cold Next.js dev compile is not stable under Playwright's default of
  // one worker per CPU core. Keep local runs parallel but bounded; CI remains
  // serialized for deterministic diagnostics.
  workers: process.env.CI ? 1 : 4,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup — runs first, saves session cookies for other projects
    {
      name: 'setup',
      testMatch: HERMETIC ? /auth\.hermetic\.setup\.ts/ : /auth\.setup\.ts/,
    },

    {
      name: 'mocked',
      testDir: './tests/mocked',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
      // Next dev may perform a cold compile on the first browser worker.
      // Keep assertions bounded while avoiding false failures on that compile.
      timeout: 30_000,
    },
    // The smoke project exists only outside hermetic mode: it covers the REAL
    // hosted WorkOS login and a live backend, which the synthetic cookie
    // would silently bypass. In hermetic mode `--project=smoke` therefore
    // fails loudly ("project not found") instead of running with fake auth.
    ...(HERMETIC
      ? []
      : [
          {
            name: 'smoke',
            testDir: './tests/smoke',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/user.json',
            },
            dependencies: ['setup'],
            timeout: 120_000,
          },
        ]),

    // Opt-in screenshot project for design review. Gated behind DESIGN_SHOTS so
    // a bare `npx playwright test` never pulls it in (it would otherwise force a
    // real WorkOS `setup` login on every full local run). Authenticated like the
    // others but with the Mastra backend mocked; writes PNGs to design-shots/
    // rather than asserting. Run: `DESIGN_SHOTS=1 npx playwright test --project=design`.
    // Excluded in hermetic mode for the same reason as smoke: it documents the
    // real-login rendering, not the synthetic-cookie path.
    ...(process.env.DESIGN_SHOTS && !HERMETIC
      ? [
          {
            name: 'design',
            testDir: './tests/design',
            testMatch: /.*\.shots\.ts/,
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1280, height: 900 },
              storageState: 'playwright/.auth/user.json',
            },
            dependencies: ['setup'],
            timeout: 30_000,
          },
        ]
      : []),
  ],

  webServer: HERMETIC
    ? [
        {
          command: 'node helpers/jwks-stub.mjs',
          url: 'http://127.0.0.1:8719/sso/jwks/client_e2e_test',
          reuseExistingServer: false,
          timeout: 15_000,
        },
        {
          command: 'npm run dev',
          cwd: '../packages/web',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 120_000,
          // Next.js env-file loading never overrides already-set process env,
          // so these win over the repo .env.
          env: { ...HERMETIC_ENV },
        },
      ]
    : {
        command: 'npm run dev',
        cwd: '../packages/web',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
