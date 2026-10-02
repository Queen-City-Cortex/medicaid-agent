---
children_hash: 771fd789aac57c8f7cf83c79cb31a08068a980b6e9fb863b16bfdad33890f04f
compression_ratio: 0.8015564202334631
condensation_order: 0
covers: [crawler_sync_behavior.md]
covers_token_total: 514
summary_level: d0
token_count: 412
type: summary
---
# Crawler Sync Behavior

## Overview
`crawler_sync_behavior.md` documents the sync lifecycle in `packages/crawler/src/crawl/sync.ts`, with emphasis on phase separation, retryable 404 handling, and document state transitions. The key design goal is to avoid premature deletion while preventing duplicate work across download and check phases.

## Core structure
- Main sync pieces: `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, and `runCheckPhase`.
- The module lazily tracks filenames per source type so collision handling stays correct within each phase.
- `runDownloadPhase` returns processed IDs so `runCheckPhase` can skip already-handled documents.

## Behavior and rules
- Download and check phases are separated to reduce duplicate fetches and improve state handling.
- Documents are not removed on the first 404; they are removed only after reaching `config.notFoundRemovalThreshold` or the default threshold.
- Error handling records consecutive 404s and other failures before changing document status.
- Existing processed documents are excluded from the later check phase via `skipIds`.

## Dependencies
- Relies on the registry, fetcher, downloader, and source-type directory mapping.
- Removal behavior is configurable through `config.notFoundRemovalThreshold`.

## Key facts
- `HttpStatusError` carries `statusCode` for crawler download failures.
- Default removal threshold is 3 consecutive 404s.
- HTML payloads are rejected for binary-only families.
- `better-sqlite3` 12 is required for Node 26.

## Drill-down
- `crawler_sync_behavior.md` — full sync flow, retry logic, and status transitions