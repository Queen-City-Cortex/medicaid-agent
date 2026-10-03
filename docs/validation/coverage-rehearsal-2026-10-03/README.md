# Bounded coverage rehearsal — October 3, 2026

**NO_GO for candidate qualification.** The isolated scope rehearsal passed, but fresh federal content, required-family discovery freshness and the legacy identity preflight remain unresolved. No candidate graph was built, no benchmark scores are claimed, and no corpus cutover or scheduling occurred.

Implementation: [PR #199](https://github.com/Queen-City-Cortex/medicaid-agent/pull/199), frozen at `46a91dae97964e2d1c075d178f78f41b347a64b8`, incorporating main `d9354a604002f0f1d06503ff54b504fb791500f7`. PR #199 remains open. The [result ledger](result.json) distinguishes completed work from deferred gates. The [scope procedure at this revision](https://github.com/Queen-City-Cortex/medicaid-agent/blob/46a91dae97964e2d1c075d178f78f41b347a64b8/docs/operations/answer-coverage-scope.md) governs its approval and acceptance requirements.

## Completed preparation and repairs

The complete encrypted production archive was decrypted through the existing macOS Keychain identity, materialized into a private isolated corpus, and checked against production snapshot `sha256:0e062b4bfed56f6241841b0fc4135b18105cab118493063069a8db1156e2add5`. Original payloads, registry rows, retirement/classification history, availability observations and relocation proof were retained. Two historical diagnostic dependency symlinks remain in the original encrypted archive and were omitted from the working copy; neither supplies corpus evidence.

The normal crawler downloaded the full September 25, 2024 COVID bulletin, and the normal HTML parser produced eight sections. Its retained payload is `sha256:b5baaffa7dc692b00649a699aa4b0e7941faf7674be46d8c6f0c70bf510d54b4` (65,302 bytes). Preparation exposed and repaired three integration problems:

- The official Drupal page associates its heading with the enclosing `main`, rather than placing it inside the article. The downloader now accepts that explicit, unambiguous association and still requires the reviewed OTC-testing heading and coverage-end statement inside the article body.
- Scope dependency checks looked for bare HTML stems, while the parser writes `__html` artifacts. A shared lightweight naming helper and an actual-parser regression now keep approval and backup checks aligned with ingestion.
- The federal statute fetcher accepted HTTP 200 maintenance pages and overwrote valid cached text. It now requires substantive statutory anchors, retries invalid caches through a fresh fetch, and preserves previous bytes and timestamps when the response is rejected. Failed CFR/SSA operator imports exit nonzero.

PR #199's frozen revision passed CI, mocked end-to-end tests, production Docker builds and both review checks. Local verification passed 580 pipeline tests (four skipped), Ruff, Vulture, 431 agent tests (ten skipped) and the agent build. [Check receipts](final-code-checks.json) and [528-file image/source verification](final-frozen-image.json) identify the tested revision. Unit and fixture checks do not establish live candidate acceptance.

Full parser preparation was operator-stopped after the federal prerequisite failed. It had recorded one successful parse, 2,213 cached skips, seven errors and one 600-second timeout; it did not complete its selected 4,504 inputs. SIGINT did not terminate the container, so the owned container was stopped with Docker's ten-second timeout. Its original run state and logs remain retained; the final counts come from a separate complete inventory, not unfinished run-state placeholders. See the [stop receipt](parser-stop.json).

## Isolated scope approval

The pre-scope archive passed native decryption/restore verification. Validation and application independently rechecked that retained archive; the reviewed case flags attest implementation review and do not claim live graph results. Application wrote four durable scope rows. Replay returned `already_applied`.

| Inventory | Before scope | After scope |
| --- | ---: | ---: |
| Active sources | 4,404 | 4,404 |
| Unresolved required sources | 4 | 4 |
| Approved scoped required failures | 0 | 4 |
| Blocking required failures | 4 | 0 |
| Optional failures | 312 | 312 |
| Undocumented removals | 0 | 0 |

There are 4,217 answer-ready documents. The [inventory summary](inventory-summary.json) identifies both snapshots. Registry IDs 875, 1905, 11805 and 11806 remain unresolved; no source was retired or declared duplicated. The [mutation proof](scope-mutation-proof.json) confirms all eight prior database tables and 19,328 artifact files stayed unchanged during approval; only `source_answer_scopes` changed.

Disposable-copy checks rejected a [forged backup receipt and missing retained original](adversarial-scope-before.json) before writing records. A [changed unrelated answer-ready artifact](adversarial-scope-after.json) invalidated copied approvals while retaining their history. The original scoped corpus was not mutated by these checks.

## Qualification blockers and deferred gates

| Gate | Result |
| --- | --- |
| Fresh federal content | **FAILED:** 43 CFR full-text requests returned HTTP 406 locally and another 43 in isolated Railway staging. The Railway title index succeeded, but full-text access did not. Both USC subchapter responses were HTTP 200 maintenance pages with no required statutory text. Initial fetcher success claims for those pages are invalidated. |
| Required-family discovery freshness | **FAILED preflight:** clinical policy, bulletin, state-plan amendment, waiver and DHHS policy last succeeded September 22, outside their configured one/seven-day SLAs. Downloading one bulletin does not establish a complete fresh family discovery. |
| Legacy evidence identity | **FAILED infrastructure:** the full read-only normalization query exhausted Neo4j direct memory: 532,676,608 used of 536,870,912 bytes, with another 25,165,824 requested. The first attempt used `6099636`; a later attempt at final revision `46a91da` failed with a defunct Neo4j connection. Both [attempts](legacy-identity-attempts.json) remain recorded, and neither produced a complete mapping. No ambiguity/missing-identity result or benchmark score is inferred from this failed query. |
| Strict release preparation and graph build | **NOT_RUN** after prerequisite failures; the isolated graph remains empty and unmarked. |
| Three complete paired 55-question comparisons | **NOT_RUN:** zero of three pairs; no retrieval, answer, hallucination or regression scores. |
| Repeated live scope acceptance | **NOT_RUN:** zero of 48 planned results. |
| Candidate HTTP, memory, follow-ups and fresh-auth EPSDT | **NOT_RUN:** no candidate runtime existed; no live exact-text/persistence or 3/3 authentication result is claimed. |
| Activation, browser cutover and scheduling | **NOT_RUN / DISABLED.** |

The [blocker ledger](qualification-blockers.json), [family freshness diagnostic](source-freshness-diagnostic.json) and [evaluation fingerprint](final-evaluation-fingerprint.json) retain configuration evidence. The unchanged 55-question benchmark has hash `97242b70394a511ba54760468536428944c31f87d9c5c039e24c54b10677f0ff`. A diagnostic catalog contains all 99 expected identities, hash `acfeb98a087ba3875e338f27b194216596e2566237517bed5a3df65e4f3f536e`; its retained federal inputs are old and do not qualify a release.

Valid original statute bytes were restored from the verified archive. A restore-helper error initially assigned extraction-time timestamps to old cache files. All 45 original federal cache hashes and timestamps were subsequently reconciled against the original encrypted archive, without changing content bytes. CFR timestamps are April 17/July 26; statute timestamps are June 13. **The pre-scope archive's federal timestamps are materialization times, not fetch evidence.** Its [metadata reconciliation receipt](federal-cache-original-metadata.json) must accompany any reuse. The final scoped archive contains the corrected original timestamps. No freshness override or fabricated successful-discovery timestamp was used.

## Backups and production boundary

| Archive | Native restore | Snapshot |
| --- | --- | --- |
| `corpus-rehearsal-pre-scope-2026-10-03T2104Z.tar.gz.age` | [Passed](pre-scope-restore.json), zero scopes | `sha256:308f0ed764623681515bb5a1d2a64f117a3ccd58dd9d5bf992ec313c6d99912b` |
| `corpus-rehearsal-scoped-2026-10-03T2122Z.tar.gz.age` | [Passed](scoped-restore.json), four scopes | `sha256:fec98be8ff62e91817645f908bc52accb4655d8235288761ccd16a575d42fc26` |

The final restore checked 8,432 parsed artifact hashes, four scope dependencies, 152 retirement records, one classification, 36 availability observations and three relocations, with clean SQLite integrity. [Publication receipts](backup-publication.json) record unique object keys and downloaded-content hash verification; existing backups and the production mirror were not pruned or overwritten.

The [final production configuration](production-final-configuration.json) and [legacy graph read](legacy-preflight.json) confirm `legacy-20260725-ae8595c`, 6,725 documents and unchanged graph/model/provider configuration. The corpus maintenance deployment remains `9bb022f4-2ce1-4162-adb3-274f07099bd2`, `sleep infinity`, restart NEVER and no cron. This rehearsal did not mutate the production corpus or graph, stage settings, activate a candidate or send agency messages.

Separately, [PR #200](https://github.com/Queen-City-Cortex/medicaid-agent/pull/200) merged during execution and Railway automatically deployed agent commit `d9354a6` as `a23945b1-0d54-475a-b236-3520a3a95d8d`. That is an independent main deployment, not corpus activation or candidate acceptance evidence from this rehearsal.

Sanitized execution captures, failed federal-fetch observations and the retained full bulletin are download-verified at `readiness-evidence/2026-10-03/coverage-rehearsal-evidence-2026-10-03T2133Z.tar.gz`. The [publication receipt](evidence-publication.json) records its hash; credentials and decrypted backup identities are excluded.

## Resume conditions

1. Obtain substantive fresh official CFR/USC content through the normal validated fetchers. Preserve failure captures and original cache provenance.
2. Run fresh discovery for the five stale required families on an isolated corpus, review changes and complete strict parser preparation. New source/parse changes require a new tested pre-scope backup and fresh approval; do not edit or delete approval rows to bypass their snapshot guard.
3. Diagnose the legacy identity query's direct-memory exhaustion using bounded read-only diagnostics or an isolated graph copy. Establish a complete, unambiguous mapping before interpreting scores.
4. Freeze the new complete source/code/model/catalog bundle, then build and run all three paired full comparisons, the 48 scope scenarios and real candidate HTTP/memory/auth checks. Preserve every failed and successful run, followed by a matching scoped backup and durable evidence.

Issue #188 remains unqualified. Issue #187 remains open because four originals are still unavailable. These operational prerequisites can be addressed without sending the prepared agency inquiries. Activation and scheduling remain separate subsequent decisions.
