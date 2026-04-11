# Topic: chat_page_thread_cache

## Overview
Documents the per-thread message caching and restoration flow in the NC Medicaid Navigator chat page that ensures cached conversations survive transport and useChat instance recreation when switching threads.

## Key Concepts
- thread-specific message cache keyed by threadId
- pendingRestore ref and useEffect to rehydrate cached messages after useChat recreation
- avoid writing to stale useChat instances during handleSelectThread

## Related Topics
- frontend_ui/message_persistence_cache/message_persistence_cache.md
