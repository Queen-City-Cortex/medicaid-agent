# Source closure follow-up — October 2–3, 2026

This cycle recovers three exact historical DHHS documents and leaves four required sources unresolved. The source gate remains **NO_GO**; issue [#187](https://github.com/Queen-City-Cortex/medicaid-agent/issues/187) stays open. Issue [#188](https://github.com/Queen-City-Cortex/medicaid-agent/issues/188) remains **NOT_ASSESSED**. No graph build, qualification, activation, scheduled crawl, or agency contact occurred.

## Source ledger

| Registry | Document | Decision and remaining action |
| --- | --- | --- |
| 875 | Pharmacist standing order for OTC COVID-19 tests | Unresolved. Original URL redirects to a generic COVID page. Obtain the exact attachment or source-specific withdrawal/supersession; a redirect does not establish withdrawal. |
| 1905 | Gujarati DHB-5097 | Unresolved. Official wrapper still lists the form but provides no attachment. Obtain the exact Gujarati payload or an official disposition. |
| 11805 | Archived 2025 MAGI income-limits wrapper, `-2` | Unresolved. No attachment or identity-bound replacement. Obtain this original payload or explicit source-specific supersession. |
| 11806 | Archived 2025 MAGI income-limits wrapper | Unresolved. A separate current 2025 MAGI document does not establish identity or supersession for this wrapper. |
| 12820 | 2020 ZixMail state-appeals attachment B | Recovered from the current official WordPress attachment; six pages, eight sections. Original archive URL remains canonical. |
| 12821 | DHB self-attestation, revised August 2020 | Recovered from the current official WordPress attachment; one page and one table. Original archive URL remains canonical. |
| 12822 | DHB AL 08-20 MAGI deductions, July 9, 2020 | Recovered from the current official WordPress attachment; two pages, seven sections. Original archive URL remains canonical. |

Official [CCU index](https://policies.ncdhhs.gov/dlp_document-doc_special_terms/ccu/) captures link the exact original archive URLs. The current wrappers link migrated payloads preserving their original basenames with the WordPress `-1` suffix. Review of the PDFs established document/revision identity. This is evidence of migration, not a byte comparison with unavailable historical originals or confirmation that historical guidance remains effective.

| Registry | Current official wrapper | Reviewed payload SHA-256 |
| --- | --- | --- |
| 12820 | [ZixMail instructions](https://policies.ncdhhs.gov/document/dhb-administrative-letter-no-07-20-attachment-zixmail-instructions-for-state-appeals-2/) | `d355ee12240ae8b0ee1a2cc9ef969a68ae443681a36786f88dc0183c7d67dc62` |
| 12821 | [DHB self-attestation](https://policies.ncdhhs.gov/document/attachment-dhb-self-attestation/) | `fabeed23c576c5b2ec27257cd517fe693cf289c5619397667d9945190cb8d409` |
| 12822 | [MAGI deductions procedures](https://policies.ncdhhs.gov/document/dhb-administrative-letter-no-08-20-procedures-for-magi-deductions-2/) | `c3e704336ea4d784c697a1e8b8c093ae17ce94e004c42e891592ca3851ea09f3` |

The source payload/disposition discovery clock ran from 02:18:49 to 03:02:03 UTC on October 3: 2,593.84 seconds within the 3,600-second limit. Later implementation, review, isolated replay, deployment and backup verification did not extend source payload/disposition discovery. Old archive-host DNS retries, mixed-family collector rejections, empty wrappers and public CMS API HTTP 403 responses were retained as observations, never applied as retirement evidence.

The three [identity manifests](identity-captures/) are versioned with this report. Their sibling capture files are retained in the evidence archive and the production `.recovery-evidence` namespace. Use a complete retained namespace for recovery replay; the Git manifests alone do not include the capture binaries.

## Application and verification

The guarded relocation operator in [PR #197](https://github.com/Queen-City-Cortex/medicaid-agent/pull/197) requires paired payload URL / identity manifest, current reviewed registry hash, a recovery ID, official family domains, exact payload hash, safe paths and preserved original identity. Capture files, identity manifests and completed/resumable journals remain durable and replayable. Reconciliation excludes retained recovery proof and preserves retired originals. Backup restoration validates proof, journal dependencies, installed payloads and later revisions independently.

Local verification: 271 crawler tests, crawler build/type checks/lint; 58 pipeline lifecycle/backup/mirror tests; Ruff and Vulture; eight supervised Linux job checks. Linux Docling parsed all three payloads without quality flags. Its eight parser/configuration fingerprints match the final operator; parse cache version is 6. The subset parsing run cannot pass a whole-corpus strict gate because other full-registry artifacts are absent; its failed receipts are retained. Import and inventory checks used the isolated full production copy.

[Final code checks](final-code-checks.json) passed on reviewed head `50cd6f6af37415d0bd9a7149c4644169dfcbf7cd`: tests, hermetic end-to-end checks, production Docker builds, Claude review and Greptile review (5/5, no remaining findings). PR #197 merged as `38335f18890f17c878383a29eec674ef066d90e7`; [CI on the merge commit](https://github.com/Queen-City-Cortex/medicaid-agent/actions/runs/37096956960) passed too.

The [maintenance deployment receipt](production-deployment.json) records clean-source deployment `9bb022f4-2ce1-4162-adb3-274f07099bd2`, a running instance, matching operator/parser hashes, actual PID 1 `sleep infinity`, restart policy `NEVER`, no cron and the expected backup recipient. All three validations passed before application; all three recoveries and parse imports then passed and replayed without incrementing their one download / one parse attempt. Recovery IDs and original identities are in the [source ledger](source-ledger.json).

| Inventory | Baseline | Final production |
| --- | ---: | ---: |
| Active sources | 4,403 | 4,403 |
| Answer-ready documents | 4,212 | 4,215 |
| Required failures | 7 | 4 |
| Optional failures | 313 | 313 |
| Undocumented removals | 0 | 0 |

The complete production source snapshot is `sha256:0e062b4bfed56f6241841b0fc4135b18105cab118493063069a8db1156e2add5`. The inventory command exits 1 for the four known blockers; this is the retained source gate result, not a failed recovery. [Preservation checks](lifecycle-preservation.json) confirm all four unresolved registry rows are unchanged, original recovered URLs remain canonical, 152 retirement records and the classification record are unchanged, and 12 availability actions retain 36 observations. All 18,064 original artifacts passed another full hash check under the backup writer lock.

The agent's [readiness response](live-readyz.json) remained healthy on `legacy-20260725-ae8595c`. This cycle changed private corpus artifacts and the maintenance operator; it did not publish a new graph.

## Durable evidence and handoff

The [fresh baseline restore](baseline-restore.json) verified `backups/corpus/corpus-2026-09-23T224334Z.tar.gz.age` against the unchanged baseline snapshot `9fd132e8ae0a9f203ca93a61b384f0443b26bcc83ce017b1e68030e0d3d61768`. A full pre-apply check verified its registry identity and all 18,064 retained artifacts.

The [new encrypted backup](post-recovery-backup.json), [download check](post-recovery-download.json), and [decrypted restore receipt](post-recovery-restore.json) verify:

- Object key: `backups/corpus/corpus-2026-10-03T045605Z.tar.gz.age`.
- Encrypted archive SHA-256: `478a581fa1f25425829aa3301d3e5c1ade7e4881de9bc68905b8d3f928ee22bd`; 2,688,632,782 bytes.
- Restored snapshot exactly matches the final production snapshot above; SQLite integrity is `ok`.
- 8,428 parsed artifact hashes, 152 retirement records, the classification record, 36 availability observations and all three relocation records checked successfully.
- The full archive contains 4,538 source/proof files, 13,008 parsed files and 4,556 registry documents. It was created under the corpus writer lock without pruning existing backups.

A guarded copy updated the current mirror and downloaded-checked all 65 staged files. This was a delta check, not a full current-mirror re-audit. No remote mirror deletion occurred; the complete matching encrypted backup is the full restore proof. Any future source mutation requires a new matching tested backup before activation.

The [evidence publication receipt](evidence-publication.json) records the download-verified archive containing government captures, the source ledger, baseline/rehearsal/production receipts and these unsent drafts. Credentials, databases and provider logs are excluded; encrypted corpus archives use their separate backup keys. Failed discovery/check receipts remain retained. The two temporary helper errors (action rows versus nested observations, and Python module-name shadowing) were corrected without changing production data.

Private baseline/final ciphertext, captures, failed receipts and verified Git bundles are retained locally. Cleanup is limited to the worktrees and private volume staging created for this cycle, after durable evidence verification; user pending files, other worktrees, existing Git refs and production source/history namespaces are preserved.

The four [unsent inquiry drafts](inquiries/) request existing public documents or source-specific publication/disposition records. The fourth is a contingency confirming the recovered archive migrations and revisions. The published central NCDHHS records channel is used for routing; specialist custodians have not been confirmed. No message was sent. The next external action is authorization to send the relevant drafts, then capture the replies as source-specific evidence before any further disposition.

Keep all four remaining sources required and preserve the 313 optional failures under existing family policy. Close #187 only when a fresh inventory has zero required failures and zero undocumented removals with a matching verified encrypted backup. Then assess #188 separately. Dependency upgrades and parser experiments remain deferred during source closure.
