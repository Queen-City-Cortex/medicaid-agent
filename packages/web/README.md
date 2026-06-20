# NC Medicaid Navigator — Web

Next.js 16 chat interface for the NC Medicaid Navigator agent. Provides streaming conversation with an inline assistant timeline, thread management, and dark/light theme support.

## Development

```bash
npm run dev       # Start dev server on port 3000
npm run build     # Production build
npm run lint      # ESLint
```

Requires the agent dev server running on port 4111 (`cd ../agent && npm run dev`).

To iterate on the UI without the agent backend or the WorkOS login, open
`http://localhost:3000/preview` — a dev-only gallery that renders the real
components against fixtures (404s in production). See [AGENTS.md](AGENTS.md) for
that plus the authenticated Playwright screenshot path.

## Testing

```bash
npm test              # Unit tests (Vitest)
npm run test:coverage # With line-level coverage report

# E2E tests (run from repo root)
npm run test:e2e      # Mocked API tests
npm run test:e2e:ui   # Playwright UI debugger
```

## Auth

Uses [WorkOS AuthKit](https://www.npmjs.com/package/@workos-inc/authkit-nextjs) for authentication.

## Theme

The light/dark/system preference is stored in a `theme` cookie — `layout.tsx`
reads it server-side (and a pre-paint inline script reads it client-side) so the
correct theme paints on first load with no flash. For signed-in users the
preference is also synced to WorkOS user metadata, so it follows them across
devices and backfills the cookie on a new device (see `src/app/actions/theme.ts`).
