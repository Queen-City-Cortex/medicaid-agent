---
children_hash: af47bc756ae4f062a26f62ab9163b630a8c29126063acd198c38f97378af5447
compression_ratio: 0.8269230769230769
condensation_order: 1
covers: [fetching/_index.md]
covers_token_total: 624
summary_level: d1
token_count: 516
type: summary
---
# Crawler Fetching

Structural overview of the crawler’s fetcher hardening work, centered on making crawl execution reliable on Node 26 without changing crawl semantics. The main fix lives in `packages/crawler/src/crawl/fetcher.ts` and isolates redirect handling from mutable undici global state.

## Core architecture
- The fetcher now owns a **private undici dispatcher** inside `createFetcher()`.
- Redirects are handled through a dispatcher composed with `interceptors.redirect({ maxRedirections })`.
- The implementation preserves existing behavior:
  - per-domain serialization
  - rate limiting
  - retry/backoff logic
  - file streaming behavior

## Problem and root cause
- The failure appeared in the **full crawl path**, not in isolated `request()` calls.
- Importing crawler source modules that load `cheerio` triggers `setGlobalDispatcher()`, mutating undici global state.
- On Node 26, undici rejects `maxRedirections` passed directly to `request()`, producing:
  - `maxRedirections is not supported, use the redirect interceptor`

## Runtime flow
- Crawl start
- robots.txt fetch
- source imports load `cheerio`
- `cheerio` mutates undici dispatcher
- fetcher uses its **private dispatcher**
- redirects are handled by the interceptor
- crawl continues successfully

## Preserved rules
- Do not rely on the undici **global dispatcher** when crawl sources may import `cheerio`.
- Use `request({ dispatcher })` with:
  - `new Agent().compose(interceptors.redirect({ maxRedirections }))`
- Do not pass `maxRedirections` directly to `request()`.
- Consume error response bodies before retrying or returning.
- Preserve domain-level serialization and rate limiting.

## Outcome
- The fix is forward-compatible with undici 7 because it removes `request({ maxRedirections })`.
- Verification confirmed crawl discovery and robots.txt handling succeed, including a dry run that discovered **177 clinical_policy docs**.

## Drill-down
- **Undici Redirect Interceptor Fetcher Fix** — detailed runtime conditions, exact dispatcher pattern, and verification notes