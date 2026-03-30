# NC Medicaid Navigator — Web

Next.js 16 chat interface for the NC Medicaid Navigator agent. Provides streaming conversation with research trace visualization, thread management, and dark/light theme support.

## Development

```bash
npm run dev       # Start dev server on port 3000
npm run build     # Production build
npm run lint      # ESLint
```

Requires the agent dev server running on port 4111 (`cd ../agent && npm run dev`).

## Testing

```bash
npm test              # Unit tests (Vitest)
npm run test:coverage # With line-level coverage report

# E2E tests (run from repo root)
npm run test:e2e      # Mocked API tests
npm run test:e2e:ui   # Playwright UI debugger
```

## Auth

Uses [WorkOS AuthKit](https://www.npmjs.com/package/@workos-inc/authkit-nextjs) for authentication. Theme preferences are stored in WorkOS user metadata.
