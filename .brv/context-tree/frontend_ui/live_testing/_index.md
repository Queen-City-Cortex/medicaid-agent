---
children_hash: 5a81faf385434d701e6183ccad02f0c8c5e49b4e2ec1e0f29d7c9ab5d7a0133c
compression_ratio: 0.6412556053811659
condensation_order: 1
covers: [live_testing_without_the_workos_wall.md]
covers_token_total: 892
summary_level: d1
token_count: 572
type: summary
---
# Frontend UI Live Testing Paths

This set of notes defines two complementary ways to live-test the web UI without depending on the WorkOS auth wall or a live backend. See **live_testing_without_the_workos_wall.md** for the full breakdown.

## Core validation paths

- **`/preview` dev gallery**: a dev-only component gallery for isolated UI iteration against fixture data.
- **Playwright design project**: an opt-in test project that exercises the real **`/chat`** route while mocking backend responses and capturing screenshots for review.

## Key structural decisions

- The team **did not add an env-gated auth bypass to `proxy.ts`**.
- Instead, they split validation into:
  - fast component-level work in `/preview`
  - end-to-end visual verification in the Playwright design project when wiring matters

## `/preview` route behavior

- File references:
  - `packages/web/src/app/preview/page.tsx`
  - `packages/web/src/app/preview/gallery.tsx`
- It is reachable in development without a login round-trip because it is listed in `proxy.ts` unauthenticated paths.
- It is protected in production by a `NODE_ENV` 404 gate.
- It depends only on fixture data and an in-page light/dark toggle.

## Playwright design project behavior

- File references:
  - `e2e/tests/design/screenshots.shots.ts`
  - `e2e/playwright.config.ts`
  - `e2e/helpers/mock-routes.ts`
- It runs the actual **`/chat`** UI with a real WorkOS test-user cookie via `storageState`.
- It intercepts the backend with `mockMastraAPI`, so no agent or database is required.
- It writes PNG screenshots to **`e2e/design-shots/`**, which is gitignored.
- It sets a theme cookie per run to produce both light and dark screenshots.

## Dependencies and inputs

- The Playwright path depends on:
  - `auth.setup.ts` for minting the WorkOS test-user cookie
  - root `.env` values:
    - `TEST_USER_EMAIL`
    - `TEST_USER_PASSWORD`
  - `mockMastraAPI` for backend interception
- The preview path depends only on fixtures and local UI rendering.

## Operational guidance

- Use **`/preview`** for fast visual iteration.
- Use the **Playwright design project** when you need to validate streaming, sidebar behavior, or citations in the fully wired app.
- The design project command is:
  - `npx playwright test --project=design`