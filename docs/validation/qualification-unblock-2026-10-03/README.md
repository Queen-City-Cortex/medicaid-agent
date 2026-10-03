# Qualification unblocking — October 3, 2026

**NO_GO for candidate qualification.** The bounded identity query and current CFR fetch fallback are demonstrated. Both required statute subchapters remain unavailable through the normal fetch route, independently reproduced by the developer. The [result ledger](result.json) distinguishes completed repairs from deferred gates. [PR #199](https://github.com/Queen-City-Cortex/medicaid-agent/pull/199) remains open; no graph activation, scheduling or agency outreach occurred.

## Completed work

[PR #202](https://github.com/Queen-City-Cortex/medicaid-agent/pull/202) merged as `0facaf0`; Railway skipped its documentation-only deployment. The deployed agent still uses ownership fix `d9354a6`. The [existing acceptance](https://github.com/Queen-City-Cortex/medicaid-agent/blob/eaf349224910d875955b692d5ee1801ed8203ef4/docs/validation/chat-ownership-acceptance-2026-10-03/README.md) supplies two-account ownership checks, the fixed 3/3 HTTP batch, browser persistence/feedback/logout, and retained failures. It is reused, rather than represented as another new batch. Fresh [configuration and readiness checks](current-runtime.json) matched that deployment and `legacy-20260725-ae8595c`.

Identity normalization now selects at most 50 node IDs before fetching bodies, uses a read-only session with a fetch size of ten, and compacts bodies into the previous matching signatures. Lightweight whole-graph checks reject duplicate IDs and multiple document/parent/sibling relationships before large joins. A second complete content/topology hash scan rejects changed or interrupted reads. No catalog filtering, title matching or altered missing-evidence semantics was introduced; the v1 evidence format is unchanged.

Two live read-only checks completed in 78.3 and 74.8 seconds across all 67,457 mappings. Both mapped 90 of 99 diagnostic identities, retained nine misses, found zero ambiguity, and produced mapping hash `ae0070f890dfeb0b652af3aab1431a548ad71a40b4c7b8d3bd8bb779d952c6ff`. [Both receipts and unchanged graph summaries](complete.json) are retained. This catalog uses old federal inputs and is diagnostic evidence, not release qualification or benchmark scores.

The CFR client validates cached/fetched content before use or atomic replacement. When the primary endpoint fails, it downloads official current GovInfo title XML once per needed title, checks its title header, extracts exactly one configured part, and normalizes `§`/`§§` markers without discarding reserved ranges. All [43 configured parts passed live refresh and parsing](federal-probe.json). Original [title payload hashes](federal-original-payloads.json) match every extracted part and remain privately retained. Retrieval URLs, source hashes, timestamps and Last-Modified values are embedded in the extracted XML; annual editions and invalid responses are not substituted.

## Verification and retained failures

Frozen implementation `aa697ed7d8b7806e7c72aa1db5b37e6ecc3156e3` passed 605 macOS pipeline tests with five skips, all 610 Linux pipeline tests with real Neo4j integration, Ruff and Vulture. The separate real-Neo4j identity suite passed 12 tests; a frozen previous-implementation oracle retains identical mapping evidence. [CI](code-checks.json) passed technical tests, mocked E2E, Docker builds and review checks. The production pipeline image passed build and [664 tracked file/hash comparisons](image-source.json), with zero mismatches.

Earlier failures remain accounted for: the first CFR probe rejected eight reserved ranges; the first full test run selected the newly added oracle as a Docling fixture; and initial disposable Neo4j startup failed before Bolt became available. Corrections and subsequent complete passing checks are recorded separately, without replacing qualification attempts. See the initial [CFR receipt](federal-probe-initial.json) and verification logs.

One new review comment challenges the 64 MiB response bound. The configured current title files are 2,880,742, 23,040,499 and 13,788,852 bytes and all 43 configured parts passed. The bound is intentionally fail-closed; oversized future inputs require investigation, not an implicit unbounded download. This review thread remains open for review, and its successful check status is not represented as unconditional approval.

## Deferred qualification and resumption

The [manual-search packet](manual-search.md) records exact official URLs, observed maintenance responses, required parser anchors and an unqualified alternate-source lead. The [developer screenshot receipt](manual-browser-check.json) retains its hash and distinguishes visible maintenance from an unseen URL. Three ordinary searches and four ordinary scrapes used the ten-credit gross budget; no Firecrawl Agent job was started.

Federal probes used a private partial cache staging directory, not a complete restored corpus. Complete restore, required-family discovery refresh, strict parsing, new scope approvals/backups, candidate build, three paired 55-question runs and 48 scope checks were **NOT_RUN** after the federal prerequisite failed. The previous complete encrypted archives, scoped corpus and all unavailable originals remain untouched. Fresh source preparation will invalidate old scope approvals; restore a tested pre-scope copy and reapprove instead of deleting or editing those records.

Resume once valid current statute content is available: recheck all federal inputs, refresh the five previously stale required families, finish strict preparation, freeze code/sources/configuration and produce matching tested backups and approvals. Only then build and qualify the candidate with the existing unchanged benchmark and release gates. Production remains on legacy; root pending files and the separate preparation/ownership worktrees were preserved.

## Durable retention and cleanup

The [encrypted private evidence publication](publication-qualification-unblock-private-evidence.tar.gz.age.json) retains raw public-source payloads, diagnostic mappings, research responses, the supplied screenshot and failure logs under an append-only evidence key. Its downloaded ciphertext byte count and SHA-256 matched the uploaded artifact. This is an evidence archive, not a complete corpus backup; no new decryption or corpus-restore result is claimed. Credentials were excluded. Existing objects and the production corpus mirror were not changed. The [cleanup receipt](cleanup.json) records removal of the owned disposable database/network and remote staged credentials; retained originals and other worktrees remain available.

The [public report bundle](publication-qualification-unblock-public-report.tar.gz.json) was independently uploaded and downloaded with matching bytes. Its publication receipt is retained in Git separately from that bundle.
