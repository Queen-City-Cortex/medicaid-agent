// Dependency-free on purpose: playwright.config.ts imports this at config
// load for every run (including real-login smoke/design runs), so it must
// not pull in the hermetic-only deps (jose, iron-session) — those stay in
// test-auth.ts, which only the hermetic setup project loads.
//
// These values MUST match between the minted session (test-auth.ts) and the
// env the hermetic web server is started with (playwright.config.ts).
export const HERMETIC_ENV = {
  WORKOS_CLIENT_ID: 'client_e2e_test',
  WORKOS_API_KEY: 'sk_test_e2e_dummy',
  WORKOS_API_HOSTNAME: '127.0.0.1',
  WORKOS_API_PORT: '8719',
  WORKOS_API_HTTPS: 'false',
  // 32+ chars, test-only. Real deployments have their own secret; a session
  // sealed with this password is worthless against them.
  WORKOS_COOKIE_PASSWORD: 'e2e-test-cookie-password-0123456789abcdef',
  WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  // Keep the browser bundle and CSP aligned with the API origin intercepted
  // by Playwright's hermetic route mocks.
  NEXT_PUBLIC_MASTRA_URL: 'http://localhost:4111',
} as const;
