---
children_hash: ddd6b9ab4ce6c74b71c9defb68fa95823026f2c9028d53173ef910f5926c7d34
compression_ratio: 0.6514084507042254
condensation_order: 0
covers: [undici_redirect_interceptor_fetcher_fix.md]
covers_token_total: 852
summary_level: d0
token_count: 555
type: summary
---
# Crawler Fetching: Undici Redirect Interceptor Fix

## Structural overview
The crawler fetcher was updated to work reliably on Node 26 after `cheerio` mutates undici’s global dispatcher. The fix is centered in `packages/crawler/src/crawl/fetcher.ts` and keeps existing crawl behavior intact while isolating redirect handling from global state.

## Key architectural change
- The fetcher now owns a **private undici dispatcher** inside `createFetcher()`.
- Redirect handling was moved from `request({ maxRedirections })` to a dispatcher composed with `interceptors.redirect({ maxRedirections })`.
- The fetcher continues to preserve:
  - per-domain serialization
  - rate limiting
  - retry/backoff logic
  - file streaming behavior

## Why this was needed
- The failure only surfaced in the **full crawl path**, not in isolated `request()` calls.
- Importing crawler source modules that load `cheerio` calls `setGlobalDispatcher()`, which mutates undici global state.
- On Node 26, undici rejects `maxRedirections` on the request call when redirect interception is used, producing:
  - `maxRedirections is not supported, use the redirect interceptor`

## Behavior and flow
- Crawl start
- robots.txt fetch
- source imports load `cheerio`
- `cheerio` mutates undici dispatcher
- fetcher uses its **private dispatcher**
- redirects are handled by the interceptor
- crawl continues successfully

## Rules preserved by the fix
- Do not rely on the undici **global dispatcher** when crawl sources may import `cheerio`.
- Use `request({ dispatcher })` with a dispatcher created via:
  - `new Agent().compose(interceptors.redirect({ maxRedirections }))`
- Do not pass `maxRedirections` directly to `request()`.
- Consume error response bodies before retrying or returning.
- Preserve domain-level serialization and rate limiting.

## Verification / outcome
- The change is forward-compatible with undici 7 because it removes `request({ maxRedirections })`.
- Verification showed:
  - crawl discovery succeeded
  - robots.txt handling succeeded
  - dry run discovered **177 clinical_policy docs**

## Drill-down entry
- **Undici Redirect Interceptor Fetcher Fix** — detailed fix, runtime conditions, and exact dispatcher pattern