# Offline embedding repair — October 3, 2026

The bounded contextual planner repairs the oversized-input defect without changing source bodies. Qualification remains **NOT_ASSESSED**, readiness **NO_GO**, and approved API spend **$0**. Agency inquiries remain unsent. [Draft PR #204](https://github.com/Queen-City-Cortex/medicaid-agent/pull/204) is stacked on #203; nothing is merged, deployed or activated.

## Measured result

The [full read-only inspection](inspection-completion.json) reuses the retained preparation graph, verified dump and source snapshot. The complete source snapshot, including approved scopes, matches before and after; raw registry hashes also match and nonempty WAL/journal files are refused at both ends. Imported modules match sealed hashes and all pipeline Python files in the contained image match the checkout. The [image attestation](image-attestation.json) identifies the exact code and frozen dependency base. This source image was built from a previously completed production dependency image, rather than rebuilding unchanged dependencies; CI separately checks the standard production Dockerfiles.

[Volume](embedding-volume.json): 59,415 nonempty sections and 11,731 empty sections; 384,073 planned inputs; maximum 9,000 UTF-8 bytes, including context and overlap; **zero oversized inputs and zero whitespace-only body/novel-body inputs**. All 59,415 nonempty section bodies reconstruct exactly. Two complete offline measurements produced identical volume, family counts and plan-text fingerprint. [Identity mapping](identity-summary.json) remains **99/99**; raw mapping evidence stays private. These are preparation checks, not answer evaluations or live qualification evidence.

The planner preserves document and ancestor headings, bounds context to 4,500 bytes and overlap to 500 bytes, splits on paragraph/newline/whitespace/codepoint boundaries, and disables provider truncation. Exact fingerprints bind text, policy, model and dimensions. Generation replaces each section plan transactionally, rejects legacy unversioned vectors and blank novel-body work before any provider call, and resumes matching missing vectors. Release coverage requires the complete exact plan with valid finite nonzero vectors. See the [runbook](../../operations/embedding-input-plans.md).

## Provenance accounting

[Five retained orphan parses](parse-provenance-reconciliation.json) remain excluded by the loader. Four are verified duplicate exclusions: exact same-family source bytes, identical Markdown and parsed JSON apart from document name/origin, valid canonical artifacts, and exactly one canonical graph document each. The fifth remains unresolved because its recorded original payload is missing and no exact registry match proves its identity. A same-name newer file is not rebound to it. No registry, parse artifact, source lifecycle state or graph document was rewritten.

## Costs and remaining prerequisites

The [updated scenario](cost-scenario.json) estimates **$34.81–$58.01** for corpus embeddings at five/three characters per token, using the earlier October 3 pricing receipt. Keeping the previous model scenario unchanged gives approximately **$164.59–$187.79** total before retries, additional tool queries and hosting. These are sensitivity estimates, not tokenizer measurements, provider limit validation or an enforceable budget. Pricing must be refreshed before paid work. Fee schedules account for 323,441 inputs and about 96% of input characters; their raw representation remains mostly whitespace/table formatting. Compaction is deferred because it would change the corpus and require separate semantic verification.

Paid qualification still needs current valid statute/federal/source inputs, reconciliation of any remaining source evidence, approved-plan binding and enforceable spending limits in its campaign runner, final catalog/legacy mapping and scope validation, matching encrypted restore evidence, a fresh normal candidate build with complete embeddings, and repeated answer evaluations. The old preparation graph is non-promotable and must not become a release candidate.

## Verification

[Checks](checks.json): Linux pipeline 645 passed, 17 skipped; dedicated empty Neo4j graph 13 passed with mocked provider calls; Ruff and Vulture passed; isolation guards 7 tests and 17 subtests passed; operations tests 16 Node tests and eight shell scenarios passed. Three Orca/Opus reviews found no P1; the final review's blank-work, module coverage and registry-bracketing findings were addressed. Paid-plan approval remains a later campaign prerequisite. Original Jev HEAD, status and all 72 pending-file hashes are unchanged. Private receipts and logs are retained with restricted permissions; earlier receipts remain untouched.

The subsequent complete Linux suite with general Neo4j enabled passes 649 tests (13 dedicated embedding tests skipped and run separately). Verbose output originally printed the 38 MB parameter as a test ID; a follow-up changes only display IDs to keep CI logs bounded. The frozen source and inspection receipts remain at their recorded implementation revision.
