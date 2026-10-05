# Working artifact from the prior-findings reviewer

## A. Ledger of previously reported findings (verified against main c48a9d4 on 2026-10-04)

Status key: FIXED+T (fixed, regression test exists) · FIXED (fixed, no dedicated test found) · PARTIAL · OPEN · NOT-DONE (claimed complete, never implemented) · REGRESSED · OBSOLETE · NRV (not re-verified).

Path note: June findings cite `packages/agent/src/processors/hallucination-verifier.ts:NNN`; that file is now an 11-line barrel over `processors/verifier/*.ts`.

### A1. RAG-faithfulness review, 2026-06-11 (14 findings)

| # | Finding | Claimed | Verified now | Evidence |
|---|---|---|---|---|
| 1 | Planner injects pre-baked conclusions | P0 4b complete | FIXED+T | answer-frame-planning.ts:466 "state the yes/no conclusion only as that text supports it"; commit b7f7c29 |
| 2 | Checklists and routing overfit to the golden set | P1 complete; held-out slice built | OPEN | Topic rules remain (answer-frame-planning.ts:176, 186-193, 366-389, 462-470, 607-615; query-intent.ts:451-496; HCWD flags across policy-corpus); held-out file unusable and outside the release gate (finding 5) |
| 3 | Verifier evidence strips citationLink, url, lastRevised, FR cite | P0 complete | FIXED+T | verifier/evidence.ts:136-139 |
| 4 | Cited-first ordering never fires | P0 complete | FIXED+T | verifier/evidence.ts:458; residual: loop breaks at the first oversize block (:476-480) |
| 5 | No per-(claim, citation) check in verifier, judge or detector | P0 complete | NOT-DONE | verify.ts:77; record-mapping.ts:129; levels/citation.py is URL-level (finding 2) |
| 6 | Undated amendment becomes authoritative; newest notice displaces the consolidated policy | P1 complete | PARTIAL | Null guard FIXED+T (amendments.ts:30); keep-base-authoritative NOT-DONE (amendments.ts:51) |
| 7 | No supersession filtering in retrieval; verifier rule missing | Explicitly deferred | OPEN, untracked | No currency predicate in any backend; loader.py:451 status="current"; verify.ts:65 is conditional (finding 3) |
| 8 | Unverified single-pass rewrite applied to every text part | P0 complete | FIXED+T | run.ts:101-141 two-pass exact-text recheck; processor.ts:87 releases only the last assistant message. `replaceFinalAnswerText` is now test-only |
| 9 | Frame prefetch forced on every turn | P1 7c complete | NOT-DONE | answer-frame-prefetch.ts unchanged since 6b42ad1 (2026-04-11) (finding 9) |
| 10 | Planner duplicates and drifts from query-intent | P1 7c complete | NOT-DONE | answer-frame-planning.ts:20-22 versus query-intent.ts:286-293; :526 `' nc '`; file grew from about 700 to 841 lines |
| 11 | Eval hallucination circular; judge sees golden; infra errors scored 0 | P0 complete | PARTIAL | Infra errors to None FIXED+T (answer.py:513-524); reference answer still in the prompt, unified evidence default (judge.py:15-16, 32; answer.py:351) (finding 7) |
| 12 | Rerank gating | P1 | OBSOLETE | LLM reranker removed in PR #71 |
| 13 | Duplicated citation spec; rule 7 versus no-widening | P1 | OPEN (low) | prompt.ts:5, :50-59, :96-105; answer-frame-planning.ts:744 |
| 14 | Avoid sections ship content and count as evidence | P1 | FIXED+T | finalize.ts:83-85 sets content null; evidence.ts:330-331 excludes avoid sections |

### A2. Remediation plan, 2026-06-11 (non-RAG items)

| Item | Claimed | Verified now | Evidence |
|---|---|---|---|
| P0-1 federal ingestion (6 defects) | complete | FIXED+T | ssa_client.py:85-89; ssa_parser.py:65-92, 115; extractor.py:46-49; resolver.py:106-111; tests in 74170f2 |
| P0-2 IDOR (resource binding) | complete 2026-06-11 | FIXED+T, but complete only on 2026-10-03 | auth-middleware.ts:59-71 (June); second path in the AI-SDK chat adapter closed by PR #200 (chat-route.ts:51-60, chat-memory-http.test.ts); execution-gateway.ts:22-35 |
| P0-3 web versus eval regime | complete | PARTIAL | Step limit shared (index.ts:199-202; no test in 5f0be15); the CLI still omits scope gate, coverage boundary, injection detector and memory by design (index.ts:143-151) |
| P0-5 tool schema strips fields; lookup example | complete | FIXED+T | tools/answer-frame.ts:31-32; tools/lookup.ts:10 |
| P0-6 eval crash, None handling, zero-citation rows | complete | FIXED+T | eval/results.py:22-55 |
| P0-6 held-out slice and re-baseline | complete | REGRESSED | heldout-paraphrase.json unchanged since 2026-06-12, legacy IDs (finding 5) |
| P0-7 feedback DELETE 204, id rotation | complete | FIXED+T | feedback/routes.ts:71; repository.ts:79-80 |
| P1-8 query-intent landmines, "one tokenized matcher" | complete | PARTIAL | Named cases fixed (query-intent.ts:18, 122, 502); includesPhrase still substring (base.ts:35-37) (finding 8) |
| P1-9 retrieval backend defects | complete | FIXED (no test in 101aa83) | section-vector.ts:9-30 overscan; concept.ts:13-15 deterministic order |
| P1-10 frame-resolution defects | complete | FIXED+T | rebalance/federal-authority.ts:104; finalize.ts:72-85; concepts.ts:14; amendments.ts:30 |
| P1-11 crawler, loader, embedding integrity | complete | FIXED+T (spot-checked) | registry.ts:240-249; downloader.ts:82-95; voyage_client.py:22-40; linker.py:15-41 |
| P1 UX defects (13) | complete | FIXED (spot-checked) | ChatInput.tsx:92, 105-115; use-pinned-scroll.ts; use-chat-thread.ts:162 |
| P2 UX upgrade (12) with two deferrals | complete; 2 deferred | FIXED, including the deferrals | MessageList.tsx:381-420; SourcesPanel.tsx:162-249; use-corpus-status.ts |
| P2 CI, deploy, hygiene | complete; e2e deferred | FIXED | ci.yml:134, 147, 170, 177-205, 221-246; deploy-data.sh:51-59; .dockerignore |
| P2 docs drift (default model) | complete | REGRESSED for the verifier | RUNBOOK.md:18, 23 say gpt-5.4-mini; verifier/config.ts:9 says gpt-5.6-terra |
| P3 refactors (7) | complete | NRV | Owned by the architecture and test-quality reviewers |
| Index of 443 findings (2 critical, 40 high, about 201 medium, 195 low) | "plan fully executed" (6f97d71) | Critical and high items sampled above; about 400 medium and low NRV | |

### A3. Product UX review, 2026-06-11 (12 items)

All twelve are implemented, including the two the plan deferred (generation timestamps, corpus as-of date). Spot-checked: stop and retry, research trail, cited versus consulted with snippets and origin badges, print stylesheet, Markdown export, IME guard, mobile Enter, pre-wrap, "Answer N of M".

### A4. QA pass, 2026-06-22

| Item | Claimed | Verified now | Evidence |
|---|---|---|---|
| F-CITE-001 footnote collapse | fixed | FIXED+T | web/src/lib/message-citations.ts:70 buildCitationResolver |
| F-AUTH-001 stale token | fixed | FIXED+T | mastra-client.ts; use-mastra-client.ts |
| F-RESTORE-001 restore fidelity | fixed 06-23 | FIXED+T (unit); e2e fixture OPEN | parse-message.ts coalescing; e2e/tests/mocked/feedback.spec.ts:95-117 is still one well-ordered message |
| F-E2E-001 rotted mocked tier | fixed | FIXED | Hermetic tier runs in CI (ci.yml:177-205) |
| N-OBS-001 featured example scores low confidence | observation | NRV (needs a paid run) | |
| G1 deep-research controller | handoff | FIXED+T by redesign | use-deep-research.ts:64, 74, 152-186, 281-310; server-owned runs |
| G2 env defaults | partly fixed | FIXED | mastra-url.ts; runtime-config.ts:134 |
| G3 swallowed or over-reacting errors | handoff | OPEN | use-chat-thread.ts:150-152, 176 |
| G4 lost input | fixed | FIXED | chat/page.tsx |
| G5 date and number guards | handoff | OPEN | thread-helpers.ts:19-36; corpus-status.ts:35; DeepResearchReport.tsx:129 |
| G6 persisted tool error state | handoff | OPEN | parse-message.ts:25 |
| G7 citation regex and flag match | handoff | OPEN | message-citations.ts:26 |
| G8 Markdown export fidelity | handoff | OPEN | thread-helpers.ts (no escaping) |
| G9 trust-UI guards | handoff | FIXED+T | DeepResearchReport.tsx:14, 64 |
| G10 feedback limits | handoff | FIXED | contracts/src/schemas.ts:20 |
| G11 theme race, unhandled rejections | handoff | OPEN | ThemeProvider.tsx:59-63 |
| G12 nits | handoff | NRV | |
| Needs-live 1 decline-then-done | non-issue | OBSOLETE | Workflow replaced by /research/runs |
| Needs-live 3 deep-research run IDOR | open question | FIXED+T | deep-research/routes.ts:34, 71, 84, 110 scope by getBoundUserId; Mastra workflow routes unreachable |
| Needs-live 2, 4-12 | open questions | 6 and 7 unchanged in code (use-answer-versions.ts:56; use-pinned-scroll.ts:34); others NRV | |

None of the open QA handoffs has a GitHub issue.

### A5. October 2 audit, triage and cleanup

| Item | Claimed | Verified now |
|---|---|---|
| 13 PR dispositions | done | Confirmed with gh: #88-91, #95-97, #101, #129, #139, #140 closed; replacements #141-143, #152, #160, #163, #166, #170-174, #178 merged |
| #113 single-pass PDF routing | draft, blocked | Still draft; CONFLICTING with main; head 1c44542 (2026-10-02); runtime gate unmet (here_3.pdf 600.28 s; 310-page report) |
| #114 chart recovery | draft, blocked | Still draft on #113; CI `test` FAILURE (three Linux failures recorded in #161); +22.8k lines |
| #161 | open | Open; no activity since 2026-10-02 |
| #144, #145, #147, #148, #149, #162 | open | Open; Dependabot PRs #164, #181, #184, #190 open and unmerged |
| #199, #204, #206, #207 | open at time of reports | #199 merged 2026-10-04; #204, #206, #207 closed, superseded by #208 |
| Private recovery bundle containing credentials | local only | `.local-recovery/` is gitignored (.gitignore:32) and present |

### A6. Readiness blockers, October 2-4

| Blocker | Claimed | Verified now |
|---|---|---|
| #185 observational-memory failure, 3/3 batch | closed 10-03 | Startup guard present (chat-memory.ts:17-21); HTTP regression test exists; the acceptance receipt predates PRs #199-#214 |
| #186 logout | closed 10-02 | Dashboard setting; not verifiable from code |
| #187 four required sources | open | Open; scope machinery merged (#199, #208); per the fee-compaction report the rehearsal approvals are void; production scope not applied (per docs) |
| eCFR 406 (43 parts) | failing in the #188 body | Worked around: the GovInfo fallback fetched a part successfully today; the cause is the client (finding 11) |
| USC statute fetch | failing | Still failing: "Under Maintenance" at 2026-10-05T02:35Z (finding 4) |
| Legacy identity mapping out of memory | failing in the #188 body | Repaired (bounded reader; qualification-unblock report: 90 of 99 mapped in about 75 s) |
| Five stale required families | failing | Not observable (production registry); the corpus job is idle, so staleness can only grow |
| Anthropic judge credentials 401 | failing | Not re-tested (no provider calls); stands as of the 10-04 model audit |
| 30-second verifier timeout | "unresolved" | Unresolved; verify.ts:97-98 unchanged (finding 10) |
| Budget gateway | not implemented | Only a $5, 64-request OpenAI prototype exists (scripts/ops/sample-budget-gateway.py:21-22) |
| Jev activation | no-go | Runtime flags default off; not on the #188 path |

## B. Issue #188: what stands between the project and a qualified production corpus

In dependency order. "Self-imposed" means the requirement exists only because this repository's code or runbook says so.

| # | Step | External fact | Owner action | Self-imposed (where defined) | Greenfield verdict |
|---|---|---|---|---|---|
| 0 | Learn whether the gates are attainable | - | One local 55-question retrieval run and one answer run | - | Do first. The only gated answer run scores 2.60 against 2.75; no retrieval-level run on record reaches 0.9 (0.686 on 25 questions; 0.30-0.36 on 50) (finding 1) |
| 1 | Working judge credential | Both Anthropic keys returned 401 on 10-04 | Rotate the key | Judge model hardcoded (config.py:89) | Keep |
| 2 | Current statute text | uscode.house.gov under maintenance (verified 10-05Z) | - | Forced refresh, 30-day cache age, no override (corpus-release.sh:360; config.py:77; ssa_client.py:155-159) | Relax: accept the hash-pinned validated June copy with a recorded as-of date (finding 4) |
| 3 | Current regulations | eCFR requires Accept-Encoding | - | - | Already unblocked by the GovInfo fallback; fix or delete the dead primary path (finding 11) |
| 4 | Fresh discovery for five required families | New bulletins appear most business days | Run the crawler | One-day bulletin SLA (corpus-manifest.json:27); override not passed in bootstrap (corpus-release.sh:364-365) | Keep the crawl; use 7 days or honour the override |
| 5 | Four unavailable sources (#187) | Originals are not published | A product decision | Approval records bound to the snapshot hash and to 25 files (answer_scope.py:54-83); two native decrypt and restore runs | Keep the runtime limitation notices; replace the approvals with a checked-in list of four URLs |
| 6 | Backup of the exact snapshot | - | Download and decrypt on the workstation | Receipt must match the final snapshot hash at activation (cli/release.py:690-699) | Keep registry and original-payload backups (irreplaceable); decouple them from activation; the graph is regenerable |
| 7 | Legacy baseline (55 retrieval + 55 answers on legacy) | - | - | corpus-release.sh:310; cli/release.py:681; identity catalog mandatory (evaluation_evidence.py:24-25) | Drop for the first release: legacy lacks 9 of 99 golden identities and will not serve users again |
| 8 | Spending guard | - | - | Runbook prerequisite only; no code | Replace with provider-side hard caps on the evaluation keys |
| 9 | Build the candidate on blue | Voyage embeddings, about $14 projected after fee compaction | Run bootstrap | - | Keep |
| 10 | Validate: audit, 16 scope scenarios, retrieval, answers | - | - | Four non-overridable thresholds on one run (release.py:640-654) | Recalibrate (finding 1) |
| 11 | Two further paired repeats (330 answers in total) | - | - | Runbook only; not in code | Keep three candidate runs and gate on their mean; drop the legacy arm |
| 12 | Activation | - | Browser smoke | Nonce receipt within 10 minutes (bootstrap_activation.py:165-190) | The automated smoke already runs in `verify`; drop the manual receipt until there are users |
| 13 | Scheduled mode | - | Restore cron | - | Keep |

Ordering trap: step 4 changes the source snapshot hash (source_lifecycle.py:158-183), which voids steps 5 and 6; any merge under `packages/{agent,contracts,policy-corpus,pipeline}/src` changes the evaluation fingerprint (evaluation_evidence.py:30-35) and voids step 7. So 4, 5, 6, 7, 9 and 10 must complete inside the one-day bulletin window with a frozen repository. The repository has had 144 commits since 2026-09-21.

What the owner can drop under the greenfield rule: the legacy baseline and regression gate for the first release, the identity catalog that exists to serve it, the all-files fingerprint, the snapshot-bound scope approvals, the one-day bulletin SLA, the custom budget gateway, the manual nonce receipt, and the legacy arm of the repeated runs. What stays: a working judge key, a fresh crawl, a decision on the four sources, backups of the registry and original payloads, the server-side verifier, and gates that have been measured at least once.

Probably not on the path (not fully verified): draft PRs #113 and #114. The four required failures (registry rows 875, 1905, 11805, 11806) are missing downloads, not parse timeouts, and `_parse_strict` (cli/release.py:47-54) blocks only on required failures; which source family the timing-out PDFs belong to was not checked. Jev and the dependency migrations #144-#149 and #162 are not on the path.

Scale of the process: since 2026-09-21, docs/validation gained 75,352 lines across 316 file changes; agent, policy-corpus and web source gained 2,210. No candidate graph has ever passed release validation (docs/validation/corpus-bootstrap-2026-09-22.md:3); per the readiness reports production has served `legacy-20260725-ae8595c` since 2026-07-25.
