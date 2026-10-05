# Working artifact from the crawler reviewer

### A. Document status transitions as implemented

| From | Event | To | Where |
| --- | --- | --- | --- |
| (none) | URL returned by discovery | `discovered` | registry.ts:117 |
| any | URL returned again by discovery | unchanged status; title, policy_number, category refreshed | registry.ts:120-123 |
| `discovered` | download accepted | `downloaded` | sync.ts:79-85 |
| downloaded, updated, unchanged, error | 304, or 200 with the stored hash | `unchanged` (stored file not checked; validators not refreshed) | downloader.ts:376-392, 498-501 |
| same | 200 with a different hash | `updated`; old file moved to `.versions/` | downloader.ts:516-525 |
| same | HTTP 404, first or second in a row | `error`, streak + 1 | registry.ts:197-206 |
| same | HTTP 404, third in a row | `removed` (never checked again) | sync.ts:111-112 |
| same | any other failure | `error`, streak reset | registry.ts:184-193 |
| removed, error, discovered | `reactivate-source --apply` | `downloaded` | reactivate.ts:109-113 |
| any non-removed | `reconcile --repair` finds file missing or hash mismatch | `error` (validators kept) | reconcile.ts:93-114 |
| any | URL no longer on its index page | no transition exists | finding 1 |

### B. Measurements

Registry and log figures come from the workstation copy, which an older crawler build wrote; live figures were taken on 2026-10-04.

| Measure | Value | Source |
| --- | --- | --- |
| Bulletin listing, posts parsed on page 1 | 10 (fixture), 0 (live) | repo parser, scratch run |
| DHHS index documents listed | 1,230 (03-28), 1,037 (09-05), 920 (live) | crawl.log, live fetch |
| Active dhhs_policy rows / not on live index | 1,209 / 308 | registry copy vs live index |
| Title groups with a de-listed active sibling | 51 (60 rows) | same |
| Full crawl duration | 2.4 to 8.7 h | crawl_runs |
| crawl_runs still `running` | 6 of 26 | crawl_runs |
| medicaid.ncdhhs.gov daily check, 200 vs 304 | 1857/1262 (08-20), 2906/224 (09-10), 2970/163 (10-01) | crawl.log |
| Active documents and bytes on that host | 3,128 / 2,676 MB | registry copy |
| Stored ETags with a `:dtagent` suffix | 1,828 of 1,889 | registry copy |
| Bulletin run cost | 50 listing + 500 post pages; 361 posts without attachment | crawl.log 2026-09-05 |
| "hit page cap of 50" | 8 of 8 full runs before the listing broke | crawl.log |
| Full downloads of two 241 to 251 MB files | 174 | crawl.log |
| crawl.log size | 191,662,699 bytes, 1,235,981 lines | filesystem |

### C. Reproduction scripts

All are in `<review scratch directory, not kept>/crawler`. Each imports the repo's real modules and must run with `CORPUS_DATA_ROOT` pointed at a scratch directory, otherwise the logger writes to `packages/crawler/data/crawl.log`. Those that open SQLite need Node 22 (`/Users/jkh/.local/bin/node`).

| Script | Shows |
| --- | --- |
| `live-bulletins.ts` | listing parser: 0 posts live, 10 on the fixture |
| `dhhs-delist.mts` | live index vs active registry rows |
| `verify-sync.mts` | deferred registry writes; empty discovery counted as success; three 404s in 1 ms |
| `verify-downloader.mts` | unchanged without a file; empty, PNG and gzip payloads accepted; malformed filename rejected |
| `verify-fetcher.mts` | declared-oversize body fully read; redirect-to-404 status; robots 503 fail-open; veto retried |
| `live-parsers.mts` | clinical, fee-schedule and state-plan parsers against live pages |
| `ooxml-header.mts` | file-type detection from the first 4,100 bytes of local corpus files |
