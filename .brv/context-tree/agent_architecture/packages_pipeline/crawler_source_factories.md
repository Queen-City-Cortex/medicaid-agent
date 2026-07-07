---
title: Crawler Source Factories
tags: []
related: [packages_pipeline/context.md, agent_architecture/packages_pipeline/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T02:16:30.162Z'
updatedAt: '2026-07-07T02:16:30.162Z'
---
## Raw Concept
**Task:**
Document the crawler source factory refactor and the managed-care contract discovery implementation.

**Changes:**
- Added reusable crawler source factories in crawl-helpers.ts
- Converted several sources to single-index or page crawl discovery
- Kept bespoke behavior for fee-schedules, bulletins, state-plan, and waivers
- Documented that factory-built sources ignore sinceYear

**Files:**
- packages/crawler/src/sources/managed-care-contracts.ts

**Flow:**
landing pages -> fetch HTML -> parse documents -> enqueue detail pages and subpages -> deduplicate docs -> return discovered documents

**Timestamp:** 2026-07-07

**Author:** ByteRover context engineer

**Patterns:**
- `^\/(?:contract-\d|30-\d|php-amendment|tp-amendment)` (flags: i) - Detail pages excluded from managed care contract detail derivation

## Narrative
### Structure
The refactor centralizes source discovery into reusable factory helpers while allowing source-specific behavior to remain bespoke where semantics differ. managed-care-contracts now performs breadth-first page traversal using landing pages, document parsing, optional detail-page derivation, and subpage expansion.

### Dependencies
Relies on config-supplied landing pages, medicaid-page-document link collectors, and fetcher.fetchHtml responses. The source continues to use logger warnings for unexpected status codes.

### Highlights
The managed-care-contracts source uses seenDocs, visitedPages, and queuedPages sets to prevent duplicate processing. It only queues derived detail pages when the URL looks like a contract-related download/open page, and it skips non-200 pages without failing the whole crawl.

### Rules
sinceYear ignored: managed-care contract discovery traverses current contract pages; amendment chains live inside the downloaded PDFs, not the index.

### Examples
Example subpage prefixes include /providers/provider-contracting-health-plans, /health-plan-contact-information, /about-nc-medicaid/health-plans, /provider-contract-templates-tailored-plans, /provider-network-and-contracting-guidance-health-plans-subcontractors-and-providers, /contracting-tailored-plans, /tailored-plan-provider-contracting-deadlines-questions-and-answers, and /blog/.

## Facts
- **crawler_source_factories_refactor**: Branch refactor/crawler-source-factories introduced reusable crawler source factories in commit e7dec6b for PR 61 [project]
- **crawl_helpers_exports**: crawl-helpers.ts exports singleIndexSource, pageCrawlSource, and pushNewDocuments [project]
- **single_index_source_signature**: singleIndexSource takes logPrefix, indexUrl, and parse [project]
- **page_crawl_source_signature**: pageCrawlSource takes logPrefix, startUrls, parsePage, optional extractSubpageUrls, and optional derivePageFromDocument [project]
- **page_crawl_source_behavior**: pageCrawlSource performs BFS with visited, queued, and seenDocs sets and warns then skips non-200 responses [project]
- **push_new_documents_behavior**: pushNewDocuments merges seenUrls with a target collection and incoming documents [project]
- **single_index_migrations**: clinical-policies, nctracks, and dhhs-policies were converted to use single-index discovery [project]
- **page_crawl_migrations**: billing-guidance, managed-care-guidance, and managed-care-contracts were converted to page crawl discovery [project]
- **managed_care_contracts_detail_page_derivation**: managed-care-contracts uses derivePageFromDocument for detail pages [project]
- **since_year_ignored**: Factory-built sources ignore sinceYear by design [project]
- **duplicate_queue_entries**: The guidance crawler no longer enqueues duplicate queue entries, but output remains identical [project]
- **test_status**: 206 tests pass after the refactor [project]
