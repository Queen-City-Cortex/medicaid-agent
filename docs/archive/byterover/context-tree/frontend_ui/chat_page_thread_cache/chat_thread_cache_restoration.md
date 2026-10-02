---
consolidated_at: '2026-06-23T00:53:50.877Z'
consolidated_from: [{date: '2026-06-23T00:53:50.877Z', path: frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, reason: 'These files describe the same chat page/thread cache restoration concept with overlapping summaries, abstracts, and overviews. One set focuses on thread cache restoration on thread switching, while the newer note focuses on reloading persisted assistant turns; both belong in a single consolidated thread-cache restoration topic with temporal evolution captured in the merged narrative.'}, {date: '2026-06-23T00:53:50.877Z', path: frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.abstract.md, reason: 'These files describe the same chat page/thread cache restoration concept with overlapping summaries, abstracts, and overviews. One set focuses on thread cache restoration on thread switching, while the newer note focuses on reloading persisted assistant turns; both belong in a single consolidated thread-cache restoration topic with temporal evolution captured in the merged narrative.'}, {date: '2026-06-23T00:53:50.877Z', path: frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.overview.md, reason: 'These files describe the same chat page/thread cache restoration concept with overlapping summaries, abstracts, and overviews. One set focuses on thread cache restoration on thread switching, while the newer note focuses on reloading persisted assistant turns; both belong in a single consolidated thread-cache restoration topic with temporal evolution captured in the merged narrative.'}, {date: '2026-06-23T00:53:50.877Z', path: frontend_ui/chat_page_thread_cache/chat_thread_cache_restoration.abstract.md, reason: 'These files describe the same chat page/thread cache restoration concept with overlapping summaries, abstracts, and overviews. One set focuses on thread cache restoration on thread switching, while the newer note focuses on reloading persisted assistant turns; both belong in a single consolidated thread-cache restoration topic with temporal evolution captured in the merged narrative.'}, {date: '2026-06-23T00:53:50.877Z', path: frontend_ui/chat_page_thread_cache/chat_thread_cache_restoration.overview.md, reason: 'These files describe the same chat page/thread cache restoration concept with overlapping summaries, abstracts, and overviews. One set focuses on thread cache restoration on thread switching, while the newer note focuses on reloading persisted assistant turns; both belong in a single consolidated thread-cache restoration topic with temporal evolution captured in the merged narrative.'}]
related: [frontend_ui/chat_page_thread_cache/thread_cache_restoration.md, frontend_ui/chat_page_thread_cache/authenticated_thread_operations.md, frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md]
---
# Topic: chat_page_thread_cache

## Overview
Documents the per-thread message caching and restoration flow in the NC Medicaid Navigator chat page that ensures cached conversations survive transport and useChat instance recreation when switching threads.

## Key Concepts
- thread-specific message cache keyed by threadId
- pendingRestore ref and useEffect to rehydrate cached messages after useChat recreation
- avoid writing to stale useChat instances during handleSelectThread
- coalescing split persisted assistant turn parts into one restored UI message on reload
- preserving verification parts while dropping observational-memory noise

## Related Topics
- frontend_ui/message_persistence_cache/message_persistence_cache.md
- frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md
- frontend_ui/chat_streaming_error_handling/context.md

## Consolidated Notes
Chat page thread cache restoration now covers two related behaviors. First, when switching threads, a messageCache map keyed by threadId stores assistant replies and a pendingRestore ref defers rehydration until the new useChat instance mounts, preventing stale writes and cross-thread leakage. Second, when reloading persisted threads, split assistant turn parts are coalesced so one restored UI message contains tools, answer text, and verification badges instead of orphan tool-only cards.

The restoration flow is: thread identity -> cache lookup -> restore persisted chat state -> render conversation. For reloads, the flow is: persisted DB messages -> coalesce assistant turn parts -> merge tools + answer + verification -> restore chat thread UI state on reload.

Notable implementation files include packages/web/src/app/chat/page.tsx, packages/web/src/lib/parse-message.ts, packages/web/src/lib/use-chat-thread.ts, and packages/web/tests/lib/parse-message.test.ts.

Important rules:
- Preserve data-verification-rewrite and data-verification-ok on reload.
- Continue dropping data-om-* parts as internal noise.
- Anchor restored assistant id and createdAt on the answer-text-bearing message.
- Avoid calling setMessages immediately from handleSelectThread; use the pendingRestore flow instead.

A CI/testing gap was observed because mocked e2e fixtures did not reproduce the multi-message persisted shape, so the degradation was not caught earlier.