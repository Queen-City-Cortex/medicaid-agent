---
title: Crawler Sync Behavior
summary: Crawler sync logic for downloads, retryable 404 removal, and phase-aware document processing.
tags: []
related: []
keywords: []
createdAt: '2026-06-12T03:26:43.236Z'
updatedAt: '2026-06-12T03:26:43.236Z'
---
## Reason
Document crawler sync phase behavior and error handling rules.

## Raw Concept
**Task:**
Document crawler sync processing and document lifecycle handling.

**Changes:**
- Tracked consecutive 404s before removal instead of deleting immediately
- Separated download and check phases with skipIds to avoid duplicate fetches
- Improved error logging and document status transitions

**Files:**
- packages/crawler/src/crawl/sync.ts

**Flow:**
download phase -> update registry -> record consecutive 404s or errors -> check phase -> skip processed docs -> recheck remaining documents

**Timestamp:** 2026-06-12T03:26:15.012Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The sync module defines SyncStats, SyncContext, applyResult, processDocuments, runDownloadPhase, and runCheckPhase. It lazily tracks filenames per source type to keep collision handling correct within a phase.

### Dependencies
Depends on the registry, fetcher, downloader, and source-type directory mapping. Removal behavior is governed by config.notFoundRemovalThreshold unless overridden in context.

### Highlights
Transient 404s self-heal until the threshold is reached, and documents already processed during the download phase are excluded from the check phase.

## Facts
- **http_status_error**: HttpStatusError carries statusCode for crawler download failures [project]
- **not_found_removal_threshold**: A document is marked removed only after 3 consecutive 404s by default threshold [project]
- **payload_validation**: HTML payloads are rejected for binary-only families [project]
- **sqlite_dependency**: better-sqlite3 12 is required for Node 26 [project]
- **phase_skip_ids**: runDownloadPhase returns processedIds so runCheckPhase can skip documents already handled in the same run [project]
