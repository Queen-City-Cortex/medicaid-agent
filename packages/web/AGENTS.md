<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Live-testing the UI without the WorkOS wall

`/chat` is behind WorkOS middleware auth and needs the Mastra/Neo4j backend, so
you can't just `next dev` and screenshot it. Two mechanisms exist:

- **Design / component iteration → `/preview`.** A dev-only component gallery
  (`src/app/preview/`) that renders the real components against fixtures — no
  auth, no backend. `next dev`, open `http://localhost:3000/preview`, screenshot;
  it has an in-page light/dark toggle. Returns 404 in production.
- **The real wired `/chat` → Playwright `design` project.** Real WorkOS session
  (test-user cookie via storageState) + mocked Mastra backend. From `e2e/`:
  `DESIGN_SHOTS=1 npx playwright test --project=design` writes PNGs to
  `e2e/design-shots/` (gitignored), capturing empty + conversation states in
  both themes (the project is gated behind `DESIGN_SHOTS` so a bare
  `npx playwright test` never triggers the WorkOS login). Use when a change must
  be seen in the actually-wired app (streaming, sidebar, citations).

Prefer `/preview` for fast visual work; reach for the Playwright project when
behavior/wiring matters.
