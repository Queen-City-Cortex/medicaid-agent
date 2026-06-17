# Topic: message_persistence_cache

## Overview
Captures the race condition around savePerStep writes on the NC Medicaid Navigator chat page and the cache guard that preloads UI messages while the database write finishes.

## Key Concepts
- messageCache useRef Map keyed by threadId
- handleSelectThread cache-first rendering plus loadThread refresh
- useChat onFinish hook populates cache before setThreadVersion
