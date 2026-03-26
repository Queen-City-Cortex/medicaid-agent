# NC Medicaid Document Crawler — Design Specification

**Project:** NC Medicaid Navigator — Layer 0 Prerequisite
**Author:** Jeff Hoffman / Queen City Cortex LLC
**Date:** March 26, 2026
**Location:** `crawler/` subfolder of the NC Medicaid Navigator project

---

## 1. Purpose

A polite, incremental crawler that discovers and downloads NC Medicaid policy documents (PDFs, DOCX, XLSX) from North Carolina government websites. It maintains a local document registry so it never re-downloads a document it already has unless that document has changed. It respects rate limits and robots.txt to avoid IP bans.

This crawler is the prerequisite to Layer 0 (Document Pipeline + Knowledge Graph) of the NC Medicaid Navigator. Its output — a directory of PDFs with structured metadata — is the input to the Docling parsing pipeline.

### What This Crawler Does NOT Do

- Parse PDFs (that's Docling's job in Layer 0)
- Extract cross-references (knowledge graph pipeline)
- Embed text (downstream)
- Serve a web UI (CLI tool only)
- Crawl the entire medicaid.ncdhhs.gov site (only specific document sources)
- Execute JavaScript on pages (no headless browser — flag JS-required pages for manual investigation)
- Handle authentication (government Medicaid policy documents are public — log and skip anything requiring login)

---

## 2. Source Sites

### 2.1 Primary: Clinical Coverage Policies (HIGH priority)

- **Index URL:** `https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies`
- **Structure:** Single HTML page listing ~120+ clinical coverage policies organized by category (Allergies, Ambulance, Behavioral Health, etc.). Each policy links to a PDF download.
- **Link patterns:** `https://medicaid.ncdhhs.gov/{slug}/download?attachment` or `https://medicaid.ncdhhs.gov/media/{id}/download?attachment`
- **Document types:** PDF
- **Update frequency:** Individual policies amended periodically (some monthly, some yearly). Index page is relatively stable.

### 2.2 Medicaid Bulletins (HIGH priority)

- **Index URL:** `https://medicaid.ncdhhs.gov/providers/medicaid-bulletin`
- **Sub-pages:**
  - Current bulletins: `https://medicaid.ncdhhs.gov/blog-category/bulletins` (paginated blog-style listing)
  - Monthly digests: `https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests`
  - Archives 2008–2015: `https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive/medicaid-bulletin-archive-2008-2015`
  - Archives 1997–2007: `https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive/medicaid-bulletin-archive-1997-2007`
  - Yearly pages (2016+): `https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive/{year}-medicaid-bulletin*`
- **Structure:** Archive/year pages link to individual bulletin PDFs. Current bulletins are blog posts that may contain inline content AND link to PDF attachments.
- **Document types:** PDF (mostly), some older ones may be HTML-only blog posts
- **Update frequency:** Monthly bulletins, plus special bulletins as needed

### 2.3 State Plan Amendments (MEDIUM priority)

- **Index URL:** `https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices`
- **Sub-pages:** Yearly listings (e.g., `2024-proposed-amendments-sent-cms`, `2021-proposed-amendments-sent-cms`)
- **Structure:** Each yearly page lists SPAs with download links. Main index page also has proposed/pending SPAs.
- **Document types:** PDF
- **Update frequency:** Dozens per year

### 2.4 Waiver Documents (MEDIUM-HIGH priority)

- **Key pages:**
  - CAP/DA: `https://medicaid.ncdhhs.gov/blog/2022/06/29/community-alternatives-program-disabled-adults-waiver-amendment` (and related pages)
  - NC Innovations: `https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver`
  - TBI Waiver: linked from the Innovations page and state plan notices
  - 1915(b) waiver: linked from state plan public notices
  - 1915(i) services: `https://medicaid.ncdhhs.gov/beneficiaries/1915i`
- **Structure:** Blog posts and info pages with embedded PDF download links. Less structured than clinical policies index.
- **Document types:** PDF (waiver applications, amendments, appendices)
- **Update frequency:** Infrequent but significant

### 2.5 NCTracks Provider Manuals (LOW priority — deferred)

- **Index URL:** `https://www.nctracks.nc.gov/content/public/providers/provider-manuals.html`
- **Document types:** PDF, XLSX, DOCX
- Not part of initial crawl. Separate domain, separate robots.txt.

### 2.6 NCDHHS Policies Repository (DEFERRED)

- **URL:** `https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/`
- Returns 403 as of March 2026. Flag for manual investigation.

---

## 3. Architecture

### 3.1 Language & Runtime

- TypeScript / Node.js (founder's primary stack, consistent with the Navigator project)
- Target Node.js 20+

### 3.2 Dependencies

| Dependency | Purpose |
|---|---|
| `better-sqlite3` | Local document registry. Synchronous, zero-config, single-file DB. |
| `cheerio` | HTML parsing for extracting links from index pages. |
| `undici` | HTTP client with streaming downloads, connection pooling, per-request timeouts. |
| `robots-parser` | Parse and respect robots.txt. |
| `p-queue` | Concurrency-limited queue for request scheduling. |
| `mime-types` | Detect file types from headers. |
| `commander` | CLI subcommands and flags with auto-generated help. |
| `crypto` (built-in) | SHA-256 hashing for content change detection. |

**Dev dependencies:** `typescript`, `tsx`, `vitest`, `@types/better-sqlite3`, `@types/mime-types`

### 3.3 Project Structure

```
crawler/
├── src/
│   ├── index.ts                 # CLI entry point (commander setup)
│   ├── config.ts                # Source definitions, rate limits, paths
│   ├── db/
│   │   ├── schema.ts            # SQLite schema + migrations
│   │   └── registry.ts          # Document registry CRUD operations
│   ├── crawl/
│   │   ├── fetcher.ts           # HTTP client (undici) with rate limiting, retries, etag/last-modified
│   │   ├── robots.ts            # robots.txt fetching and checking
│   │   ├── discovery.ts         # Coordinator — dispatches to source modules, aggregates results
│   │   └── downloader.ts        # Downloads files via streaming, computes hashes, stores to disk
│   ├── sources/
│   │   ├── clinical-policies.ts # Discovery logic for clinical coverage policies
│   │   ├── bulletins.ts         # Discovery logic for bulletins (current + archives)
│   │   ├── state-plan.ts        # Discovery logic for SPAs
│   │   └── waivers.ts           # Discovery logic for waiver documents
│   └── utils/
│       ├── logger.ts            # Structured logging (console + file)
│       └── hash.ts              # SHA-256 file hashing
├── data/
│   ├── documents/               # Downloaded PDFs organized by source type
│   │   ├── clinical-policies/
│   │   ├── bulletins/
│   │   ├── state-plan-amendments/
│   │   └── waivers/
│   └── crawler.db               # SQLite database
├── tests/
│   ├── fixtures/                # Saved HTML snapshots for parser tests
│   ├── db/
│   │   └── registry.test.ts
│   ├── crawl/
│   │   ├── fetcher.test.ts
│   │   └── downloader.test.ts
│   ├── sources/
│   │   ├── clinical-policies.test.ts
│   │   ├── bulletins.test.ts
│   │   ├── state-plan.test.ts
│   │   └── waivers.test.ts
│   └── utils/
│       └── hash.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

Key structural note: `crawl/discovery.ts` is a thin coordinator that dispatches to the per-source modules in `sources/`. All HTML parsing logic lives in the source modules, not in `discovery.ts`.

---

## 4. Document Registry (SQLite Schema)

```sql
-- Every document the crawler has ever seen
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  source_url TEXT NOT NULL UNIQUE,        -- The canonical download URL
  discovered_from TEXT NOT NULL,           -- The index page where we found this link
  source_type TEXT NOT NULL,               -- 'clinical_policy' | 'bulletin' | 'state_plan_amendment' | 'waiver' | 'provider_manual'

  -- Metadata extracted from the index page (not from the PDF itself)
  title TEXT,                              -- Link text or heading from the index page
  policy_number TEXT,                      -- e.g., '3K-2', '8A-1', 'SPA 24-0001' (parsed from title)
  category TEXT,                           -- e.g., 'Behavioral Health', 'Community-Based Services' (from index page grouping)

  -- Download state
  local_path TEXT,                         -- Relative path to downloaded file in data/documents/
  file_hash TEXT,                          -- SHA-256 of the downloaded file content
  file_size INTEGER,                       -- Bytes
  mime_type TEXT,                          -- From Content-Type header

  -- HTTP caching headers (for conditional requests)
  etag TEXT,                               -- ETag header from last successful download
  last_modified TEXT,                      -- Last-Modified header from last successful download

  -- Timestamps
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),  -- When we first discovered this URL
  last_checked_at TEXT,                    -- When we last made a request (even if unchanged)
  last_downloaded_at TEXT,                 -- When we last actually downloaded new content
  last_changed_at TEXT,                    -- When content hash last changed

  -- Status
  status TEXT NOT NULL DEFAULT 'discovered', -- 'discovered' | 'downloaded' | 'unchanged' | 'updated' | 'error' | 'removed'
  error_message TEXT,                       -- Last error if status is 'error'
  download_attempts INTEGER DEFAULT 0,
  consecutive_errors INTEGER DEFAULT 0
);

-- For finding what needs to be checked/downloaded
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_documents_last_checked ON documents(last_checked_at);
CREATE INDEX idx_documents_policy_number ON documents(policy_number);

-- Track each crawl run
CREATE TABLE crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  source_types TEXT,                        -- JSON array of which sources were crawled
  documents_discovered INTEGER DEFAULT 0,
  documents_downloaded INTEGER DEFAULT 0,
  documents_unchanged INTEGER DEFAULT 0,
  documents_updated INTEGER DEFAULT 0,
  documents_errored INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'     -- 'running' | 'completed' | 'failed'
);
```

---

## 5. Polite Crawling Rules

These are non-negotiable. Getting banned from medicaid.ncdhhs.gov kills the project.

### 5.1 Rate Limiting

- Default delay between requests to the same domain: **2 seconds minimum**
- Configurable per-domain, but **never below 1 second**
- Concurrent requests per domain: **1 (sequential only)**
- Cross-domain concurrency: Up to **3 simultaneous domains**
- Back-off on 429 or 503: Exponential backoff starting at 30 seconds, doubling up to 10 minutes, max 5 retries then mark as error
- Back-off on 5xx: Same exponential backoff pattern
- On connection timeout (30s): Retry once after 10 seconds, then mark as error

### 5.2 robots.txt

- Fetch and cache `robots.txt` for each domain at the start of every crawl run
- Respect all `Disallow` directives
- Respect `Crawl-delay` if specified (override the 2-second default if robots.txt requests a longer delay)
- User-Agent: `NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)`

### 5.3 Conditional Requests (Change Detection)

1. **First request for a new URL:** Normal GET. Store the response's `ETag` and `Last-Modified` headers.
2. **Subsequent requests for a known URL:** Conditional GET with `If-None-Match` and/or `If-Modified-Since`.
   - **304 Not Modified:** Update `last_checked_at`, status `unchanged`. No download.
   - **200 OK:** Download content, compute SHA-256, compare to stored `file_hash`.
     - Hash matches: status `unchanged`.
     - Hash differs: Save new file, archive old version, update all fields, status `updated`.
3. **No ETag/Last-Modified from server:** Fall back to hash-based change detection on every check.

### 5.4 Request Headers

```
User-Agent: NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)
Accept: application/pdf, application/vnd.openxmlformats-officedocument.*, text/html, */*
Accept-Encoding: gzip, deflate
```

No cookies, no session tracking, no JavaScript execution.

---

## 6. Discovery Logic (Per Source)

Each source module exports a `discover()` function that fetches index page(s), parses them with Cheerio, and returns an array of discovered document records.

### 6.1 Clinical Policies

1. Fetch `https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies`
2. Parse HTML with Cheerio
3. Find all `<a>` tags where `href` contains `/download` under the policies section
4. For each link, extract:
   - `source_url`: full download URL (resolve relative URLs)
   - `title`: link text (e.g., "3K-2, Community Alternatives Program for Disabled Adults (CAP/DA)")
   - `policy_number`: parsed from title — part before the first comma (e.g., "3K-2")
   - `category`: the `<h3>` heading above the link group
5. Return with `source_type: 'clinical_policy'`

**Edge cases:** Both `/media/{id}/download?attachment` and `/{slug}/download?attachment` patterns are valid. Link text format varies — handle gracefully.

### 6.2 Bulletins

Most complex source — spans multiple pages and formats.

- **Current bulletins:** Fetch main bulletin page and paginated blog listing. For each post page, find PDF download links.
- **Monthly digests:** Fetch digests page, find PDF links.
- **Archives (2016+):** Fetch yearly archive pages, find PDF links directly.
- **Archives (pre-2016):** Fetch archive index pages with expandable year sections.

**Strategy:** Start with current bulletins and monthly digests (configurable via `--since-year`, default 2018). Backfill archives later.

### 6.3 State Plan Amendments

1. Fetch `https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices`
2. Find links to yearly SPA listing pages
3. For each yearly page, find PDF download links
4. Extract SPA number from title (e.g., "SPA 24-0001")

### 6.4 Waivers

Seed-list approach — less structured than other sources:

```typescript
const WAIVER_SEED_URLS = [
  'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver',
  'https://medicaid.ncdhhs.gov/beneficiaries/1915i',
  // CAP/DA and TBI waiver pages
];
```

For each seed page: fetch, find PDF download links, extract available metadata. This source will need manual curation. The registry supports manually inserting document records via `add-url` CLI command.

---

## 7. Download & Storage

### 7.1 File Naming

Files stored under `data/documents/{source_type}/`:

```
data/documents/clinical-policies/3K-2_community-alternatives-program-disabled-adults-capda.pdf
data/documents/bulletins/2026-02_medicaid-bulletin.pdf
data/documents/state-plan-amendments/SPA-24-0001_assertive-community-treatment.pdf
data/documents/waivers/innovations-1915c-waiver-application.pdf
```

Rules: lowercase, hyphens for spaces, no special characters, prefix with policy_number if available, max 100 characters, numeric suffix on collision.

### 7.2 Streaming Downloads

Using `undici.request()` to stream file content directly to disk via pipeline, avoiding buffering large files in memory. Max file size: 50 MB (log and skip anything larger).

### 7.3 Version History

When a document's content hash changes:
1. Move old file to `data/documents/{source_type}/.versions/{filename}.{timestamp}.pdf`
2. Download new file to original path
3. Update registry

`.versions/` is for debugging and auditing — not part of downstream pipeline input.

---

## 8. CLI Interface

Built with `commander`. Subcommands:

```bash
# Full crawl — discover and download everything
npx tsx src/index.ts crawl

# Crawl specific source(s) only
npx tsx src/index.ts crawl --source clinical_policy
npx tsx src/index.ts crawl --source bulletin --since-year 2020
npx tsx src/index.ts crawl --source state_plan_amendment,waiver

# Check for updates only (conditional requests, no new discovery)
npx tsx src/index.ts check

# Show registry stats
npx tsx src/index.ts stats

# List documents with filters
npx tsx src/index.ts list --source clinical_policy --status downloaded
npx tsx src/index.ts list --status error

# Manually add a document URL to the registry
npx tsx src/index.ts add-url "https://example.com/some-policy.pdf" --source waiver --title "CAP/DA Amendment 2025"

# Export registry to JSON
npx tsx src/index.ts export --output registry.json

# Dry run — discover documents but don't download
npx tsx src/index.ts crawl --dry-run

# Update HTML fixtures for parser tests
npx tsx src/index.ts update-fixtures
```

---

## 9. Logging & Observability

### 9.1 Console Output

Running summary during crawl:

```
[14:32:01] Starting crawl run #12
[14:32:01] Fetching robots.txt for medicaid.ncdhhs.gov... OK (Crawl-delay: none)
[14:32:03] Discovering clinical policies... found 124 documents (3 new)
[14:32:05] Discovering bulletins (2020+)... found 87 documents (2 new)
[14:32:15] Downloading 3K-2 (CAP/DA)... 304 Not Modified
[14:32:17] Downloading 8A (Enhanced MH/SA)... updated (hash changed)
[14:32:19] Downloading SPA-24-0015... new document (245 KB)
...
[14:35:42] Crawl run #12 complete
  Discovered: 5 new documents
  Downloaded: 5
  Unchanged: 203
  Updated: 2
  Errors: 0
  Duration: 3m 41s
```

### 9.2 Log File

Detailed logs to `data/crawl.log` (append mode): every HTTP request (URL, method, status code, response time, content-length), every registry update, errors with stack traces, rate limit delays applied.

### 9.3 Error Handling

- **Transient errors (5xx, timeout, connection reset):** Retry with exponential backoff. After max retries, mark as `error`. Continue crawling.
- **Client errors:** 404 → `removed`. 403 → log prominently, mark as `error`. Others → `error`.
- **429 Too Many Requests:** 30s minimum backoff. More than 3 in a single run → pause entire crawl 5 minutes + warning.
- **Parse errors:** Log with full HTML snippet, skip that section, continue.
- **Never crash the entire crawl run because of a single document error.**

---

## 10. Configuration

```typescript
export const config = {
  // Paths
  dataDir: './data',
  documentsDir: './data/documents',
  dbPath: './data/crawler.db',
  logPath: './data/crawl.log',

  // Rate limiting
  defaultDelayMs: 2000,
  maxConcurrentDomains: 3,
  requestTimeoutMs: 30000,
  maxRetries: 5,
  backoffBaseMs: 30000,
  backoffMaxMs: 600000,

  // Crawl scope
  defaultSinceYear: 2018,

  // User agent
  userAgent: 'NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)',

  // File limits
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
  maxRedirects: 5,

  // Sources
  sources: {
    clinical_policy: {
      indexUrl: 'https://medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies',
      enabled: true,
    },
    bulletin: {
      indexUrl: 'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin',
      digestsUrl: 'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-digests',
      archiveBaseUrl: 'https://medicaid.ncdhhs.gov/providers/medicaid-bulletin/medicaid-bulletin-archive',
      enabled: true,
    },
    state_plan_amendment: {
      indexUrl: 'https://medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices',
      enabled: true,
    },
    waiver: {
      seedUrls: [
        'https://medicaid.ncdhhs.gov/beneficiaries/nc-innovations-waiver/information-providers-nc-innovations-waiver',
        'https://medicaid.ncdhhs.gov/beneficiaries/1915i',
      ],
      enabled: true,
    },
  },
};
```

---

## 11. Testing Strategy

### 11.1 Unit Tests (vitest)

- **Registry CRUD:** Insert, update, query, dedup logic against an in-memory SQLite instance
- **Discovery parsers:** Saved HTML fixtures from each index page. Test correct extraction of URLs, titles, policy numbers, categories. If HTML structure changes, these tests fail immediately.
- **Conditional request logic:** Mock HTTP responses (200, 304, 404, 429, 500) and verify correct registry state transitions.
- **File naming:** Slugification, collision handling, path construction.

### 11.2 Integration Tests

- **Single-document roundtrip:** Discover a known clinical policy URL from the live site, download it, verify it's a valid PDF, verify registry state.
- **Change detection:** Download a document, re-run check, verify 304/unchanged behavior.

### 11.3 HTML Fixture Strategy

Discovery parsers are the most fragile part. Mitigation:

1. Save snapshot of each index page HTML as a test fixture during first successful crawl.
2. On subsequent crawls, compare structural signature (number of links found, expected CSS selectors) to fixture. Log loud warning if structure has changed significantly.
3. Easy fixture update: `npx tsx src/index.ts update-fixtures`

---

## 12. Crawl Modes & Scheduling

### 12.1 Full Discovery Crawl

Fetches all index pages, discovers all document links, downloads anything new or changed. Run weekly.

### 12.2 Update Check

Skips discovery. Conditional requests for all known documents. Faster. Run daily.

### 12.3 Scheduling (Out of Scope for v1)

Run manually or via cron:

```cron
# Daily update check at 6 AM ET
0 6 * * * cd /path/to/crawler && npx tsx src/index.ts check >> data/cron.log 2>&1

# Weekly full crawl on Sunday at 2 AM ET
0 2 * * 0 cd /path/to/crawler && npx tsx src/index.ts crawl >> data/cron.log 2>&1
```

---

## 13. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| IP ban from aggressive crawling | 2s delay, single concurrency, robots.txt compliance, identifiable user-agent with contact URL |
| Index page HTML structure changes | Fixture-based regression detection, loud warnings, easy fixture updates |
| Government site goes down / returns errors | Exponential backoff, never crash the run, retry on next crawl |
| PDFs behind redirects or auth | Follow redirects (up to 5 hops). Auth required → log and flag for manual handling. |
| Duplicate documents at different URLs | SHA-256 content hash. `source_url` is UNIQUE but two URLs can share `file_hash`. Surface these for manual review. |
| Very large files | 50 MB max. Log and skip anything larger. |
| Link rot (404s on previously good URLs) | Track as `removed`. Don't delete the local file. |

---

## 14. Success Criteria

1. `npx tsx src/index.ts crawl --source clinical_policy` discovers and downloads all ~120+ clinical coverage policy PDFs.
2. `npx tsx src/index.ts check` after a successful crawl produces zero downloads (304 or hash-match).
3. SQLite registry contains accurate metadata for every downloaded document.
4. `stats` command shows complete summary with zero errors.
5. No 429s or IP bans during testing.
6. Second full crawl completes in under 10 minutes (most documents unchanged).

---

## 15. Future Enhancements (Not for v1)

- RSS/Atom feed monitoring for policy updates
- Email alert parsing (NC Medicaid provider alert system)
- NCTracks provider manuals (nctracks.nc.gov)
- Diff reporting when documents change
- Webhook/notification on new or changed documents
