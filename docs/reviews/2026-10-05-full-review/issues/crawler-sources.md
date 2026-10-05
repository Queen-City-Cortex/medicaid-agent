# Crawler and source lifecycle: all issues

Redirect hops are checked against a per-family allow-list, replaced files are archived, and retirement needs durable evidence. The weak point is that the crawler throws away or never records the signals that say a document is no longer current. The agency's own Archived tag is discarded, de-listing is not recorded, and the loader stamps every document `status="current"`, so superseded income tables, old manual versions and unapproved State Plan proposals are answerable as current policy. In the other direction, a document whose last check merely failed is dropped from the release and no gate fails. Discovery health is unobserved: a blocked index counts as success, and the bulletin listing parser matches nothing on the live site. Evidence comes from the live indexes, the workstation registry and an older local graph; production was not inspected. Fix the bulletin selector and the two title parsers first, then capture the Archived tag.

## What is working

- Redirects are followed by hand and every hop is checked against the per-family, https-only host allow-list (`packages/crawler/src/crawl/fetcher.ts:199-227`, `packages/crawler/src/corpus-manifest.ts:112-129`), with tests for off-list and suffix-confusion hosts.
- Wrapper pages are resolved to exactly one attachment and HTML articles are validated semantically before being accepted (`packages/crawler/src/crawl/downloader.ts:100-185` and `277-302`), which keeps soft-404 pages out of the corpus.
- A network error cannot retire a source through the evidence path: `packages/pipeline/src/pipeline/availability.py:109-116` counts only a direct 404 from the canonical URL, and `packages/pipeline/src/pipeline/retirement.py:203-215` requires three recorded 404s or an official withdrawal notice.
- Lifecycle mutations are dry-run by default, journaled and idempotent (`packages/pipeline/src/pipeline/source_audit.py:153-200`), and `reactivate-source` is a guarded, resumable recovery with crash-point tests (`packages/crawler/tests/cli/reactivate.test.ts`).
- Previous versions are moved to `.versions/` before replacement and never deleted (`packages/crawler/src/crawl/downloader.ts:240-254` and `516-525`), so a bad download does not destroy the last accepted file.
- `corpus-manifest.json` is the one source for allow-lists, formats and directories in both languages, and the two primary canonicalizers (`packages/crawler/src/identity.ts`, `packages/pipeline/src/pipeline/identity.py`) agreed on all 4,575 URLs in the workstation registry.

## High severity

### CRAWL-1 · The agency's Archived tag is discarded, so superseded income tables load as current

**high** · effort M · wrong-answer risk, data quality, test gap

`parseDhhsPoliciesPage` takes the first non-top-level `span[data-slug]` as the category and stores no tags (`packages/crawler/src/sources/dhhs-policies.ts:86-95`); the loader stamps every document `status="current"`. On the live index fetched 2026-10-05, 137 of 921 rows carry the agency's Archived tag, including the year-titled income and reserve tables through 2025; 129 are loadable on the workstation. In a fixture probe, the coverage frame for the aged, blind and disabled income limit held the archived 2021 to 2023 tables beside the undated MA-2252, all marked current, and dropped the top-scoring 2026 table.

**Impact.** A case manager asking for a current income or resource limit can be given a superseded year's figure. The verifier checks grounding, not currency, so that answer would be released.

**Fix.** Read `doc_tags` separately from categories in the parser and store them in the `source_listings` side table shared with the de-listing fix, overwriting on each successful parse. In the loader set a boolean `Document.archived` and `status='archived'`, leaving `answer_ready` untouched. Exclude archived documents in the retrieval backends and coverage-frame routing, and sort them last in `lookupPolicy`. Add a tagged-row parser fixture test, a loader test, and a policy-corpus test that the 2025 MAGI scope question still returns `MA-3321-1.pdf`.

*What is and is not established: Frame result is a fixture probe with placeholder figures; graph labels are from the older July local build. The undated MA-2252 row is untagged, so the tag is incomplete.*

Where: `packages/crawler/src/sources/dhhs-policies.ts:86`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/policy-corpus/src/scope/coverage.ts:64`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`

### CRAWL-2 · Documents dropped from the agency index stay active and answerable as current

**high** · effort M · wrong-answer risk, data quality

Discovery only adds. `upsertDiscovered` (`packages/crawler/src/db/registry.ts:120-123`) refreshes title and category but never records whether a URL is still on its index page, and the loader stamps every crawled document `status="current"`. A row leaves the active set automatically only after three 404s on its own URL, so a revision posted at a new URL leaves the old file active. On 2026-10-04 the live index listed 920 documents; the workstation registry copy (not production) had 1,209 active `dhhs_policy` rows, 308 of them unlisted, including four versions of MA-2240 Transfer of Assets.

**Impact.** An attorney asking about transfer-of-assets penalties can be answered from an older manual section presented as current.

**Fix.** Add a `source_listings` side table written by the discovery loop (`packages/crawler/src/cli/crawl.ts:66-82`); the Archived-tag fix uses the same table. Derive de-listing at read time per index page after a healthy run, and exclude de-listed `dhhs_policy` rows in the loader's `_document_exclusion_reason`. Never change `status` or create retirement evidence from the signal. Review the roughly 308 backlog rows as one release, spot-checking the administrative letters, and confirm the audit does not count the exclusion as a missing load.

*What is and is not established: Counts are from the workstation registry, not production. The two MA-2240 versions marked current are in the older local graph; whether retrieval prefers the old one was not traced.*

Where: `packages/crawler/src/db/registry.ts:120`, `packages/crawler/src/db/schema.ts:31`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/crawler/src/cli/crawl.ts:66`

### CRAWL-3 · A failed crawl check removes a document from the release and no gate fails

**high** · effort M · wrong-answer risk, release gate, data quality, test gap

Registry status `error` means the last check failed; the stored payload is kept. Nine Python files declare the active-status set with two memberships: the parser includes `error` (`packages/pipeline/src/pipeline/parse/converter.py:62`); the loader, audit and release counts exclude it (`packages/pipeline/src/pipeline/graph/loader.py:34`). The loader skips the document, the mandatory `missingAnswerReadyLoads` gate cannot see it, and the status flip changes the release-trigger hash. In a scratch run with one or two of 100 required documents in `error`, every gate passed. The committed 2026-10-03 qualification evidence skips 26 such records yet reports zero missing answer-ready loads.

**Impact.** One timeout on a clinical coverage policy removes it from the next release. Attorneys may then be answered from a neighbouring policy or not at all, and the verifier cannot detect an omitted source.

**Fix.** Define the status sets once in `packages/pipeline/src/pipeline/crawler_registry.py` and import them everywhere. The verifiers disagreed on the rest, so choose one: load an `error` row when its registry `file_hash` matches the parsed sidecar, which matches `docs/operations/corpus-parser-recovery.md:118` and lets the existing `missingAnswerReadyLoads` gate cover it; or keep excluding and add a mandatory `requiredCrawlerErrors` gate, which fires on 25 workstation rows today. The first adds no gate. Add loader, audit and release tests for `error`.

*What is and is not established: One of two verifiers rated this medium. Counts are from the workstation registry and committed qualification evidence; no answer affected by an omitted document was observed.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:34`, `packages/pipeline/src/pipeline/parse/converter.py:62`, `packages/pipeline/src/pipeline/audit.py:248`, `packages/pipeline/src/pipeline/release.py:409`

### CRAWL-4 · Bulletin listing parser matches no posts on the live site

**high** · effort S · data quality, release gate, test gap

`parseBulletinListingPage` selects `.views-row h3 a` (`packages/crawler/src/sources/bulletins.ts:26`), but the live listing now puts titles under `h2.field-content`. A live fetch on 2026-10-04 returned ten rows and the parser matched none; the checked-in fixture from 2026-03-26 still uses `h3`, so the tests pass. A zero-post first page is a debug-level `break`, so the family is still recorded as a successful discovery. The workstation log shows run #26 on 2026-09-26 parsing 0 posts, finding 96 bulletin documents against 388 on 2026-09-05, and completing normally.

**Impact.** At the next crawl, no attachment from a bulletin posted since the markup change enters the corpus, so answers about recent amendments would rest on older guidance. Monthly digest files are still discovered.

**Fix.** Select `.views-row a[href]` and keep links matching `/blog/YYYY/MM/DD/`, de-duplicated, which returns ten posts on the live page and both fixtures. Throw from `bulletinsSource.discover` when a listing page is non-200, or yields zero posts on page 1 or while a next link exists. Re-capture the fixture with `update-fixtures`, replace the March slug assertion with a shape assertion, and add tests for an `h2` row and for a 200 page with no parsable posts.

*What is and is not established: Observed against the live page on 2026-10-04 and in the workstation log. The effect on answers is inferred; no release has been built from the reduced bulletin set.*

Where: `packages/crawler/src/sources/bulletins.ts:26`, `packages/crawler/src/sources/bulletins.ts:215`, `packages/crawler/tests/sources/bulletins.test.ts:65`

### CRAWL-5 · A discovery that finds nothing counts as success and stamps the family fresh

**high** · effort M · release gate, reliability, data quality, test gap

`discoverDocuments` marks a family successful whenever `discover()` returns without throwing (`packages/crawler/src/crawl/discovery.ts:60-61`). Source modules return empty, break or skip on a 403, 404 or 410, and return whatever matches on a 200 with unrecognised markup. `crawl` then stamps `source_freshness`, even on `--dry-run`, marks the run completed and exits 0; the release gate `freshnessSlaMet` reads only that stamp. With every page answering 403, a reproduction recorded 11 of 11 families successful and three documents, all static seeds. A persistent 429 or server error does fail the family.

**Impact.** If the agency's firewall blocks the crawler or a page is redesigned, new policies stop arriving while the operator sees a completed run and the release freshness gate passes on a stale corpus.

**Fix.** Throw when a configured index or seed page is non-200 or its first listing parses to zero entries, and enforce a per-family minimum count on full runs. Stamp freshness only for passing families, never on `--dry-run`. Exit non-zero when a required family failed, with `scripts/ops/railway-corpus-job.sh` still parsing, syncing and backing up but skipping promotion. Add `discoverDocuments` tests for a 403 index and unrecognised markup, and a crawl test that a dry run stamps nothing.

*What is and is not established: Reproduced with every page forced to answer 403; no real block or redesign has occurred beyond the bulletin markup change.*

Where: `packages/crawler/src/crawl/discovery.ts:60`, `packages/crawler/src/sources/crawl-helpers.ts:43`, `packages/crawler/src/cli/crawl.ts:91`, `packages/pipeline/src/pipeline/release.py:465`

## Medium severity

### CRAWL-6 · Unapproved State Plan proposals are loaded as authoritative, current policy

**medium** · effort M · wrong-answer risk, data quality

The `state_plan_amendment` family is labelled `authoritative` and required for answering (`corpus-manifest.json:39-43`), but its one landing page mixes the approved State Plan with proposals. Of 440 active rows in the workstation registry, 187 come from proposed-public-notice pages, 152 from proposed amendments sent to the Centers for Medicare & Medicaid Services (CMS) and 28 from ten-day postings. The registry keeps each row's source page in `discovered_from`, but nothing derives a stage from it and the loader stamps every row `status="current"`, so retrieval cannot tell a proposal from approved text.

**Impact.** An attorney asking what North Carolina's State Plan covers can be answered from an amendment that was never approved, was changed or was withdrawn. No such answer was measured in this review.

**Fix.** Replace the hard-coded `status="current"` in `_build_document_bundle` (`packages/pipeline/src/pipeline/graph/loader.py:451`) with a helper that marks rows discovered from proposal, ten-day and sent-to-CMS pages `status="proposed"` (not `amendment`, which has another meaning) and `authority_tier="supporting"`, with a title fallback for index-page drafts. Penalise `proposed` wherever policy-corpus penalises `amendment`, and tell the agent to describe such documents as proposals. Add a loader test per page kind and a document-selection test, then rebuild the graph and re-run the answer evaluation.

*What is and is not established: No answer citing a proposal was measured. Counts are from the workstation registry; about 70 percent of affected titles still say notice or proposed.*

Where: `corpus-manifest.json:39`, `packages/crawler/src/sources/state-plan.ts:55`, `packages/crawler/src/sources/state-plan.ts:180`, `packages/pipeline/src/pipeline/graph/loader.py:451`

### CRAWL-7 · Crawler title parsers drop or split policy numbers, breaking lookup by number

**medium** · effort S · wrong-answer risk, data quality, test gap

`parsePolicyTitle` returns no policy number when a clinical-policy link has no comma (`packages/crawler/src/sources/clinical-policies.ts:24-27`). One of 177 policies is affected, 1A-30 Spinal Surgeries: `lookupPolicy('1A-30')` returns nothing, coverage frames drop its sections once another numbered policy qualifies, and 18 references to it stay unresolved. Separately, `parseSpaNumber` (`packages/crawler/src/sources/state-plan.ts:21-29`) stores `SPA NN-NNNN` or bare `NN-NNNN` depending on link text. In the registry copy checked 2026-10-01, 12 State Plan Amendments exist in both shapes, so a lookup returns only the documents under the spelling used.

**Impact.** An attorney asking whether Medicaid covers spinal fusion can be steered to a neighbouring policy's not-covered section. A lookup by amendment number returns the public notice or the proposed amendment, never both.

**Fix.** Add a leading-number fallback to `parsePolicyTitle` for comma-less links and log a warning for any download link left without a number. Make both branches of `parseSpaNumber` return `SPA NN-NNNN`. Replace the `toBeGreaterThan(50)` assertion with every fixture row numbered and distinct, and change the two state-plan assertions that pin the bare shape. Rerun both discoveries, fix leftover bare rows with one UPDATE, and rebuild the graph. Prefer the warning and tests to a new release gate.

*What is and is not established: The wrong-policy frame is a fixture probe with hand-set scores; which policy anchors on the real graph is unmeasured. Number-less DHHS titles (564 of 997) are not addressed.*

Where: `packages/crawler/src/sources/clinical-policies.ts:24`, `packages/crawler/src/sources/state-plan.ts:21`, `packages/crawler/tests/sources/clinical-policies.test.ts:88`, `packages/policy-corpus/src/frame/context/routing.ts:109`

### CRAWL-8 · Bulletin pagination stops at 50 pages, so older posts are never reached

**medium** · effort M · data quality, test gap

`bulletinsSource.discover` stops after `MAX_PAGES = 50` listing pages (`packages/crawler/src/sources/bulletins.ts:8`) with only a warning, long before the default `--since-year 2018` is reached. It keeps no record of visited posts, so every run re-fetches 500 post pages, at least 18 minutes of rate-limited requests. The workstation log shows the cap hit on all eight full runs through 2026-09-05, when the posts fetched dated only from 2023 to 2026. `packages/crawler/src/sources/fee-schedules.ts:60` has a similar 20-page cap that exits without logging.

**Impact.** Attachments from 2018 to early 2023 enter only through monthly digests. Posts with content only in the page body, 361 of 500 fetched, produce no document, so recent guidance can be missing from answers.

**Fix.** Stop only at the year cutoff. Record visited posts in a registry table written by `packages/crawler/src/cli/crawl.ts` with `upsertDiscovered`, and fetch a post only if unseen or under 60 days old. Raise `MAX_PAGES` well above the roughly 130 pages needed, throw when it or a non-200 listing page is hit, and make the fee-schedule cap throw. Decide separately whether to capture article HTML. Add a `discover` test covering cutoff, skip, non-200 and cap.

*What is and is not established: Measured in the workstation crawl log through 2026-09-05. The effect on answers is inferred from missing documents, not observed.*

Where: `packages/crawler/src/sources/bulletins.ts:8`, `packages/crawler/src/sources/bulletins.ts:196`, `packages/crawler/src/sources/bulletins.ts:266`, `packages/crawler/src/sources/fee-schedules.ts:60`

### CRAWL-9 · Crawler tombstones documents after three 404s, and each tombstone blocks every release

**medium** · effort S · reliability, release gate, needless complexity

`applyResult` marks a row `removed` once its 404 streak reaches three (`packages/crawler/src/crawl/sync.ts:104-112`). The streak counts attempts, not days, and includes a 404 from a redirect target or a wrapper page's attachment, which `docs/development/gotchas.md:164` rules out for reviewed availability checks. A removed row is never re-checked. Release preparation then refuses any removed row without retirement evidence, in every family (`packages/pipeline/src/pipeline/retirement.py:78-84`). The workstation registry holds 145 removed rows and no retirements table, with new tombstones as late as 2026-09-28.

**Impact.** Three reruns during an agency outage tombstone every affected document. The operator must then hand-author an evidence bundle or reactivate each one before any release can ship, even for optional families.

**Fix.** Delete the `markRemoved` branch and `notFoundRemovalThreshold`, so a 404 row stays `error`, is re-checked, and `retire-source` is the only writer of `removed`. In `downloadDocument`, report a 404 only when it came directly from `doc.source_url`. Keep `require_documented_removals` unchanged. Rewrite the three-404 test in `packages/crawler/tests/crawl/sync.test.ts` and add redirect-target and wrapper-attachment tests. Decide this together with how `error` rows are loaded, because it sends more rows into that status.

*What is and is not established: The 145 removed rows are in the workstation registry; the production registry was not inspected. The outage scenario is inferred, not reproduced.*

Where: `packages/crawler/src/crawl/sync.ts:104`, `packages/crawler/src/crawl/downloader.ts:396`, `packages/pipeline/src/pipeline/retirement.py:78`, `packages/crawler/src/config.ts:45`

### CRAWL-10 · Download guards accept empty and wrong-type payloads and buffer oversized bodies in memory

**medium** · effort S · data quality, reliability

The download path's size and type guards have holes. When `Content-Length` exceeds the 50 MB cap, `fetchFile` reads the whole body into memory before throwing (`packages/crawler/src/crawl/fetcher.ts:389`). `detectedTypeMatchesAllowedFormats` returns true for an undetected or unmapped type (`packages/crawler/src/crawl/downloader.ts:61-70`), and nothing rejects a zero-byte file. `parseContentDisposition` throws on a malformed `filename*`. Scratch runs of the real code saved an empty body over an existing PDF as a 0-byte file marked `updated`, PNG bytes as `.pdf`, and gzip bytes as `.sh`. The replaced file is archived to `.versions/` first.

**Impact.** One night of empty 200 responses turns current policy files into zero-byte documents. For optional families such as fee schedules no release gate stops it, so those documents are missing until the next crawl.

**Fix.** Replace `await response.body.text()` with `response.body.destroy()` at `packages/crawler/src/crawl/fetcher.ts:389`. Turn the unreachable size check at `packages/crawler/src/crawl/downloader.ts:404-415` into an empty-file rejection. Make the type check strict for every family, taking `.doc`, `.xls` or `.ppt` for legacy Office files from the URL or `Content-Disposition` instead of mapping `application/x-cfb`, which would rename 294 existing `.xls` files. Guard `decodeURIComponent`. Rewrite the two permissive tests and add a legacy `.xls` regression test.

*What is and is not established: Reproduced in scratch runs of the real code; the review reports no occurrence in real crawl data.*

Where: `packages/crawler/src/crawl/fetcher.ts:389`, `packages/crawler/src/crawl/downloader.ts:61`, `packages/crawler/src/crawl/downloader.ts:404`, `packages/crawler/src/crawl/downloader.ts:193`

### CRAWL-11 · A document can be marked unchanged when its stored file is missing

**medium** · effort S · reliability, data quality

`downloadDocument` returns `unchanged` when the fetched bytes hash to the stored `file_hash` (`packages/crawler/src/crawl/downloader.ts:498-501`), or on a 304, without checking that the file at `local_path` exists; only semantic HTML rows are guarded. `reconcile --repair` marks a missing-file row `error` but leaves its hash and validators, so the next check flips it back to `unchanged`. A scratch run of the real function with the file absent returned `unchanged` on both paths and left the directory empty.

**Impact.** After an interrupted run or partial restore, the registry reports documents healthy that have no payload. Release preparation still stops on a missing required payload, but recovery is a manual step per URL.

**Fix.** Compute at the top of `downloadDocument` whether the stored file exists. Suppress `etag` and `lastModified` when it does not, so a 304 cannot occur. In the equal-hash branch, when the file is absent, rename the temp file to the registered path and return `unchanged`. Add two tests beside `packages/crawler/tests/crawl/downloader.test.ts:650`: equal hash with the file missing restores it, and a row with an `etag` and no file is fetched unconditionally.

*What is and is not established: Reproduced in a scratch run of the real function; no affected row was reported in the workstation registry.*

Where: `packages/crawler/src/crawl/downloader.ts:498`, `packages/crawler/src/crawl/downloader.ts:376`, `packages/crawler/src/cli/reconcile.ts:93`, `packages/crawler/src/cli/reactivate.ts:59`

### CRAWL-12 · A third URL canonicalizer disagrees with the registry key on attachment links

**medium** · effort S · reliability, needless complexity, test gap

`retirement.canonical_url` (`packages/pipeline/src/pipeline/retirement.py:43-54`) passes the query string through, so a raw `/download?attachment` link stays as is while the crawler stores `?attachment=`. `packages/pipeline/src/pipeline/source_audit.py` compares and inserts index children in that form. On a scratch registry, classifying an index with the crawler's form was rejected; the raw form was accepted, the crawler then rewrote the row, and `validate_classifications` raised on every later registry read. About 37% of workstation registry URLs have this shape. Nothing is broken today: the one existing classification has no query strings.

**Impact.** The operator's next index classification on medicaid.ncdhhs.gov is either rejected or leaves graph loads and release builds failing until the SQLite file is edited by hand. No answer is affected.

**Fix.** Delete `retirement.canonical_url` and call `pipeline.identity.canonicalize_source_url` from `retirement.py`, `source_audit.py` and `packages/pipeline/src/pipeline/availability.py`, behind a guard that still rejects non-http schemes and userinfo. Percent-encode the path in `packages/pipeline/src/pipeline/identity.py` so raw input matches the crawler. Canonicalize evidence children once in `source_audit.py` and use that form for the comparison, lookup and insert. Replace the duplicated single test vector with one JSON vector file read by both vitest and pytest.

*What is and is not established: Latent: reproduced on a scratch registry. The one existing classification has no query string, so nothing fails until the next index classification.*

Where: `packages/pipeline/src/pipeline/retirement.py:43`, `packages/pipeline/src/pipeline/source_audit.py:93`, `packages/pipeline/src/pipeline/source_audit.py:244`, `packages/crawler/src/db/schema.ts:230`

### CRAWL-13 · Registry writes wait until a phase ends, so a killed crawl loses its bookkeeping

**medium** · effort S · reliability, test gap

`processDocuments` collects every download result and applies them to the registry only after the whole phase finishes (`packages/crawler/src/crawl/sync.ts:202-207`), while files are renamed into place as they arrive. `crawl` has no try/finally, signal handler or lock of its own, and `failCrawlRun` has no caller. On the workstation, full runs took 2.4 to 8.7 hours and 6 of 26 `crawl_runs` rows are still `running`. The comment's reason does not hold: better-sqlite3 calls are synchronous, so applying each result as it arrives is already serialised.

**Impact.** A crawl killed mid-phase leaves hours of downloads unrecorded; the next run fetches them again under `_2` names and re-parses them. Orphaned files never reach the graph, so the cost is time.

**Fix.** Apply each result with `applyResult` right after its download, outside the download try/catch, and delete the `completed` array. Wrap `crawl` in try/catch/finally that calls `failCrawlRun`, sets a non-zero exit code and closes the registry; handle SIGTERM and SIGINT, and switch `packages/crawler/src/index.ts` to `parseAsync`. Give `scripts/ops/weekly-refresh.sh` and `scripts/ops/daily-check.sh` one lock name. Add a sync test that the first document's row is updated before the second download resolves.

*What is and is not established: Run durations and the six stale `running` rows are from the workstation registry; production crawling was not observed.*

Where: `packages/crawler/src/crawl/sync.ts:202`, `packages/crawler/src/cli/crawl.ts:27`, `packages/crawler/src/db/registry.ts:486`, `packages/crawler/src/index.ts:30`

### CRAWL-14 · Stored ETag and Last-Modified values go stale, so daily checks re-download unchanged files

**medium** · effort S · cost, reliability, documentation

`markUnchanged` updates only status and counters (`packages/crawler/src/db/registry.ts:174-182`), so the stored validators are refreshed only when content changes. Once the server's values drift, every check is a full download that hashes to the stored value. On the workstation log, checks of medicaid.ncdhhs.gov returned 200 against 304 at 1,857 to 1,262 on 2026-08-20 and 2,970 to 163 on 2026-10-01, when the check took 2 hours 17 minutes against the roughly ten minutes `RUNBOOK.md:170` states. 1,828 of 1,889 stored ETags carry a `:dtagent` suffix that appears to rotate.

**Impact.** Roughly 2.5 GB a day, estimated from file sizes and the log ratio, is pulled from the one state site the corpus depends on, raising the risk of a block. No answer is affected.

**Fix.** Return the response's `etag` and `last-modified` with the `unchanged` result and have `markUnchanged` store them with `COALESCE`, so a 304 keeps the stored values; add one registry test. In `fetchFile`, omit `if-none-match` when the stored ETag contains `:dtagent` and a `lastModified` is stored. Split the run summary into new and persisting errors, so a new failure stands out from about 65 permanent ones. Afterwards confirm with the 200-to-304 ratio in `crawl.log`.

*What is and is not established: Ratios are from the workstation log. The 2.5 GB figure is an estimate, and the rotating ETag suffix is inferred from the log, not confirmed against the server.*

Where: `packages/crawler/src/db/registry.ts:174`, `packages/crawler/src/crawl/downloader.ts:500`, `packages/crawler/src/crawl/fetcher.ts:342`, `RUNBOOK.md:170`

## Low severity

### CRAWL-15 · Fee-schedule variant selection can prefer a file that cannot be loaded

**low** · effort S · wrong-answer risk, test gap

`_status_rank` (`packages/pipeline/src/pipeline/source_selection.py:304-313`) ranks `unchanged` and `updated` below `discovered`, and format outranks status, so an `error` XLSX beats a healthy PDF. On the workstation registry this affects 26 versions, all in the archive bucket, so retrieval is unaffected today.

**Impact.** If a current fee-schedule spreadsheet fails to download while its PDF companion is healthy, the only loaded copy is penalised and the previous version's rates can outrank the current ones.

**Fix.** Make loadability the first sort key in `build_source_selection_index`, falling back to all rows only when none is loadable, and rank `downloaded`, `updated` and `unchanged` equally. Use the shared active-status set to decide loadability. Change the test fixture's default status to `unchanged` and add cases for an `error` or `removed` XLSX with a healthy PDF companion.

*What is and is not established: Latent: all 26 affected versions are in the archive bucket of the workstation registry, so nothing is misranked today.*

Where: `packages/pipeline/src/pipeline/source_selection.py:304`, `packages/pipeline/src/pipeline/source_selection.py:376`, `packages/pipeline/tests/test_source_selection.py:17`

### CRAWL-16 · robots.txt is checked for three of seven hosts and the contact URL is dead

**low** · effort S · documentation, reliability

`crawl` loads robots.txt only for landing and seed hosts (`packages/crawler/src/cli/crawl.ts:33-49`), retries a failing fetch for 15 minutes, then allows everything, and never checks discovery pages. One workstation registry document sits on the four unchecked hosts. `docs/legal/terms-of-use-analysis.md` dates from March 2026.

**Impact.** A state webmaster following the User-Agent contact link gets a 404, which invites a block. The NC.gov non-commercial clause and the attorney review remain open, with no GitHub issue tracking them.

**Fix.** Move robots.txt resolution into the fetcher, per host on first use with a single short attempt, and apply Crawl-delay there for every command. Treat a client error as allow-all and a server error or network failure as a skip for that run that never counts toward retirement; decide how to treat the 302 from nctracks.nc.gov. Publish `/crawler-info`, update the terms analysis to the seven manifest hosts, and open an issue for the counsel review.

*What is and is not established: The block risk is inferred. The terms-of-use questions are open items for counsel, not findings of a breach.*

Where: `packages/crawler/src/cli/crawl.ts:33`, `packages/crawler/src/crawl/robots.ts:34`, `packages/crawler/src/config.ts:45`, `docs/legal/terms-of-use-analysis.md:4`
