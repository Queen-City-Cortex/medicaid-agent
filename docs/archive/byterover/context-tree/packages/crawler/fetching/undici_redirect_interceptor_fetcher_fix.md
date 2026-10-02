---
title: Undici Redirect Interceptor Fetcher Fix
tags: []
related: [packages/crawler/fetching/src/sources/discovery.ts.md, packages/crawler/fetching/src/sources/*.ts.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-16T02:57:07.146Z'
updatedAt: '2026-06-16T02:57:07.146Z'
---
## Raw Concept
**Task:**
Fix the crawler fetcher so undici requests work reliably on Node 26 even after cheerio mutates the global dispatcher.

**Changes:**
- Replaced reliance on undici global dispatcher behavior with a private dispatcher owned by the fetcher
- Stopped passing maxRedirections directly to request()
- Composed a redirect interceptor into the fetcher-specific Agent
- Confirmed crawl discovery and robots.txt handling after the fix

**Files:**
- packages/crawler/src/crawl/fetcher.ts

**Flow:**
crawl start -> robots.txt fetch -> source imports load cheerio -> cheerio mutates undici dispatcher -> fetcher request uses private dispatcher -> redirects handled by interceptor -> crawl continues

**Timestamp:** 2026-06-16

**Patterns:**
- `maxRedirections is not supported, use the redirect interceptor` - Undici error emitted when maxRedirections is used with a redirect-interceptor dispatcher

## Narrative
### Structure
The fetcher now owns a private undici dispatcher inside createFetcher(). It keeps per-domain rate limiting, retry/backoff logic, and file streaming behavior unchanged while isolating redirect handling from global state.

### Dependencies
Depends on undici Agent and interceptors.redirect(), plus the crawler source modules that import cheerio. The fix is specifically motivated by Node 26 behavior and the interaction between undici request() and a global dispatcher mutated by cheerio.

### Highlights
This addresses a hard-to-diagnose crawl failure that only appeared in the full crawl path, not isolated request() calls. The change is forward-compatible with undici 7 because it removes use of request({ maxRedirections }).

### Rules
Private dispatcher rule: do NOT rely on the undici GLOBAL dispatcher when crawl sources may import cheerio.
Use request({ dispatcher }) with a dispatcher composed from interceptors.redirect({ maxRedirections }).
Do NOT pass maxRedirections directly to request().
Consume error response bodies before retrying or returning.
Preserve domain-level serialization and rate limiting.

### Examples
Example fix pattern: const dispatcher = new Agent().compose(interceptors.redirect({ maxRedirections: options.maxRedirects })); request(url, { dispatcher, method: "GET", headers, bodyTimeout, headersTimeout });

## Facts
- **crawler_fetch_error**: The crawler fetcher failed on Node 26 with the error "maxRedirections is not supported, use the redirect interceptor". [project]
- **cheerio_global_dispatcher_mutation**: Importing cheerio in the crawler source modules mutates the undici global dispatcher by calling setGlobalDispatcher(). [project]
- **crawler_fetch_fix**: The fix is to use a private dispatcher created with new Agent().compose(interceptors.redirect({ maxRedirections: options.maxRedirects })) and pass it via request({ dispatcher }). [project]
- **node_environment**: The crawler environment is Node 26 with NODE_MODULE_VERSION 147, and better-sqlite3 is compiled for Node 26. [environment]
- **crawler_verification**: A dry run discovered 177 clinical_policy docs and robots.txt succeeded after the fix. [project]
