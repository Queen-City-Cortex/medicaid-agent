---
title: Incremental Crawl Ingest Run 19
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-17T03:45:45.163Z'
updatedAt: '2026-06-17T03:45:45.163Z'
---
## Raw Concept
**Task:**
Document incremental ingest behavior and operational gotchas for crawl run #19 into Railway prod voyage-4

**Changes:**
- Ingested 34 targeted docs into prod
- Production corpus increased from 6693 to 6725 docs
- Added 1533 sections with no missing embeddings
- Verified retrieval for MA-3234 Expanded Foster Care at 0.86 cosine

**Files:**
- packages/crawler/data/documents/
- load_document(parsed_json_path, source_type)

**Flow:**
crawl -> select targeted docs -> parse -> load_document per doc -> incremental embed -> verify retrieval

**Timestamp:** 2026-06-17

**Author:** unknown

**Patterns:**
- `status='downloaded'` - Targeted docs selection filter for real incremental ingest candidates
- `last_changed_at>=run_start` - Docs changed during the run window
- `first_seen_at>=run_start` - New docs first seen during the run window

## Narrative
### Structure
The ingest workflow separates targeted doc selection from full crawl output because fee_schedule PDFs exhibit byte churn and can cause unnecessary reprocessing. The run updates production through a TCP proxy and then performs incremental embedding, while local Docker/Neo4j remains a separate resync concern.

### Dependencies
Depends on file type-aware parsing, a stable converter lifecycle, and the railway production Neo4j pipeline. Local environment availability affects whether a parallel local graph can be updated.

### Highlights
The main operational insight is that naive full parsing of all changed files can reprocess roughly 1850 fee schedule PDFs for hours even though the content is unchanged. Using targeted selection reduces the real ingest set to 34 docs and avoids the byte-churn trap.

### Examples
Use targeted docs where first_seen_at>=run_start or (last_changed_at>=run_start and source_type!=fee_schedule) and status=downloaded to avoid fee schedule churn. Avoid spawning multiprocessing from stdin; run a real .py file or keep conversion in-process.

## Facts
- **crawl_run_19_ingest**: Crawl run #19 ingested 34 targeted docs into Railway prod (voyage-4). [project]
- **prod_doc_count**: Production corpus grew from 6693 to 6725 docs. [project]
- **ingest_changes**: The ingest produced 32 new docs and 2 MERGE updates. [project]
- **sections_added**: The ingest added 1533 sections. [project]
- **embedding_errors**: Embedding finished with 1338/0 errors. [project]
- **missing_embeddings**: No content sections were missing embeddings. [project]
- **retrieval_verification**: Retrieval verification succeeded for the new MA-3234 Expanded Foster Care doc at 0.86 cosine. [project]
- **fee_schedule_byte_churn**: Historical fee schedules can be re-downloaded with byte churn even when content is unchanged. [project]
- **registry_local_path**: registry local_path is relative to packages/crawler/data/documents/. [project]
- **spawn_timeout_failure_mode**: parse_and_save_supported_file_with_timeout uses multiprocessing spawn and fails from a Python heredoc stdin. [project]
- **recommended_parse_path**: The recommended ingestion path is create_converter() once and parse_and_save_supported_file(path,type,converter) in-process to avoid reloading Docling models per file. [project]
- **surgical_prod_load**: A surgical prod load should call load_document(parsed_json_path, source_type) per doc over the TCP proxy and then run incremental embedding. [project]
- **local_graph_status**: Local Docker and Neo4j were down during this ingest, so only prod was updated. [project]
- **local_resync_needed**: Local graph needs resync when Docker is back. [project]
