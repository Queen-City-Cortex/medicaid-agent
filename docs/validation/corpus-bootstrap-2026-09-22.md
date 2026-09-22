# Corpus bootstrap preparation — 2026-09-22

The candidate has not passed release validation and has not been promoted.
Preparation started with the agent serving `legacy-20260725-ae8595c` from the
legacy Neo4j service and a clean checkout of `origin/main` (`93d9b34`), preserving
the original dirty workspace. The user subsequently merged PR #133 as `7012c5c`;
that base is now integrated into this corpus branch. Application deployments
from that merge are separate from candidate graph promotion.

## Preserved state

The corpus-job volume contains approximately 14 GB and 4,424 source files. Its
last completed crawl predates the beneficiary-guidance source family. The last
recorded parse recovery stopped after consecutive timeouts with 19 required and
283 optional unresolved files. The inactive blue graph contains 45 documents
from an unfinished build and no release marker.

A manual Railway volume snapshot was recorded before preparation (backup
`0e1a9aa3-a8fa-45e7-a4b8-949b1862d4da`, 14,488 MB referenced). Daily and weekly
backup schedules are enabled for the corpus-job, blue, and green volumes. No
active graph data or agent configuration was changed.

## Deployment and runtime findings

The first corrected image (`390e35e`) includes the 55-question versioned golden
dataset and validates it during Docker build. Both local ARM64 and Railway
AMD64 builds passed that assertion.

Railway's checked-in cron configuration overrode the service's intended
inspection command. A cron deployment reported success while its instance was
still created; starting it invoked the existing recovery mode. The supervisor
was stopped with TERM and recorded a durable interruption before replacement.
The explicit maintenance configuration (`11ddeeb`) starts `sleep infinity`
without cron. Deployment `5a411c51-b5ad-4290-89c6-ed3670a64267` uses that config;
its actual PID 1 was verified before preparation continued.

The pinned global npm's `npx` fails at startup in this image with a
`minipass-sized` constructor error, although `npm ci` succeeds. Production crawl
and evaluation entrypoints now invoke the installed `tsx` CLI through Node
instead. The image build smoke-checks this runtime.

## Evidence extraction findings

Two saved documents explain a subset of the required parse failures. Docling
retained figure labels in `pilot-region.pdf`, but default traversal skipped the
picture's children. It retained the breast/cervical-cancer application checklist
as checkbox items, which the parser and graph loader ignored. Traversing picture
children and accepting both checkbox labels preserves 411 and 2,077 characters
respectively from those exact saved document payloads.

Cache version 6 reuses valid v4/v5 payloads, whose source items are already
present. Existing v5 artifact hashes must match before migration; corrupt
artifacts cannot be made valid by recalculating their hashes. Failed and blank
parses remain eligible for retry. Parser/loader tests cover real Docling figure
and checkbox structures and cache-integrity failures.

## Source preparation

The supervised refresh uses the existing corpus writer lock and persists its
status at `/data/pipeline/run-state/bootstrap-20260922/refresh.json`, with logs
alongside it. It refreshes beneficiary guidance, clinical policies, waivers,
state-plan amendments, DHHS policies, and bulletins in order. It does not write
to Neo4j or change the agent target.

The first beneficiary page downloaded successfully. The second was rejected
because its [official heading changed](https://medicaid.ncdhhs.gov/beneficiaries/impact-hr-1-and-federal-changes-medicaid/work-and-community-engagement-requirement); the expected discovery title is updated
without changing the registered source URL. The corrected image successfully
retried this page at 21:03 UTC: one download, one unchanged page, and zero errors.
Both beneficiary pages are now available for parsing. The guarded bootstrap,
mandatory audits, and complete evaluations remain required; a successful crawl
or build alone is not a validated release.

## Code validation

After the approved policy change and integration of PR #133, the full pipeline run passed 439 tests with three integration skips; pipeline lint passed. The added checks prove that sparse-label precision no longer blocks release on its absolute value, precision telemetry and baseline regressions remain intact, and every retained evaluation gate still fails closed on low, missing, or non-finite metrics. All 11 updated beneficiary-guidance evidence references resolve to nonempty sections in the freshly parsed official pages, and the 55-question dataset passes schema validation. All 239 crawler tests, the crawler TypeScript build, its separate test typecheck, and crawler lint passed inside the production dependency image. Local host-wide crawler tests were unusable because the shared native SQLite module has a different Node ABI and sandboxed network-listen tests are prohibited; shared dependencies were left untouched.

## Benchmark evidence refresh

The five beneficiary-guidance cases still used pre-migration `url-...` document
IDs, and their July ordinal section references no longer matched the current
pages. Both official pages were fetched and parsed with the production image on
September 22. The work-guidance page reports August 31 as its modification date.
Cases q-051 through q-055 are version 2 with current URL-derived IDs and inspected
evidence bodies. Their questions, expected answers, and safety acceptance
criteria are unchanged. The updated references cover exception criteria and DSS
confirmation; non-citizen categories and qualified help; notices and appeals;
prompt notice response; and the general start date, thresholds, and exceptions.
These references still need to pass the candidate graph's full evaluations.

The retrieval evaluation bridge also uses the installed `tsx` CLI through Node,
matching the repaired crawler and answer-evaluation entrypoints.

## Required-file diagnosis

The required-file inventory includes genuine large-PDF timeouts, figure/checkbox
extraction failures, and seven HTML pages that an old crawler saved with PDF
extensions. A bounded DHHS wrapper resolver now follows exactly one allowed
binary attachment from a matching official document body. It preserves the
registered wrapper URL, archives the invalid old payload, and applies normal
redirect, size, and content checks. A live isolated run recovered the real
93,166-byte MA-3321 income-limit PDF from its official wrapper. All 239 crawler
tests, its TypeScript build, and lint pass after this change.

Four old form URLs currently return HTTP 404, one Gujarati form page has no
attachment, and an old COVID standing-order URL redirects to a general COVID
page. These remain source-recovery issues; no mandatory release gate or source
status was bypassed. The amendment refresh completed with 11 new downloads,
429 unchanged documents, and nine download errors. The DHHS refresh then
completed with 61 downloads, 1,129 unchanged documents, and 122 errors. The final
bulletin stage completed at 20:49 UTC with 176 unchanged, four updated, and 25
errored documents. Failed downloads remain visible in the registry.

The final packaging audit also found the versioned CFR supersession map excluded
by the data ignore rule. The image now includes this small reference directory
and asserts the rules load during its build; otherwise the resolver silently
uses an empty map and loses federal supersession edges.

## Approved release-policy correction

The previous release policy required `retrievalPrecision >= 0.9`, while the
current 55-question benchmark labels only 1–5 relevant sections per question
(mean 2.09). With the default ten returned results per question, even perfect
retrieval of every labeled section has a mean precision ceiling of 0.2091. The
existing milestone retrieval result reports precision 0.152. This threshold
cannot be treated as evidence of a retrieval regression.

The user approved removing the incompatible absolute precision gate on
September 22. Policy version 2 keeps precision in telemetry and baseline
comparisons and retains the 0.9 recall, 0.95 primary-hit, answer-quality,
grounding, and aggregate-regression gates. The server-enforced answer release
gate is unchanged. Required source failures still block corpus promotion.

A read-only check found all 72 non-federal state-manual benchmark references in
the existing parsed artifacts. Two have the previously known heading-only
bodies. This is an input check during refresh, not proof of final graph validity.
Strict parse preparation, graph validation, full candidate evaluations, and
the merged answer gate's candidate verification comparison remain outstanding.
The legacy graph remains the active corpus; no candidate graph has been promoted.


## Corrected-image recovery

Clean commit `358237d8a9c405326effe3de78320c423ff33058` was uploaded only after
source refresh completed and the writer lock was confirmed free. Deployment
`3644ce18-bb4d-4d62-a410-ed2fc91fcf5d` succeeded with the maintenance config,
`buildOnly: false`, PID 1 `sleep infinity`, no cron, and release policy version 2.
The original workspace and active graph were preserved.

Isolated production-image retries recovered both pilot-region maps, both
breast/cervical-cancer checklist forms, and the 109-page 2024 HCBS member-experience
report. The report produced 113 sections and 17 tables in 412 seconds of parsing.
All five had successful answer-ready metadata without quality flags.

Their hosted import required matching source hashes, cache version, parser and
lockfile fingerprints, metadata hashes, and JSON/Markdown hashes. It acquired
the corpus writer lock, archived the previous artifacts, and used the parser's
normal atomic save path, preserving the previous attempt in total count 2.
Import audit `143281559aac41d1bed768e12feab7eb` is retained under
`pipeline/run-state/bootstrap-20260922/parse-imports` on the corpus volume.
Temporary-storage checks proved repeat imports do not increment attempts,
corrupt artifacts are rejected, and a competing writer lock prevents import.

The corrected hosted downloader recovered MA-3321 while preserving its source
identity. Four obsolete form wrappers remain HTTP 404 (two consecutive checks);
the Gujarati form and two newly discovered 2025 income-limit wrappers contain
no attachment. An archived COVID guidance attachment was rejected by the source
allowlist. No errors were cleared or sources manually marked removed.

The supervised recovery now parses new required-family inputs and beneficiary
guidance under the writer lock. It records per-file results, pending local
recoveries, and invalid upstream payloads in `new-input-recovery.json`, with a
two-hour batch bound and per-file bounds. Separate local production-image runs
continue the remaining timeout recoveries; the 1,717-page full state-plan PDF
has an explicit three-hour bound. Incomplete parsing is not release approval.

Both application services deployed merged PR #133 successfully. An authenticated
production EPSDT smoke passed with 1,375 answer characters, seven tool steps,
and five cited sources. Server logs confirmed a corrected release after two
verification passes (21,030 ms); production health still identifies
`legacy-20260725-ae8595c`. That smoke also exposed a misleading legacy label for
corrected answers, fixed separately in PR #135 with 281 web tests, 39 mocked
browser checks, and all CI checks passing.
