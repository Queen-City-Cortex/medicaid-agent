# Minor notes (unverified)

Round-one reviewers could report at most 12 findings each; smaller observations went here. Round two promoted and verified the most serious from 24 of the 32 scopes. Everything below is unverified and should be treated as a lead.

## agent-server

- packages/agent/src/chat-route.ts:23 `const body = await c.req.json();` is outside the try (line 104), so a malformed JSON body throws → Mastra onError → 500 + Sentry instead of a 400.
- packages/agent/src/chat-route.ts:95 and rate-limit/middleware.ts:101 log the WorkOS user id (chat.usage / rate_limit.blocked) — pseudonymous but an identifier; confirm the privacy-compliance stance (owning scope: privacy-compliance-product).
- packages/agent/src/readiness.ts:40-101 /readyz is unauthenticated and runs a Neo4j query + a SQLite write on every call; uncounted, so it is a cheap unauthenticated load vector and `config:'valid'` is hard-coded (line 94).
- packages/agent/src/index.ts:269 ALLOW_MASTRA_STUDIO is silently ignored in production (gateway requires NODE_ENV!=='production'); fine, but there is no warning if an operator sets it expecting it to work.
- packages/agent/src/sentry.ts:42 `Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1)` yields NaN on a non-numeric value (passed straight to Sentry.init).
- mastra-installed/security-appsec: @mastra/auth verifyJwks calls `jwt.verify(accessToken, signingKey)` with no issuer/audience options — WorkOS JWKS signature is checked but issuer/audience are not pinned.
- packages/agent/src/neo4j.ts:54-67 withSession monkey-patches session.run per call to inject a timeout; works, but is fragile across neo4j-driver upgrades (owning scope: neo4j-live).
- packages/agent/src/health.ts:106-110 the Anthropic probe sends `model: process.env.AGENT_MODEL` even though checkAnthropic only runs when AGENT_MODEL starts with claude-; harmless but couples the probe to raw env rather than runtimeConfig.agentModel.

## pipeline-eval

- packages/pipeline/src/pipeline/eval/metrics.py:91-94, eval/reports.py:147, eval/levels/answer.py:588: three different pass cut-offs (a miss is overall < 3, a failure is overall < 2, primary_hit is overall >= 2).
- packages/pipeline/src/pipeline/eval/metrics.py:180: stable_miss is an absolute count (2 or more misses) regardless of how many runs are analysed, so a longer --last window flags more questions.
- packages/pipeline/src/pipeline/eval/results.py:118: run_id has one-second resolution and is the filename; two concurrent runs in one results directory overwrite each other.
- packages/pipeline/src/pipeline/eval/results.py:148-153: git_sha is recorded without a dirty-tree flag.
- scripts/eval-ab.sh:35 and scripts/ops/eval-gate.sh:31 hard-code packages/pipeline/data/eval-results, while EVAL_RESULTS_DIR moves under CORPUS_DATA_ROOT when that is set (config.py:31-35, 86).
- scripts/eval-ab.sh:199-211: the verifier gate prints summaries and has no programmatic verdict; its citation check runs on the newest candidate run only.
- scripts/eval-ab.sh:186-187: arms run back to back rather than interleaved, so provider drift during the session is confounded with the arm.
- packages/pipeline/src/pipeline/eval/citation.py:96-103: 'grounded' means three shared non-stopword tokens with golden text; over 300 stored rows it correlates 0.03 with judge hallucination, equals 1.0 in 66% of rows, and is not aggregated anywhere.
- packages/pipeline/src/pipeline/eval/levels/citation.py:43-58: the citation level compares document URLs only; the section number in the citation label is ignored, so the right PDF with the wrong section scores 1.0.
- packages/pipeline/src/pipeline/eval/levels/retrieval.py:37: a request ID missing from the CLI response is silently treated as an empty retrieval; :54 computes precision over all returned IDs while :67 stores retrieved[:top_k].
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py:74-76: precision and recall are the same number and mrr is a 0.0 placeholder; only two cross_references exist in the dataset, so the level measures two edges.
- packages/pipeline/src/pipeline/config.py:89: the judge model is a constant with no environment override; it is the same vendor that co-authored the answer keys and paraphrases (commit trailers on 39285ea and 08b490e) and the same vendor as any claude-* AGENT_MODEL arm that packages/agent/src/model.ts:34-43 allows.
- packages/pipeline/src/pipeline/eval/judge.py:73-87: 60-second timeout with prompts up to 241 KB; no system prompt and no worked examples anchoring the 0-3 scale.
- packages/pipeline/src/pipeline/eval/evidence.py:17-19: comment cites EVIDENCE_TOOLS in hallucination-verifier.ts; the set now lives in packages/agent/src/processors/verifier/evidence.ts:92-99 and never emits findConceptSections or searchSections.
- packages/pipeline/src/pipeline/eval/levels/answer.py:370: only answer.text reaches the judge; caveats, notes and confidence are never used, although some caveats hold acceptance rules.
- packages/pipeline/data/golden/dataset.schema.json:134-142: supporting_sections, cross_references and federal_references are untyped arrays; federal_references mixes two shapes (section_id/relevance and citation/note).
- packages/pipeline/src/pipeline/eval/dataset.py:38,49: filter_dataset takes both reasoning_type and category for the same filter.
- packages/pipeline/data/eval-results/README.md:6-10: lists three tracked milestones; nine result files and a directory are tracked.
- packages/pipeline/src/pipeline/evaluation_evidence.py:27-28: evaluation_fingerprint() mutates os.environ as a side effect of computing a fingerprint.
- packages/pipeline/src/pipeline/evaluation_evidence.py:80-97: require_complete_results does not check the result level, and answer aggregates carry aliased recall_at_k 0.92 and primary_hit_rate 1.0 (baseline.json), so an answer result passed where a retrieval result is expected would clear the retrieval gates.
- packages/pipeline/src/pipeline/cli/eval.py:175-176: run lookup is a substring match that takes the first hit; list_results does not search milestones/.
- packages/pipeline/src/pipeline/eval/levels/answer.py:30-39: answers containing phrases such as 'database is down' are retried up to twice, which hides a failure a user would have seen.
- packages/pipeline/data/golden/dataset.json:2123 and 2266: q-052 and q-055 ask about rules starting October 1, 2026 and in 2027; no entry records an as-of date, so keys go stale silently.
- [pipeline-parse-graph] local legacy graph: doc:clinical_policy:9 (source URL .../9-outpatient-pharmacy-program/...) is titled 'Lock-in Program'; policy 3D section 1.1 Definitions, policy 3A section 3.2.1 and MA-3550 _s2 have empty bodies.
- [agent-server] packages/agent/src/prompt.ts:20-21: rules added to raise held-out scores tell the agent to answer 'No.' without hedging and to cite sections 2.1.x and 4.1, which are template text in 175 to 177 of 177 clinical policies.
- [model-inventory] docs/development/gotchas.md:9 reports a deployed AGENT_MODEL override; eval results cannot show which model they ran.
- [corpus-frames] packages/policy-corpus/src/internal/query-intent.ts:215-262 and term-lists.ts:400-410: topic detectors for HCWD premiums, outpatient pharmacy and nursing-facility leave mirror golden questions q-009, q-018 and q-012.
- [rag-design] stored 2026-06-14 retrieval runs: the correct document is in the top 10 for 46 to 47 of 50 questions but a labelled section for only 24 to 25; temporal questions score 0 of 6 primary hits.

## web-components-ux

- packages/web/src/app/chat/page.tsx:120 the mount-time autofocus effect runs while the auth skeleton is rendered (AuthKitProvider starts with loading=true when no initialAuth is passed), so the composer is not focused on first load.
- packages/web/src/app/chat/page.tsx:273 the EmptyState hero flashes while a selected thread loads; a failed load (packages/web/src/lib/use-chat-thread.ts:174-177) leaves the hero on screen with no error.
- packages/web/src/app/chat/page.tsx:142-148 the catch that 'restores input' cannot fire for transport errors: the AI SDK's sendMessage resolves and sets status 'error' instead of rejecting.
- packages/web/src/app/chat/page.tsx:304 the error container reuses data-testid="assistant-message".
- packages/web/src/app/chat/page.tsx:173-183 the auth skeleton has no accessible loading text.
- packages/web/src/app/chat/page.tsx:186 h-screen compiles to height:100vh; on mobile browsers with dynamic toolbars the composer can sit under browser chrome (h-dvh would avoid it). Not device-tested.
- packages/web/src/app/chat/page.tsx:245 the corpus freshness line is hidden below md, so phones never show it mid-conversation.
- packages/web/src/components/ThreadSidebar.tsx:76 only the 50 newest threads are fetched; there is no paging or search, so older threads cannot be opened or deleted from the UI.
- packages/web/src/components/ThreadSidebar.tsx:428-431 the delete dialog does not name the thread, has no pending state, and says 'chat' where the rest of the sidebar says 'thread'.
- packages/web/src/components/ThreadSidebar.tsx:160-162 deleting (or leaving) a thread that is streaming does not call stop().
- packages/web/src/components/ThreadSidebar.tsx:109-154 the derived-title machinery is a self-described legacy path; with no users it can be deleted along with its helpers in thread-helpers.ts:82-114.
- packages/web/src/components/ThreadSidebar.tsx:86-88 a failed refetch clears the list that was already on screen.
- packages/web/src/components/ThreadSidebar.tsx:327 onBlur saves the rename, so Enter followed by a blur can send two updates; there is no pending state.
- packages/web/src/components/ThreadSidebar.tsx:273 aria-label on a div with no role; :287 the error text has no role; rows are not a list and the active row has no aria-current.
- packages/web/src/components/ThreadSidebar.tsx:353 the '…' menu trigger that holds Delete measures 18x18 px.
- packages/web/src/components/MessageList.tsx:121 the footnote marker has a zero-height box (sup line-height 0), so its hover background and focus outline have almost nothing to paint.
- packages/web/src/components/MessageList.tsx:136 the streaming cursor and :40 PROSE_PROGRESS with the interleaved progress-text path are dead: the server gates all prose and strips interim text from memory.
- packages/web/src/components/MessageList.tsx:293-305 the narration keeps showing the last tool ('Reading section — Section: sec:doc:…') with raw internal ids while the model drafts and while the verifier runs.
- packages/web/src/components/MessageList.tsx:241 and packages/web/src/components/ScrollToBottom.tsx:36 pass behavior:'smooth' from JS, which the reduced-motion CSS override does not affect.
- packages/web/src/components/MessageList.tsx:74 there is no remark-gfm: a pipe table renders as one paragraph of literal pipes (probed); same at packages/web/src/components/DeepResearchReport.tsx:58. remark-gfm is in node_modules only transitively.
- packages/web/src/components/MessageList.tsx:74 markdown images render for any allowed URL and relative links such as [x](/terms) open the app in a new tab; the chat renderer lacks the http(s) guard that DeepResearchReport.tsx:64 has. javascript: and raw HTML are neutralised (probed).
- packages/web/src/components/MessageList.tsx:39, packages/web/src/components/DeepResearchReport.tsx:7 and packages/web/src/components/LegalShell.tsx:44 duplicate the prose class string; the masthead markup is repeated in chat/page.tsx:223, app/page.tsx:59 and LegalShell.tsx:12.
- packages/web/src/components/MessageList.tsx:228-231 panel and highlight state belong to the live message wrapper, so they carry over when the user flips between answer versions.
- packages/web/src/components/MessageActions.tsx:121-136 the thumbs have no aria-pressed; :81-86 a failed comment save clears the text with no message.
- packages/web/src/components/SourcesPanel.tsx:175-182 'Show policy text' is the first 300 characters of the section (packages/web/src/lib/message-sources.ts:142-153), not the passage that supports the claim.
- packages/web/src/lib/message-sources.ts:303-305 rows are sorted by section number across all documents, so policies interleave in the panel.
- packages/web/src/components/DeepResearchView.tsx:179 every failure (422, 409, daily quota) is headed 'The research report could not be released.'; :182 'Try again' only resets.
- packages/web/src/components/DeepResearchReport.tsx:46 the report has no copy or export action, report.verification is never shown, and source labels are truncated.
- packages/web/src/components/ChatInput.tsx:42 and :89 Enter-to-send is switched off by viewport width under 768 px, which also catches desktop users at high zoom; there is no visible Enter/Shift+Enter hint; :144 the counter is aria-live on every keystroke.
- packages/web/src/components/VersionNav.tsx:30 the retention note exists only as a title attribute.
- packages/web/src/app/page.tsx:165 font-serif is not one of the theme fonts; page.tsx:46 'Every claim carries an inline footnote that resolves to the source text' overstates today's behaviour; packages/web/src/components/EmptyState.tsx:66-68 lists fewer source families than page.tsx:15-22.
- packages/web/src/app/globals.css:206-215 a full-viewport fixed mix-blend overlay; :249 a print rule keyed on a data-testid.
- packages/web/src/components/ToolStep.tsx:51-204 hand-mirrors every tool's input and output shape with casts; nothing ties it to the agent's schemas.
- contracts-seams: packages/web/src/lib/message-sources.ts:239-252 expects url and sectionNumber on searchSections and findConceptSections outputs; the tools return neither (packages/agent/src/tools/search.ts:5-12, concepts.ts:22-30), so those branches and the 'search result' / 'concept match' labels at packages/web/src/components/SourcesPanel.tsx:35-43 are dead, and packages/web/tests/lib/message-sources.test.ts:64-68 uses a shape the tool cannot produce.
- contracts-seams: two error envelopes are live, flat at packages/agent/src/rate-limit/middleware.ts:105 and nested at packages/agent/src/chat-route.ts:34 and deep-research/routes.ts:21; ApiErrorSchema at packages/contracts/src/schemas.ts:5 is used by neither client parser.
- privacy-compliance-product: packages/agent/src/sensitive-data.ts:13 the member_id rule matches the phrase itself ('Medicaid ID number', 'member number required'); :9 the ssn rule matches any ZIP+4 such as 27699-2501 (probed).
- agent-server: packages/agent/src/chat-route.ts:33 scans the entire client body, including earlier released answers and tool inputs, instead of the newest user text that trustedChatInput keeps.
- web-app-lib: packages/web/src/lib/use-chat-thread.ts:92 uploads the whole transcript with tool outputs on every send although the server keeps only the newest user text; long threads will reach the 2 MB MAX_BODY_BYTES 413.
- agent-processors-tools: citationLink is built as [documentTitle](url) (packages/policy-corpus/src/internal/record-mapping.ts:129) while packages/agent/src/prompt.ts:5 tells the model to write [Policy <number> § <section>](citationLink); prompt.ts:114 still invites progress updates that answer-release.ts:118 drops.
- agent-verifier: packages/agent/src/processors/verifier/run.ts:118-119 adds pass-1 fabricated URL and quote counts into the confidence sent with a 'corrected' outcome (processor.ts:88-89), which is what paints a red dot beside the green badge.
- security-appsec: packages/web/next.config.ts:5-8 sets no response headers or CSP.

## pipeline-parse-graph

- packages/pipeline/src/pipeline/graph/loader.py:360 fallback registry lookup uses LIKE without escaping `_` (nearly every stem contains one), omits .xls, .doc and .pptx, and takes an arbitrary `fetchone()`.
- packages/pipeline/src/pipeline/graph/loader.py:485 `with_suffix("").with_suffix(".meta.json")` derives the wrong sidecar name for a stem containing a dot; a missing sidecar is then treated as a legacy success. No such stems exist locally.
- packages/pipeline/src/pipeline/graph/loader.py:139-141 a failed table export is swallowed and the literal `[table extraction failed]` is written into corpus text; 0 occurrences in the local sample.
- packages/pipeline/src/pipeline/graph/loader.py:42-47 `_document_exclusion_reason` re-reads and re-validates `source_classifications` and opens SQLite again for every document.
- packages/pipeline/src/pipeline/graph/loader.py:318-333 the change-notice branch of `_extract_dhhs_policy_number` is unreachable from `load_document` (:588-593 skips change-notice titles); only tests call it.
- packages/pipeline/src/pipeline/graph/loader.py:662-732 an incremental load never removes a graph document whose parsed artifact or registry row has disappeared; only reset builds are clean.
- packages/pipeline/src/pipeline/graph/corpus_writer.py:291-297 `_fetch_existing_section_content` reads every existing body back to find changed sections, but `MERGE_SECTIONS_BATCH` already invalidates all vectors when the document-wide epoch changes; the read and `CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH` are redundant.
- packages/pipeline/src/pipeline/graph/schema.py:40 `reset_database` deletes the whole graph in one transaction and, like `ensure_schema` and `ensure_vector_index`, runs outside `CorpusMutationLock`; not tested against a full corpus.
- packages/pipeline/src/pipeline/graph/schema.py:30-34 the concurrent `ensure_schema` race recorded at gotchas.md:88 is documented but not handled; catching `EquivalentSchemaRuleAlreadyExists` would close it.
- packages/pipeline/src/pipeline/graph/connection.py:16 no connection timeout or `verify_connectivity`; the driver is never closed by the CLI (`close_driver` is referenced only by tests).
- packages/pipeline/src/pipeline/config.py:12 `load_dotenv` and every path constant are evaluated at import, so tests must monkeypatch each importing module; gotchas.md:14 and :193 are symptoms. :42 default password literal; :52 unvalidated `int()`.
- packages/pipeline/src/pipeline/parse/converter.py:1742 only PDFs get a worker and a deadline; XLSX, DOCX, PPTX and HTML parse in the parent process with no limit (gotchas.md:211 documents sheets with over a million styled rows).
- packages/pipeline/src/pipeline/parse/converter.py:1212 each PDF starts a fresh spawn worker that re-imports Docling and reloads models; there is no worker reuse.
- packages/pipeline/src/pipeline/parse/converter.py:119 failed and not-answer-ready parses are retried on every scheduled run with no cap (tests pin this); attempt counters are recorded but only used for ordering, and the scheduled job passes no `--max-consecutive-timeouts`.
- packages/pipeline/src/pipeline/parse/converter.py:1113 case-sensitive `glob(f"*{suffix}")` against `suffix.lower()` at :1140 means an upper-case extension would be neither parsed nor quarantined; none exist locally.
- packages/pipeline/src/pipeline/parse/converter.py:271-275 and :305 `next(table_entries)` pairs tables by list position, but `document_index` tables are in the list and never consumed, so table text in parse-time statistics can be off by one.
- packages/pipeline/src/pipeline/parse/converter.py:986 sidecars store absolute `source_file` paths, which makes artifacts root-dependent; gotchas.md:83, :85 and :131 are all symptoms. Store the registry-relative path.
- packages/pipeline/src/pipeline/parse/converter.py:985-1101 three near-duplicate sidecar writers, with `source_pdf` and `warnings` duplicating other fields; a single sidecar dataclass would remove about 80 lines.
- packages/pipeline/src/pipeline/parse/converter.py:55 and :918-967 the v4/v5 sidecar migration and its tests are dead weight once every production sidecar is v6; candidate for deletion under the greenfield rule (production sidecars not inspected).
- packages/pipeline/src/pipeline/parse/converter.py:724-738 the LibreOffice timeout kills only the direct child process.
- packages/pipeline/src/pipeline/parse/fee_xlsx.py:105 and :121 the prefix and emitted-versus-original checks cannot fail by construction (`emitted = values[:width]`); only the native-versus-original check is substantive. A sheet with understated dimensions fails closed although the native pass can read its rows (tests pin this).
- packages/pipeline/src/pipeline/parse/fee_xlsx.py:19 compaction applies to `.xlsx` only; the 288 local legacy `.xls` fee schedules keep their trailing empty cells.
- packages/pipeline/src/pipeline/embeddings/chunker.py:16-23 window boundaries prefer a blank line and then any whitespace; bodies join paragraphs with a single newline, so prose windows usually end mid-sentence. Prefer a newline, then a sentence end.
- packages/pipeline/src/pipeline/embeddings/planner.py:29-30 one heading path longer than half the budget aborts the whole embedding stage; intended fail-closed, but mis-parenting lengthens paths, so cap ancestor titles.
- packages/pipeline/src/pipeline/embeddings/generator.py:84-87 `_flush_batch` re-raises, so `embed_all` never returns with errors and `_fail_on_embed_errors` (cli/build.py:16-28) is unreachable; tests/test_cli_embed.py:30 tests a state that cannot occur.
- packages/pipeline/src/pipeline/embeddings/generator.py:99-102 Chunk nodes store the heading plus body slice as `content_text`, duplicating section bodies in the graph.
- packages/pipeline/src/pipeline/cli/graph.py:46-47 `stats` re-plans and tokenizes the whole corpus; scripts/deploy-data.sh calls it twice.
- packages/pipeline/src/pipeline/parse_provenance.py:42 `with sqlite3.connect(...)` does not close the connection; :144-150 returns hard-coded attestations such as `"registryModified": False`.
- packages/pipeline/tests/test_loader.py:71-74 picks `fixtures[0]` from an unordered glob (gotchas.md:25 warns about this); no test asserts hierarchy, list markers or table rendering on the fixture.
- packages/pipeline/pyproject.toml:5 `requires-python = ">=3.11"`; the local venv runs 3.13.2 while the image uses Debian's 3.11, so local test runs do not exercise the production interpreter.
- [corpus-retrieval] packages/policy-corpus/src/retrieval/backends/concept.ts:11-12 matches aliases by substring (`toLower($query) CONTAINS toLower(alias)`), so `PA`, `LOC` and `MAD` match queries containing pay, local and made.
- [ops-deploy-ci] RUNBOOK.md:136-138 still documents the workstation launchd path (`weekly-refresh.sh` to `deploy-data.sh`, which wipes the production graph in place) alongside the blue-green release.
- [agent-verifier] packages/agent/src/processors/verifier/evidence.ts:108 presents pipeline-derived `effective_date` as grounding evidence; until the loader is fixed it should not be treated as a document fact.
- [pipeline-refs-federal-jev] reference edges are MERGE-only (corpus_writer.py:181-185); on an incremental reload, edges from a section whose text changed are never removed.

## agent-deep-research

- packages/agent/src/deep-research/repository.ts:78 - the plan's `brief` and rationales are unverified planner prose returned on every poll and rendered at packages/web/src/components/DeepResearchView.tsx:61; the planner has tools and is told to pin down policy versions and dates, so the approval card can show unchecked policy assertions.
- packages/agent/src/deep-research/workflow.ts:362-379 - reflection can add up to maxSubQuestions minus approved follow-ups without approval; excluded sub-questions are not passed as exclusions, so pruning a plan to two questions lets reflection re-add up to four.
- packages/agent/src/deep-research/service.ts:148-152 - any single rejected renewLease is treated as lease loss and terminally fails a run that still holds 14 or more minutes of lease.
- agent-server: packages/agent/src/storage/app-database.ts:124 - AppDatabase opens a second libsql connection with busy timeout 0 (libsql default) on the file Mastra's LibSQLStore also writes with interactive transactions; my probe logged 'LibSQLStore: Failed to checkpoint WAL before close. SQLITE_BUSY', the same symptom noted in tagged-research-recovery.json process_cleanup_note. SQLITE_BUSY on a research write is classified non-retryable.
- packages/agent/src/deep-research/workflow.ts:207-211 - agent.generate gets no abortSignal; cancel or lease loss stops a worker only at its next prepareStep, so up to researchConcurrency in-flight model calls finish and are billed.
- packages/agent/src/deep-research/usage.ts:28-51 - usage is recorded only for calls that return; failed or aborted calls, the planner's two classifier calls and Exa searches are never recorded, so cost is under-counted exactly when runs fail.
- packages/agent/src/deep-research/usage.ts:13-17 - the `verifying` state transition lives in the usage module and is silently skipped when no usage repository is configured.
- packages/agent/src/deep-research/worker-pool.ts:13-15 - fixed batches, not a pool: one slow worker holds two idle slots until its batch settles.
- packages/agent/src/deep-research/workflow.ts:357 - throws failures[0].error rather than the systemic error that triggered the abort.
- packages/agent/src/deep-research/workflow.ts:351 - still word-matches `checkpoint` for worker fatality although gotchas.md:138 records that pattern as a bug (it was fixed only in recovery-errors.ts).
- packages/agent/src/deep-research/checkpoints.ts:31-33 - questionKey hashes the whole object, so the same question text with a different rationale is researched twice and uniqueQuestions does not catch it.
- packages/agent/src/deep-research/checkpoints.ts:43-45 - assertCorpus runs a Neo4j query before and after every checkpointed unit (roughly 60 round trips for a six-question run); once at start and once before release would give the same guarantee.
- packages/agent/src/deep-research/workflow.ts:214 - res.text is the concatenation of every step's text in installed Mastra (trip-wire chunk getFullOutput), so any worker narration between tool calls becomes part of the draft that is verified.
- packages/agent/src/deep-research/service.ts:118-164 - the heartbeat renews regardless of progress; a run has no wall-clock deadline.
- packages/agent/src/deep-research/repository.ts:122-124 - the daily quota counts every created run, including ones the system itself failed, so two infrastructure failures lock a user out for 24 hours.
- packages/agent/src/deep-research/repository.ts:171,220,232,272,283,306,322,351 - timestamps are interpolated into SQL text instead of bound (numbers only; style).
- packages/agent/src/deep-research/config.ts:4-6 - comment says fan-out is bounded to stay inside 'the server's 10-minute request timeout'; runs are no longer request-bound (docs-drift).
- packages/agent/src/deep-research/schemas.ts:20,44,70,72 - FindingSchema, CorpusSourceSchema, PlanApprovalResumeSchema and PlanApprovalSuspendSchema are exported and unused; approvalStep redefines both approval schemas inline (workflow.ts:267-271).
- contracts-seams: packages/contracts/src/schemas.ts:181-198 - DeepResearchProgressSchema has no importer and lists a `recovering` stage the workflow never emits.
- packages/agent/src/deep-research/agents.ts:30 - webSearch is in the worker's toolset whenever Exa is configured; `useWeb` only changes one prompt sentence (workflow.ts:170).
- packages/agent/src/tools/web-search.ts:47 - an Exa result with an empty-string title yields title '', which fails ResearchWebSourceSchema (min 1) at service.ts:291 after the whole run has succeeded (not verified against Exa).
- packages/web/src/lib/use-deep-research.ts:142-145 - one abort listener is added per poll iteration and never removed.
- packages/web/src/lib/use-deep-research.ts:261-279 - a cancel that loses the race with completion shows an error instead of the finished report.
- packages/web/src/lib/use-deep-research.ts:175 - restore sets status 'recovering', so a reload shows 'Recovering completed work (0/2 retries used)' for a healthy run.
- packages/web/src/lib/use-deep-research.ts:178-181 - a single 401/403/404 while restoring deletes the saved run id, another way to orphan an active run.
- agent-server: packages/agent/src/index.ts:256-258 - the route-level MastraAuthWorkos is built without trustJwtClaims, so each 1.5-second poll triggers a WorkOS getUser call (@mastra/auth-workos dist/index.js:167) and a failed lookup becomes a 401 that ends polling.
- web-components-ux: packages/web/src/app/chat/page.tsx:87-92 - switching chat thread calls reset(), which cancels an in-flight research run and burns a daily start.
- agent-server: packages/agent/src/rate-limit/middleware.ts:22 - a research start later rejected with 409 or 422 has already consumed a rate-limit event.
- mastra-installed: node_modules/@mastra/core/dist/agent-B2LHedIt.js:6451-6573 - Run._resume never calls cleanup (start does at :6098), so each resumed run's Run object stays in workflow.runs for the process lifetime.
- mastra-installed: node_modules/mastra/dist/index.js:3139-3246 - `mastra dev` posts /__restart-active-workflow-runs after boot, which would re-drive orphaned 'running' workflow snapshots outside ResearchService (no lease, budget or checkpoints); the route is registered only when isDev (deployer server index.js:4282). Not verified whether the execution gateway blocks it in dev.
- agent-verifier: packages/agent/src/processors/verifier/verify.ts:1 - the chat verifier imports isRetryableResearchError from deep-research, coupling it to research recovery heuristics.
- ops-deploy-ci: packages/agent/railway.json:19 - sleepApplication is on; how Railway sleep interacts with a run waiting out a dead lease was not verified.

## web-app-lib

- packages/web/src/lib/use-answer-versions.ts:76 and use-chat-thread.ts:89 — Re-run and 'Try again' call AI-SDK regenerate, but the transport drops trigger/messageId and the agent (answer-release.ts:48-53) always appends a new user turn. Live UI shows Q then A2 with a 2/2 pager; the stored thread, a reload and the export show Q, A1, Q, A2, and the pager is client-only. Either implement regenerate server-side or relabel the action 'Ask again' and delete the version machinery (use-answer-versions.ts, VersionNav).
- contracts-seams / agent-server (inferred, not reproduced): packages/web/src/lib/parse-message.ts:166 anchors a restored turn's id on the answer-bearing persisted message, while the live UIMessage id comes from the stream start chunk (the first response message id). In the local snapshot the answer message is the last of 2-9 persisted assistant messages in 20 of 23 turns, so a rating given on a live answer probably does not rehydrate after reload. Needs one end-to-end check; e2e/tests/mocked/feedback.spec.ts:84-85 only asserts the button is visible.
- privacy-compliance-product: packages/web/src/app/privacy/page.tsx:80 says 'Conversations are kept until you delete them', but the default retention sweep deletes threads idle for 90 days (packages/agent/src/runtime-config.ts:161, storage/app-database.ts:241). Feedback (180 days) and usage (400 days) retention are not stated. Lines 33-35 describe cross-conversation working notes while packages/agent/src/chat-memory.ts:29 disables working memory. If EXA_API_KEY is set in production, the web-search provider is missing from the subprocessor lists (privacy/page.tsx:64-71, terms/page.tsx:91-93).
- packages/web/src/app/actions/theme.ts:44 with components/ThemeProvider.tsx:59 — getThemeAction is a Server Action used as a read on every mount of every page, public ones included. Next dispatches Server Actions one at a time (node_modules/next/dist/docs/01-app/02-guides/server-actions.md:28), so it queues with AuthKit's token and auth actions, and layout.tsx:28-29 already has the cookie. theme.ts:38 calls the WorkOS management API on every toggle with a read-modify-write of session-snapshot metadata.
- packages/web/src/app/layout.tsx:44 — AuthKitProvider is mounted without initialAuth (supported by the installed 4.4.0), so every /chat load shows the skeleton, makes an extra getAuthAction round trip and briefly builds the chat with resourceId 'anonymous' (chat/page.tsx:32). The layout is already dynamic because it calls cookies().
- packages/web/src/lib/use-mastra-client.ts:44-58 — the tokensRef/effect indirection is unnecessary: AuthKit's getAccessToken and refresh are useCallback with empty deps. useMastraClient (line 14) is unused; thread-helpers.ts:38 getThreadTitle is used only by tests; the derived-title path (components/ThreadSidebar.tsx:109-154, thread-helpers.ts:57-114) serves only untitled threads, which the current create path never produces.
- packages/web/src/lib/mastra-client.ts:21 and components/ThreadSidebar.tsx:84 — 401 detection is err.message.includes('401'); any error text containing those digits triggers a token refresh and a second call, including for non-idempotent clone and create.
- packages/web/src/lib/use-sidebar-state.ts:29,35,51 — localStorage is read in a state initializer and written inside a state updater with no try/catch (use-deep-research.ts guards sessionStorage); blocked storage throws into the error boundary.
- packages/web/src/app/chat/page.tsx:142-148 — the 'restore input' catch is unreachable for transport failures: AbstractChat.makeRequest catches and sets status 'error' (node_modules/ai/dist/index.mjs:13794-13807) and ensureThreadExists swallows everything.
- packages/web/src/lib/use-chat-thread.ts:140-153 — ensureThreadExists swallows all errors, and the installed create-thread route calls memory.createThread unconditionally rather than create-if-absent. Sending before a selected thread's messages arrive (messages.length === 0) may therefore retitle the existing thread. Not verified at runtime.
- packages/web/src/lib/use-chat-thread.ts:176 — a failed thread load sets messages to [] so the EmptyState with example questions renders as if the thread were empty, with no error or retry; the same EmptyState flashes while any selected thread loads.
- packages/web/src/lib/use-deep-research.ts:142 — an abort listener is added on every poll iteration and never removed; startedAt is not restored, so a resumed run shows 0s elapsed.
- packages/web/src/lib/feedback-client.ts:22,37,49; use-chat-thread.ts:84; use-corpus-status.ts:34 — credentials: 'include' is unnecessary with Bearer-only auth and inconsistent (use-deep-research.ts:83 and MastraClient omit it).
- packages/web/src/lib/mastra-url.ts:32 — a production bundle built without NEXT_PUBLIC_MASTRA_URL silently targets http://localhost:4111 (console.error only); fail the Docker build when RAILWAY_GIT_COMMIT_SHA is set and the variable is empty.
- packages/web/Dockerfile:18-29 — NEXT_PUBLIC_DEBUG_CHAT (src/lib/debug.ts:4) and NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (src/instrumentation-client.ts:31) are read in code but not declared as build ARGs, so they cannot be set for a Railway image. Dockerfile:30-31 turns an unset NEXT_PUBLIC_SENTRY_ENVIRONMENT into an empty string, which defeats the ?? NODE_ENV fallback at instrumentation-client.ts:30.
- ops-deploy-ci: packages/web/Dockerfile:62 runs node under sh -c as PID 1 (signal forwarding not verified); packages/web/railway.json has no healthcheckPath.
- packages/web/src/app/preview/gallery.tsx:54-95 — the CONVERSATION fixture has no data-verification-status part, so the gallery's Conversation section renders 'The agent finished without a final answer'. Lines 46-52 use the legacy verification fields and line 31 uses originTool 'followReferences', which never yields a source. packages/web/AGENTS.md:16-19 sends contributors there for design work.
- packages/web/src/lib/message-sources.ts:239-252 — the searchSections and findConceptSections cases can never add a source because those tools return no url (packages/agent/src/tools/search.ts:5-12, concepts.ts:22-30; confirmed in stored tool outputs). tests/lib/message-sources.test.ts:54-82 and tests/lib/message-parts.test.ts:138-166,214-238 use fixture shapes the tools never produce. ORIGIN_LABELS 'search result' and 'concept match' (components/SourcesPanel.tsx:38-39) are dead.
- dependency-health: packages/web/package.json:34 — @mastra/core is a devDependency that nothing in packages/web imports.
- packages/web/src/lib/parse-message.ts:154-157 — data-tripwire parts are dropped on restore (and stripped server-side by guardMessage), so a blocked question reloads as a bare user bubble with no explanation.
- web-components-ux: packages/web/src/components/MessageList.tsx:359-362 — after a user-initiated Stop the notice blames 'a transient API error'. Lines 293-305: the last tool's narration keeps spinning through drafting and verification, because text is gated server-side and there is no 'composing' state.
- contracts-seams: packages/web/src/lib/use-corpus-status.ts:38, use-deep-research.ts:96 and feedback-client.ts:53 cast server JSON instead of parsing with the Zod schemas in @nc-medicaid/contracts, which the client already imports for VERIFICATION_PART (message-verification.ts:1).
- mastra-installed: packages/web/src/lib/parse-message.ts:10-39 hand-rolls the stored-message to UI-part conversion; @mastra/ai-sdk ships a ui converter entry point.
- packages/web/src/components/ThreadSidebar.tsx:76 — perPage: 50 with no paging or search: threads beyond the 50 most recently updated are unreachable from the UI.
- packages/web/src/lib/use-chat-thread.ts:200-205 — deleting the current thread while messages is empty does not rotate threadId (handleNewThread returns early), so the next send recreates a thread with the deleted id.
- test-quality: packages/web/tests/components/ChatPage.test.tsx:79-85 — the use-mastra-client mock still models getWorkflow/createRun/startAsync from an earlier deep-research design; tests/lib/parse-message.test.ts:288-295 asserts badge restore through a data-verification-rewrite part the server no longer persists.

## agent-processors-tools

- packages/agent/src/processors/answer-frame-planning.ts:818 the alreadyPlanned guard is unreachable in practice: Mastra resets system messages each step (probe: the prefetch message is absent at step 1), so the test 'does nothing when a plan is already present' pins a state that does not occur.
- packages/agent/src/processors/answer-frame-planning.ts:20 isYesNoCoverageQuestion needs the literal word 'cover' and a does/is/can opener, so it misses 'covered', 'will' and 'are' (acknowledged in the comment at :213).
- packages/agent/src/processors/answer-frame-planning.ts:96 hasProcedureCode matches any 5-digit number, including ZIP codes and dollar amounts.
- packages/agent/src/processors/answer-frame-planning.ts:182 GENERAL_COVERED_PHRASES ('3.1') and BASELINE_ELIGIBILITY_PHRASES ('2.1.1') substring-match numbers inside full section content (for example '13.1').
- packages/agent/src/processors/answer-frame-planning.ts:378 listSections(ctx.roomAndBoardSections, 1) renders an empty reference when no room-and-board section surfaced; the same happens at :466 for quantity sections (reproduced).
- packages/agent/src/processors/message-length-guard.ts:23 the 'MAX_MESSAGE_CHARS <= 0 disables' branch cannot be reached in a real process: runtime-config.ts:66 requires maxMessageChars to be positive at startup.
- packages/agent/src/processors/scope-gate.ts:35 the classifier sees only the first 300 characters of each message: trivial bypass by front-loading Medicaid text, and long legitimate messages are judged on their preamble.
- packages/agent/src/processors/scope-gate.ts:93 logs the classifier's free-text reason (a paraphrase of user content) at info, and :94 puts it in the tripwire reason sent to the client.
- packages/agent/src/jev/scope.ts:24 Jev fallbacks are logged at info with no Sentry event, while RUNBOOK.md:104 describes the scope gate as 'Fails open (logged + Sentry)'.
- packages/agent/src/jev/scope.ts:8 the Jev criteria mention multilingual questions; CLASSIFIER_INSTRUCTIONS (scope-gate.ts:23-29) do not, so the two providers classify against different rubric text.
- packages/agent/src/jev/eval-worker.ts:32 every exception, including unsupported_mode and programming errors, is reported as classifier_failed_open with exit code 0.
- packages/agent/src/load-env.ts:106 installValidationBudget() runs in every agent process: a no-op unless JEV_VALIDATION_LEDGER is set, and it throws at import if that is set in production.
- packages/agent/src/jev/validation-budget.ts:7 spawnSync of Python per metered request blocks the event loop for up to 30 s (offline campaigns only); tests/jev-validation-budget.test.ts covers only the refusal path, the metering path is tested from packages/pipeline/tests/test_jev.py:258.
- packages/agent/src/tools/read.ts:15 the example id 'doc-123:sec-4.1' does not match real ids such as sec:doc:clinical_policy:b1d5bbb6d3448fea:2.1.1.
- packages/agent/src/tools/search.ts:22 documentTypes is a free-form string array (a wrong type returns nothing, silently) and topK at :26 is unbounded and non-integer; policy-corpus retrieval/hybrid.ts:20 only rounds, so a negative topK slices from the end.
- packages/agent/src/tools/search.ts:5 search hits omit sectionNumber, documentTitle and any citation, so the model must call getSection just to learn the section number.
- packages/agent/src/tools/concepts.ts:13 relationshipType is a free string and the description omits COVERS and RESTRICTS; an invalid value returns [] silently (policy-corpus primitives/concepts.ts:30).
- packages/agent/tests/tools/search.test.ts:204 the test title says '500 char snippet'; SEARCH_SNIPPET_CHARS is 300.
- packages/agent/src/tools/web-search.ts:3 exa-js is imported at startup even when EXA_API_KEY is unset; EXA_API_KEY appears in neither .env.example nor the RUNBOOK env table. The tool is wired (deep-research worker only, deep-research/agents.ts:30), not dead code.
- packages/agent/src/index.ts:186 forced synthesis at step 97 does not disable tools for the final step; if the model calls a tool again the turn ends withheld. The feedback is stored as an assistant text message that guardMessage turns into an UNVERIFIED_HISTORY placeholder. No test covers onIterationComplete.
- packages/agent/src/index.ts:210 the 'Current date' line uses server-local time (UTC on Railway), and policy-corpus scope/coverage.ts:30 uses toISOString; evening Eastern users get tomorrow's date for date-bound scope checks.
- packages/agent/src/index.ts:160 the detector config literal is duplicated in deep-research/agents.ts:58.
- packages/agent/src/retrieval-cli-runner.ts:105 the single-query path degrades to lexical silently with no mode in its output; the batch path at :79 throws, which protects the retrieval eval.
- packages/agent/src/prompt.ts:62 the persona 'You are an expert on North Carolina Medicaid policy' invites parametric knowledge in a retrieval-only product; :88 the resolveAnswerFrame bullet is misplaced under 'Document types'.
- packages/agent/src/processors/answer-frame-prefetch.ts:10 an empty-text user message makes latestUserText fall back to an earlier turn's question once history is loaded, so the forced frame would be for the previous question (not reproduced).
- corpus-retrieval: beneficiary_guidance appears in neither BASE_TYPE_GROUPS nor OPERATIONAL_TYPE_GROUPS (packages/policy-corpus/src/internal/scoring-constants.ts:20-31) and the string occurs nowhere under packages/policy-corpus/src; the vector, keyword, policy-scoped and fulltext backends all filter on d.document_type IN $docTypes, so default searches and frames appear unable to return that family, although the prompt advertises it and the golden set has 5 such questions. change_notice is likewise outside the default groups.
- corpus-retrieval: packages/policy-corpus/src/primitives/policy-lookup.ts:65 STARTS WITH plus ordering by effective date means lookupPolicy('1A-1') can return 1A-1x siblings ahead of the exact match.
- corpus-retrieval: retrieval backends return full s.content_text for every candidate (retrieval/backends/section-vector.ts:26, chunk-vector.ts:26, fulltext.ts:33) though search uses a 300-char snippet; multi-megabyte sections times up to 100 hits per type group is a plausible source of memory growth.
- corpus-frames: packages/policy-corpus/src/frame/service.ts:28-31 any scoped query bypasses the planner and returns a frame containing only the scope's required documents (for example a physical-therapy question mentioning Medicaid expansion gets only the MAGI table).
- corpus-frames: packages/policy-corpus/src/frame/pipelines/coverage.ts:268 avoidCandidates takes the top 3 hits with no minimum-match filter (internal/section-views.ts:60-82), and avoid terms such as request, billing, contact and history are substrings of most sections, so next-best relevant sections get labelled avoid.
- agent-verifier: packages/agent/src/processors/verifier/evidence.ts:396 extractSources iterates every message it is given; tool results from earlier turns can ground the current answer.
- security-appsec: packages/agent/src/answer-release.ts:127 sanitises only top-level error chunks; tool-level error text passes through and packages/web/src/components/ToolStep.tsx:317 renders it verbatim, so raw driver or provider exception messages can reach the browser.
- web-components-ux: a tripwired user message is not persisted (probe: the stored thread was empty after a coverage block), so a blocked question and its notice vanish on reload.
- docs-drift: RUNBOOK.md:106 says the request body 'carries the whole thread history' (the server keeps only the newest user message); RUNBOOK.md:25 says the memory kill switch covers working memory (always disabled at chat-memory.ts:29); docs/development/gotchas.md:108 and docs/operations/answer-coverage-scope.md:19 are stale as described in the findings.
- privacy-compliance-product: no store: false or other providerOptions on the main agent anywhere in packages/agent/src, so provider-default response storage applies to chat content.
- pipeline-eval: 10 of the 15 question strings in packages/agent/tests/processors/answer-frame-planning.test.ts are verbatim golden questions, and the planner's rule families are keyed to them.

## corpus-frames

- packages/policy-corpus/src/profiles/retrieval.ts:12-14: profile name, lane and wideningPolicy are set but never read; tests assert the name label only.
- packages/policy-corpus/src/frame/pipelines/coverage.ts:140 and :150: the topK 24 and 12 branches need a graph_reasoning lane that coverage never receives.
- packages/policy-corpus/src/frame/pipelines/general.ts:19: the deterministic_evidence branch cannot occur for the general type.
- packages/policy-corpus/src/frame/service.ts:31: scope frames hard-code questionType 'general' while the route comes from the detected type; the scope check runs on the model-supplied query, not the authenticated question.
- packages/policy-corpus/src/frame/service.ts:42: reason says 'Full evidence for the coverage obligation.' but getSection truncates each section at 6,000 characters.
- packages/policy-corpus/src/internal/search.ts:128-132: service focus terms include question words ('cover', 'covered', 'will', 'will pay', 'benefit'); the second coverage search embeds a duplicated word list.
- packages/policy-corpus/src/internal/section-predicates.ts:53-58: cluster terms taken from template headings become ['specific','criteria','covered','medicaid'], so the 'service cluster' matches every policy's template sections.
- packages/policy-corpus/src/internal/term-lists.ts:235-247: prior-auth avoid substrings (phone, contact, request, message, billing) are applied to coverage questions; 'phone' matches 'telephone'.
- packages/policy-corpus/src/internal/query-intent.ts:458: 'cap/c' substring also matches 'CAP/Choice', aliasing a CAP/DA question to Policy 3K-1.
- packages/policy-corpus/src/internal/document-selection.ts:110: variantReasoning says 'Exact policy-number match from the query.' when the number came from an alias (seen in saved frames for h-030 and h-040).
- packages/policy-corpus/src/frame/rebalance/federal-authority.ts:138: the first matching hint wins; a question matching both the SPA and EPSDT hints gets only the SPA one.
- packages/policy-corpus/src/frame/coverage-sections/selection/assembly.ts:146-207: the nested ternary gives a fixed precedence (telehealth, eligibility, congregate, ambulance, not-covered, yes/no); combined questions get only the first.
- packages/policy-corpus/src/frame/coverage-sections/selection/anchors.ts:112, :125 and :197: in-place sorts mutate arrays shared through the selection object; harmless today, fragile.
- packages/policy-corpus/src/frame/pipelines/amendment.ts:116-120: when no revision-header hit exists, ordinary hits are labelled 'Latest revision header or marker section.'
- packages/policy-corpus/src/frame/pipelines/prior-auth.ts:104-108: with Jev roles enabled, every primary and supporting candidate is hydrated an extra time before finalize.
- packages/policy-corpus/src/jev/section-roles.ts:36-40: the allowlist is re-parsed from the environment for every scored section; docs/development/jev.md says roles 'never exclude evidence', but a +1 under positional limits can displace a section.
- packages/policy-corpus/src/internal/document-selection.ts:237: non-sibling inferred documents are cut to one, so a two-policy question (hearing aids and eyeglasses) gets a one-policy frame; reproduced in a probe.
- packages/policy-corpus/tests/frames-federal.test.ts:24: fixture policy number '42 CFR 440' (spaces) differs from the graph format '42-CFR-440', so CFR-part logic is not exercised in that test.
- corpus-retrieval: packages/policy-corpus/src/primitives/sections.ts:146 and policy-lookup.ts:70 collect sections without ORDER BY; tie-breaks in title-based section picking depend on Neo4j's internal order.
- corpus-retrieval: packages/policy-corpus/src/primitives/sections.ts:22-23 adds two OPTIONAL MATCHes for Jev identity to every getSection call, even with roles disabled.
- agent-processors-tools: packages/agent/src/processors/answer-frame-planning.ts:20-22 has its own yes/no test that misses 'covered'; several phrase lists duplicate corpus term lists and can drift.
- agent-processors-tools: packages/agent/src/processors/answer-frame-planning.ts:63-73 labels sections by number only; with two documents the plan read 'cite both the scope section § 4.1 and the not-covered section § 4.1'.
- agent-processors-tools: packages/agent/src/processors/answer-frame-prefetch.ts:21 has the model retype the latest question; follow-up turns reach the router without conversation context.
- pipeline-eval: packages/pipeline/src/pipeline/eval/levels/answer.py:566 derives route_widened from widening_policy, not from whether the agent actually widened.
- pipeline-eval: held-out paraphrase ids are cited in source and tests (coverage.ts:38 and :85, frames-coverage-routing.test.ts:378 and :460, frames-federal.test.ts:784 and :982), and 2 held-out questions are used verbatim as test inputs, so that set is now a development set.
- test-quality: packages/policy-corpus/tests/internal/query-intent.test.ts:43 asserts the yes/no predicate against the golden negative-answer questions themselves.

## agent-verifier

- packages/agent/src/processors/verifier/answer-validation.ts:199 vs :173 - answer URLs strip trailing punctuation but URLs harvested from source text do not, so a URL that ends a sentence in a policy body never matches (script D4 flagged a real body URL as unknown).
- packages/agent/src/processors/verifier/answer-validation.ts:250 - the quote regex pairs any two double quotes; an inch mark or unbalanced quote turns the intervening prose into an 'unknown quote' (script D7).
- packages/agent/src/processors/verifier/evidence.ts:476-480 - truncation is whole-entry and stops at the first block that does not fit: later small blocks are dropped, and if the first cited block exceeds the budget the verifier receives only the notice (D5). The same section via the frame and via getSection is two budget entries (D6). run.ts:159 reports untruncated evidence_bytes and nothing records that truncation happened.
- packages/agent/src/processors/verifier/evidence.ts:458 - 'cited' is decided by document URL, so every section of a cited document is prioritised and an uncited change notice is the first thing dropped under budget pressure.
- packages/agent/src/processors/verifier/run.ts:116 - a provider outage is detected by matching a reason string inside unsupportedClaims (in-band sentinel) instead of a discriminated result; parse failures are also reported as 'unavailable'.
- packages/agent/src/processors/verifier/verify.ts:111 - evidence follows the answer, so pass 2 (new answer, same evidence) cannot reuse the provider's cached prompt prefix; run.ts:114 rebuilds the source text a second time for diagnostics.
- privacy-compliance-product: packages/agent/src/processors/verifier/verify.ts:94-99 - the verifier request sets no store or output-token option (captured keys: model, input, text, reasoning), so provider-default retention applies to the question, answer and evidence.
- packages/agent/src/answer-release.ts:11 - the signature covers text and outcome only (not message, thread or user). Not exploitable today because the gateway exposes no message-write route, but any future import or write path could replay a signed answer. packages/agent/src/index.ts:73 - the signing key lives in the same SQLite file as the messages it protects.
- packages/agent/src/answer-release.ts:41 - textless assistant messages keep only tool-invocation parts, dropping OM markers, step-start and content.metadata (sealed flags) on write and read; the effect on OM bookkeeping is inferred, not tested.
- packages/agent/src/answer-release.ts:49-50 and packages/agent/src/chat-route.ts:23,50 - malformed bodies (invalid JSON, non-array messages, parts without string text) throw and surface as 500 rather than 400.
- packages/agent/src/chat-route.ts:41 - usage rows record the client-supplied thread id, which is undefined when the server generated one (answer-release.ts:52).
- mastra-installed: packages/agent/src/chat-route.ts:119 - savePerStep: true is ignored whenever observational memory is configured (node_modules/@mastra/core/dist/agent-B2LHedIt.js:30481).
- packages/agent/src/chat-memory.ts:26 - title generation is off only because of Mastra's default (generateTitle false) and OM's threadTitle false; pin both explicitly so an upgrade cannot start writing model-generated titles.
- pipeline-eval: packages/agent/src/index.ts:179 with processor.ts:65-70 - the web path deletes narration and reasoning parts from the live context after every step, while the CLI/eval path has no output processors and no CoverageBoundaryProcessor (index.ts:143-151), so evals exercise a different agent state than web users.
- agent-processors-tools: packages/agent/src/prompt.ts:114 - the system prompt invites brief user-facing progress updates between tool calls that the gate always discards (wasted output tokens).
- agent-processors-tools: packages/agent/src/processors/scope-gate.ts:94 - classifier free text is embedded in the tripwire reason that reaches the client.
- security-appsec: packages/agent/src/execution-gateway.ts:32 - PATCH on a thread lets a client write metadata.mastra.om.suggestedResponse/currentTask, which OM feeds back to the observer and agent as continuity hints, bypassing the input processors (inferred from the installed @mastra/memory dist, not exercised).
- docs-drift: docs/operations/answer-release-and-recovery.md:37 carries point-in-time test counts; docs/architecture/README.md:21 mentions exhausted verifier retries that chat does not have.
- web-app-lib: packages/web/src/lib/message-verification.ts:26-27 still parses data-verification-rewrite, data-verification-ok and pureMarkerFallback, which the agent no longer emits.
- packages/agent/src/processors/verifier/processor.ts:90 - if no writer is present the processor prints the ---VERIFIER--- eval block to server stdout.
- packages/agent/tests/processors/hallucination-verifier.test.ts:526-558 - verifyAnswer tests push schema-invalid partial objects through a mocked generateObject, so they cannot detect a schema or prompt mismatch with the real provider.
- packages/agent/src/processors/verifier/processor.ts:76-79 - evidence also includes tool results from earlier turns still present in the message list, so whether a follow-up answered from context verifies depends on whether OM has already compacted those messages.
- Persisted assistant messages accumulate one data-om-status part per step (seen in every OM run); harmless but it bloats history payloads.
- On a model error mid-run the client receives both a sanitized error chunk and the withheld notice (scenario A11b); pick one.

## pipeline-release-sources

- packages/pipeline/src/pipeline/release.py:692 and scripts/ops/corpus-release.sh:436-438: gate overrides are a bare {gate: reason} file read from a standing RELEASE_OVERRIDE_FILE env var; nothing binds an override to a release id, snapshot hash or expiry, so one accepted count drop waves through every later one. Count gates are relative to the previous manifest only (release.py:393-396), so loss compounds.
- packages/pipeline/src/pipeline/release.py:296-306: mark_graph_release MERGEs the marker and overwrites release_id unconditionally; `release-mark-graph --manifest X` can stamp any manifest's identity onto any graph, and /readyz trusts that id.
- packages/pipeline/src/pipeline/release.py:529-534: aggregateRegression takes the max absolute difference across metrics on different scales (0-1 recall, 0-3 scores); with a precision ceiling near 0.21 and tolerance 0.15 the precision comparison is effectively vacuous.
- packages/pipeline/src/pipeline/release.py:925: error text hardcodes '24-hour' although the window comes from policy.
- packages/pipeline/src/pipeline/release.py:757: validatedAt is set even when the release is rejected.
- packages/pipeline/src/pipeline/release.py:938-941: retention and cleanup scans skip unreadable manifests, so a corrupt manifest fails open.
- packages/pipeline/src/pipeline/cli/release.py:129: release-prepare silently overwrites an existing manifest when REQUESTED_CORPUS_RELEASE_ID is reused; stale evidence files under releases/<id>/ remain.
- packages/pipeline/src/pipeline/cli/release.py:684-689: bootstrap preflight hashes the whole corpus twice per call (inside _require_parse_inventory_unchanged and again explicitly) and runs twice, the second time while production is switched.
- scripts/ops/corpus-release.sh:366-370: bootstrap() marks the graph `validated` again right after release-validate's graphReleaseMarker stage did.
- scripts/ops/corpus-release.sh:79: download_manifest returns early when a local copy exists; manifests live locally, in corpus/current/pipeline/releases and in releases/<id>/manifest.json with no reconciliation.
- scripts/ops/corpus-release.sh:558-562: rollback's set_agent_target failure exits with no compensation; rollback never updates the rolled-back graph's marker, and its Neo4j is never stopped because find_cleanup_candidate needs supersededByReleaseId.
- scripts/ops/corpus-release.sh:534: rollback reads the agent's NEO4J_PASSWORD via `variables --kv` without a non-empty check (promote has one at :397); a sealed or missing value would be written back empty on the restore path at :565-569.
- scripts/ops/corpus-release.sh:109-122: one LLM chat answer decides cutover, and the same smoke gates each restore retry, each of which redeploys the agent again.
- packages/pipeline/src/pipeline/bootstrap_activation.py:215-227: restore() swallows every exception; a failed evidence upload in restore_record repeats the production redeploy up to three times and then reports failure although legacy is serving.
- packages/pipeline/src/pipeline/bootstrap_activation.py:251: the 'distinct legacy target' check compares an unrendered agent value (possibly a reference expression) with the rendered corpus-job URI.
- security-appsec: packages/pipeline/src/pipeline/bootstrap_activation.py:255-262 keeps the previous NEO4J_PASSWORD in pipeline/private-activation/<id>/state.json indefinitely (also after status `promoted`); scripts/ops/object-storage-backup.sh:31-34 archives all of pipeline/, so it rides in every age-encrypted backup (400-day retention). Not in plaintext mirrors, as the doc requires.
- security-appsec: scripts/ops/corpus-release.sh:92-99 passes the Neo4j password on the railway CLI argv.
- packages/pipeline/src/pipeline/retirement.py:85-114: retirements that were later reactivated are still evidence-checked on every release; a lost capture for a long-reactivated source blocks releases.
- packages/pipeline/src/pipeline/retirement.py:39: lock contention surfaces as a raw BlockingIOError traceback.
- packages/pipeline/src/pipeline/retirement.py:163, availability.py:29, source_audit.py:76: next() without a default raises StopIteration for a source_type missing from the manifest.
- packages/pipeline/src/pipeline/availability.py:121: writes an ISO timestamp into last_checked_at, a column the crawler writes as SQLite datetime('now') text and orders by as a string.
- packages/pipeline/src/pipeline/audit.py:164-182: _match_parsed_entry falls back to a filename-stem match, which can attach a PDF sidecar to an XLSX companion when sidecar paths do not normalise (copied corpus root).
- packages/pipeline/src/pipeline/audit.py:160: read_graph_documents turns any exception into graph_error; the weekly `audit-corpus` then writes a report that looks like nothing is loaded and exits 0.
- packages/pipeline/src/pipeline/freshness.py:15: build_answer_ready_snapshot defaults db_path to the real registry; tests/test_freshness.py calls it with only a parsed dir, so on a workstation it reads the developer's registry and hashes every local source file.
- packages/pipeline/tests/test_recovery_import.py: no test for path traversal in `file`, symlinks in the bundle, or missing manifest keys.
- packages/pipeline/src/pipeline/source_selection.py:461-473: _group_priority has two identical `return "medium"` branches.
- pipeline-parse-graph: packages/pipeline/src/pipeline/crawler_registry.py:35 opens the registry with a plain sqlite3.connect despite gotchas.md:214 requiring the immutable adapter on read-only mounts, and :40-42 re-validates every classification (hash plus HTML parse) on every read.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/loader.py:42-46 calls validate_classifications once per document during load_all.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/schema.py:40 deletes the whole graph in a single auto-commit transaction.
- ops-deploy-ci: scripts/ops/restore-corpus-artifacts.sh:36-45 does not restore pipeline/release-state (the snapshot acknowledgement) or section-labels (which sync-current-corpus.sh:44 mirrors); after a volume restore the first run sees `changed` and starts a full release.
- ops-deploy-ci: scripts/ops/railway-corpus-job.sh:101-112 runs a paid full evaluation on the 1st of each month with no gate or alert on its result.
- pipeline-eval: release gates evaluate the agent build and environment inside the corpus-job image (cli/release.py:264, :283), not the production agent's deployed commit or model overrides (gotchas.md:9); nothing binds 'validated' to what production runs.

## crawler

- packages/crawler/src/db/schema.ts:244 - canonicalizeExistingDocumentUrls runs on every initDb(), including list, stats and export; it can DELETE rows or throw 'ambiguous canonical registry artifacts'. No PRAGMA user_version. Greenfield: delete it or gate it on a schema version.
- packages/crawler/src/crawl/sync.ts:177 - getFilenames(new Map(), sourceType) passes a fresh cache on every call, so the cache parameter does nothing.
- packages/crawler/src/crawl/fetcher.ts:166 - fetchWithRetry is a pass-through to fetchWithRetryUnqueued; the comment at fetcher.ts:89 ('keeps each host serial') is inaccurate, since the queue slot is released at headers (two same-host bodies observed in flight).
- packages/crawler/src/crawl/fetcher.ts:328 - fetchHtml reads the body with no size cap; bodyTimeout is an idle timeout, so no request has an overall deadline.
- packages/crawler/src/crawl/fetcher.ts:282 - every error except UrlRejectedError is retried with backoff, including 'Too many redirects' and a beforeRequest robots veto from source-audit (four invocations with maxRetries 3; 15.5 minutes at production backoff).
- packages/crawler/src/crawl/downloader.ts:323 and src/sources/bulletins.ts:172 - one bulletin's URL, title and required phrases are hard-coded in generic code; a second bulletin seed in the manifest would get the COVID title and fail validation. src/sources/beneficiary-guidance.ts:6 keeps another URL-to-title map outside the manifest.
- packages/crawler/src/crawl/downloader.ts:574 - rejectionReason says 'redirect target outside source-family allowlist' for every UrlRejectedError, including a disallowed DHHS attachment link that was never a redirect.
- packages/crawler/src/utils/naming.ts:27 - a title with no ASCII letters or digits slugifies to an empty string and yields '.pdf', then '_2.pdf'; path.extname('.pdf') is empty, so needsExtensionMigration (downloader.ts:493) would re-archive that file on every run. Not present in the local registry.
- packages/crawler/src/config.ts:59 - the `enabled: true` flags are never read; config.ts:65 archiveBaseUrl is unused; config.ts:62-65 binds bulletin URLs to landing_pages by array position.
- packages/crawler/src/db/registry.ts:95 - getRejectedUrls, getSourceFreshness, getBySourceType, getByStatus, failCrawlRun and utils/hash.ts:4 hashBuffer have no callers in src.
- packages/crawler/src/cli/update-fixtures.ts:22 - writes waivers-seed-N.html, which no test reads; refreshes five of fifteen fixtures; resolves the fixtures directory from dbPath (wrong under CORPUS_DATA_ROOT). tests/fixtures/bulletins-main.html is unused.
- packages/crawler/src/cli/add-url.ts:20 - no URL or allow-list validation; discovered_from 'manual' makes source-audit.ts:52 throw Invalid URL for that row; prints 'Added' even when the URL already exists under another family.
- packages/crawler/src/cli/crawl.ts:23 - --since-year is parsed with parseInt and not validated (NaN disables the year filter); crawl.ts:35 throws if a manifest family has no config.sources entry, after the run row was created.
- packages/crawler/src/cli/crawl.ts:80 - one implicit transaction per upsert plus two lookups per document; AUTOINCREMENT ids advance by about 4,000 per run because upserts consume sequence values (ids reach 38,457 for 4,575 rows in the local registry).
- packages/crawler/src/sources/clinical-policies.ts:59 (also bulletins.ts, state-plan.ts, waivers.ts, nctracks.ts, dhhs-policies.ts) - absolute URLs are built by string concatenation, which breaks on relative or protocol-relative hrefs; medicaid-page-documents.ts:16 uses new URL correctly.
- packages/crawler/src/sources/medicaid-page-documents.ts:107 - phone-number hrefs resolve to sub-pages: the log shows two 404s per run for .../provider-playbook-medicaid-managed-care/800-688-6696 and /866-304-7062.
- packages/crawler/src/sources/clinical-policies.ts:54 - every /download link anywhere on the page becomes an authoritative clinical_policy, and parsePolicyTitle accepts any text before the first comma as a policy number. Local data is clean (177 rows, one without a number).
- packages/crawler/src/db/registry.ts:117 - source_url is globally unique, so a URL linked from two families belongs to whichever discovery worker's results are flattened first (discovery.ts:75), while title and category follow the last writer.
- packages/crawler/src/cli/reconcile.ts:118 - --repair quarantines in-flight .download-*.tmp files and, because registry writes are deferred, every file a running crawl has installed; with --repair the exit code is 0 even when problems were found.
- packages/crawler/README.md:49 - says ten source families (there are eleven; beneficiary_guidance is missing from the table) and omits reconcile, reactivate-source and source-audit-collect.
- packages/crawler/src/cli/reactivate.ts:34 - correct as far as I could trace and well tested, but written as 200 to 400 character lines, which is hard to review for a command that mutates retirement evidence.
- corpus-manifest.json:26 - freshness_sla_days 1 with discovery_interval_hours 24 leaves no slack: freshness is stamped when a 2.4 to 8.7 hour run ends, so the required bulletin family reads 'stale' whenever it is evaluated more than 24 hours after the previous run finished.
- contracts-seams: packages/crawler/src/identity.ts:26 rewrites `?attachment` to `?attachment=`; the Python canonicalize_source_url agreed on the samples I ran, but tests/identity.test.ts has no empty-value case and the Python side does not normalise dot-segments in paths as WHATWG URL does.
- corpus-retrieval: the registry holds several active versions of one manual section (MA-2240 four, MA-3550 two, MA-2230 two) distinguished only by source_url and first_seen_at; check what, if anything, retrieval uses to prefer the newest.
- ops-deploy-ci: scripts/ops/daily-check.sh:14-20 and weekly-refresh.sh:25 take differently named locks; the workstation log shows an 11:30 daily `check` (no script in the repo runs `check`) overlapping the Saturday 12:00 crawl. .nvmrc says 22.22.0 while package.json engines says 22.23.3, and the default shell node (v26.9.0) cannot load the compiled better-sqlite3.
- pipeline-release-sources: packages/crawler/data/crawler.db on this workstation has a removal_reason column and lacks source_freshness, source_retirements and source_classifications, so it was written by a different crawler build than main.
- test-quality: fixtures for fee schedules, billing guidance and both managed-care families are 11 to 23 line hand-written stubs; the real-capture fixtures date from 2026-03-26 to 2026-04-11.

## contracts-seams

- security-appsec: packages/agent/src/sensitive-data.ts:13 member_id regex matches ordinary phrasing ('Medicaid non-emergency', 'beneficiary no longer', 'Medicaid identifies', 'Medicaid notifies') and misses 'My member number is A1234567'; 14 of 2,139 saved benchmark answers would trip it on a follow-up turn.
- agent-server: packages/agent/src/chat-route.ts:23 chat body has no schema validation; a user message without `parts` reaches answer-release.ts:50 and throws a TypeError that surfaces as a 500 instead of a 400.
- agent-server: packages/agent/src/policy-corpus.ts:22 `retrievalMode` is a module global flipped by any request's Voyage failure and reported to every user through /corpus-status.
- agent-server: packages/agent/src/logger.ts:25 PinoLogger default pretty-prints ANSI-coloured multi-line logs in production; the docstring at line 9 says JSON.
- agent-deep-research: packages/agent/src/deep-research/schemas.ts:81 local DeepResearchStage omits 'recovering', which packages/contracts/src/schemas.ts:190 includes.
- web-components-ux: packages/web/src/lib/message-verification.ts:26-27 and 63-80 handle 'data-verification-rewrite' and 'data-verification-ok' parts the server no longer emits (answer-release.ts:119 drops them); VerificationBadge.describe() is unreachable because the badge renders only when a release outcome exists.
- web-app-lib: packages/web/src/lib/use-deep-research.ts:126 maps any unknown run.state to 'researching', so a new terminal state on the server would poll forever.
- web-app-lib: packages/web/src/lib/feedback-client.ts:1-9 is a third hand-written copy of the Feedback shape instead of the contracts type.
- crawler: packages/crawler/src/db/schema.ts:244 runs the identity migration (with row DELETEs) on every registry open; in a greenfield project it should be a one-time migration or removed.
- crawler: the local crawler.db has a `removal_reason` column and 1,712 non-canonical `?attachment` URLs, so it was last written by code other than current main (packages/crawler/src/db/schema.ts has no such column).
- crawler: packages/crawler/src/db/registry.ts:27 types `status` as string; a union exported for the pipeline would give the status vocabulary one definition.
- pipeline-release-sources: packages/pipeline/src/pipeline/source_audit.py:86 and 103 require an exact host in allowed_domains while the crawler's isAllowedSourceUrl (packages/crawler/src/corpus-manifest.ts:124) also accepts subdomains.
- pipeline-release-sources: packages/pipeline/src/pipeline/corpus_manifest.py:66 coerces with int() and skips the family freshness range checks that packages/crawler/src/corpus-manifest.ts:67-74 enforces.
- pipeline-eval: packages/pipeline/src/pipeline/evaluation_evidence.py:53-62 builds modelEnvironment from the Python process environment; values the agent CLI subprocess loads from packages/agent/.env via load-env.ts are not in the fingerprint.
- pipeline-eval: packages/pipeline/src/pipeline/eval/results.py:159 stamps the pipeline's EMBEDDING_MODEL, not the VOYAGE_MODEL the CLI used for queries.
- agent-processors-tools: packages/agent/src/tools/search.ts:19 and packages/agent/src/prompt.ts:83-87 list 5 document types including the synthetic `change_notice` (documents with no sections) and omit 9 real ones.
- test-quality: packages/agent/tests/helpers/integration-indexes.ts:15-27 is a third hand-written copy of the vector index DDL with 1024 hard-coded.
- ops-deploy-ci: `node` on PATH is v26.9.0 while .nvmrc says 22.22.0; better-sqlite3 in node_modules loads only under Node 22 (ERR_DLOPEN_FAILED under 26).
- docs-drift: docs/validation/qualification-cycle-2026-10-03/model-audit.md:14 says /healthz consumes model quota; provider probes now live on /dependencyz (packages/agent/src/readiness.ts:130).
- architecture: packages/agent/src/corpus-status.ts:26 reports max(d.last_indexed), which is graph load time, as the corpus 'lastUpdated' shown to users; source check time is in source_checked_at.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/schema.py:24 and packages/pipeline/src/pipeline/embeddings/indexer.py:30-33 both create the section_fulltext index.

## pipeline-refs-federal-jev

- packages/pipeline/src/pipeline/references/resolver.py:456 loads every section body with the default fetch size and list(result), the pattern gotchas.md warns about for 38 MB sections (jev/sections.py:21 uses fetch_size=8); it works today (186 s in the Oct 3 preparation run).
- packages/pipeline/src/pipeline/references/resolver.py:354 opens a new Neo4j session per reference (about 32K per build).
- packages/pipeline/src/pipeline/graph/corpus_writer.py:155 merge_reference_edges only MERGEs, and _cleanup_document_sections clears PARENT_OF/NEXT_SIBLING but not REFERENCES or AMENDS from surviving section ids; stale edges persist on incremental loads (harmless under load_all(reset=True)).
- packages/pipeline/src/pipeline/references/resolver.py:387 self-references are counted neither resolved nor unresolved (3,463 uncounted in the Oct 3 run).
- packages/pipeline/src/pipeline/references/resolver.py:57 the title CONTAINS fallback matches '1.2' inside '1.1.2' and '2.1.2'; all 27 fallback hits in clinical policies were of that kind.
- packages/pipeline/src/pipeline/references/extractor.py:42 `Attachment\s+([A-Z])` has no trailing boundary: 127 of 10,841 matches are words or roman numerals ('Attachment TBI Waiver', 'Attachment IV').
- packages/pipeline/src/pipeline/references/extractor.py:57 'Section 1915(c)' yields both an ssa_section and a waiver reference (82 cases).
- packages/pipeline/src/pipeline/references/citations.py:15 '42 CFR Section 440.230' (43 cases) and 'CFR Parts N and M' (33) do not match; only the first citation of a list is captured (685 lists).
- packages/pipeline/src/pipeline/references/amendments.py:292 _upsert_synthetic_documents writes with auto-commit session.run, bypassing graph_writer's lock, annotated-release guard and atomicity with merge_amendments.
- packages/pipeline/src/pipeline/references/amendments.py:84 a section becomes a 'signal' section if its body merely contains 'policy update' (8 notices).
- packages/pipeline/src/pipeline/references/amendments.py:112 _extract_context uses the first mention of the MA number only.
- packages/pipeline/src/pipeline/references/amendments.py:21 _MA_SERIES_RE has no left boundary, so 'XMA-1234' would match.
- packages/pipeline/src/pipeline/references/supersessions.py:39 fails open to an empty map when the data file is missing; fail closed in release builds instead of relying on the Docker check.
- packages/pipeline/data/references/cfr-supersessions.json:7 entry 45:74 has effective 2025-10-01 while its own reason says Part 74 was superseded by Part 75 in Dec 2014; the stub and edge carry the 2025 date.
- packages/pipeline/src/pipeline/config.py:97 CFR_PARTS has 2 CFR 200 but not 2 CFR 300 (HHS's adoption, 11 sections, 89 FR 80061), which the supersession reason text itself cites; 45 CFR 160 and 42 CFR 2 are the most-cited missing parts in the saved unresolved file.
- packages/pipeline/src/pipeline/federal/ecfr_client.py:161 the fallback catches URLError, TimeoutError, ValueError and KeyError only; a ConnectionResetError or IncompleteRead mid-body skips the fallback.
- packages/pipeline/src/pipeline/federal/ecfr_client.py:22 _bulk_titles keeps whole-title trees for the life of the process (about 310 MB RSS for the three titles in my run).
- packages/pipeline/src/pipeline/federal/parser.py:61 DIV9 appendices (15, 177K characters) and part-level AUTH/SOURCE notes are dropped; parser.py:72 drops heading text after an inline element (1 case).
- packages/pipeline/src/pipeline/federal/ssa_parser.py:101 a USC section with no SSA mapping only prints a console warning; ingest still reports zero errors, so a newly enacted section is silently absent.
- packages/pipeline/src/pipeline/federal/loader.py:173 load_cfr_supersession_stubs runs even with --part filtering and reports stubs with zero edges when the target part was not loaded.
- docs/development/jev.md:9 and docs/development/gotchas.md:235 say Choice confidence is independent of the winning probability; the live docs define it as (p_max - 1/n)/(1 - 1/n).
- packages/pipeline/src/pipeline/jev/client.py:72 the 30,000-byte request cap is about four times stricter than the documented 32k-token state limit, so mid-size sections abstain and count against Jev recall.
- packages/pipeline/src/pipeline/jev/benchmarks.py:223 the routing review lists all disagreement items first and the 30 sampled agreements last; position reveals which class an item is in (not which side is right).
- packages/pipeline/src/pipeline/jev/benchmarks.py:173 the OpenAI scope arm's latency includes two synchronous Python ledger RPCs (about 46 ms measured on this machine) that the Jev arm does not pay.
- packages/pipeline/src/pipeline/jev/sections.py:84 any non-input JevError, including a deterministic 422, marks all later sections pending; a rerun stops at the same section.
- packages/pipeline/src/pipeline/jev/validation.py:47 rejects any tool whose type is not 'function', which refuses Anthropic custom tools (they carry no type).
- packages/pipeline/src/pipeline/jev/validation.py:96 metered_send calls json.loads(request.content) on every httpx request, so a GET or non-JSON body raises and is reported as pending_budget_or_infrastructure.
- packages/pipeline/src/pipeline/jev/ai_review.py:177 several statements exceed 500 characters on one line; the module is hard to review.
- packages/pipeline/tests/test_ssa_parser.py:124 the roman-numeral test puts (i) after (a); the real failure needs (h) to precede it.
- packages/pipeline/tests/test_resolver.py:126 monkeypatches resolve_reference with a two-argument lambda; it works only because the test's reference type is precomputed.
- privacy-compliance-product: packages/agent/src/jev/scope.ts:17 the optional Jev scope provider (off by default) would send the user's conversation window to api.typesafe.ai; hosting region and BAA status are unverified by me.
- pipeline-eval: packages/pipeline/src/pipeline/eval/levels/cross_ref.py:40 the pattern (a:Document)-[:REFERENCES_DOCUMENT|AMENDS]-(b:Document) can never match REFERENCES_DOCUMENT, whose edges start at Sections; the level measures recall only.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/loader.py:282 _extract_effective_date takes the lexicographic maximum of unvalidated dates, so policy 11A-10 would get effective_date 2105-09-01.
- corpus-retrieval: packages/policy-corpus/src/primitives/policy-lookup.ts:61 lookupPolicy has no document_type or retrieval_ready filter, so up to 24 synthetic change_notice documents fill the 25-row limit per clinical-policy lookup.
- pipeline-release-sources: packages/pipeline/src/pipeline/release.py:225 federal sources are fetched with refresh on after load_all(reset=True) and with no retry; one transient failure at uscode.house.gov fails the build after the reset.

## corpus-retrieval

- packages/policy-corpus/src/retrieval/hybrid.ts:20 topK is rounded but not clamped: topK=-1 returns all but the last candidate (probe: 19 of 20) and a huge topK returns the whole candidate map; the search tool schema is z.number().optional() (agent-processors-tools).
- packages/policy-corpus/src/retrieval/hybrid.ts:8 lexical-degraded mode drops policy_scoped entirely although its second query is purely lexical.
- packages/policy-corpus/src/retrieval/collector.ts:105-109 change-notice titles for amendment-title expansion are the first five in Map insertion order, not the five best-scored.
- packages/policy-corpus/src/retrieval/collector.ts:221-225 final sort has no secondary key and several Cypher queries order by score only, so Neo4j's tie order leaks into the final ranking.
- packages/policy-corpus/src/retrieval/backends/keyword.ts:105 document_keyword picks its six documents by docScore, effective_date, then d.id; 1,507 of 1,970 local fee-schedule titles contain 'fee schedule' and have no effective date, so the choice falls to hash order.
- packages/policy-corpus/src/internal/scoring-constants.ts:14-19 VECTOR_OVERSCAN_FACTOR=8 is inert for topK >= 7 because scanK is capped at 200 while perGroupK grows to 100.
- packages/policy-corpus/src/internal/scoring-constants.ts:10-13 the comment that Neo4j cannot pre-filter vector search predates the SEARCH ... WHERE in-index filter (2026.01+, needs additional index properties; IN from 2026.06); db.index.vector.queryNodes is deprecated since 2026.04 and all environments pin 2026.05.
- packages/policy-corpus/src/internal/rerank.ts:184 queryIncludesCover is still a bare substring (matches 'recovery') although query-intent.ts:120-122 fixed the same bug for isCoverageQuestion.
- packages/policy-corpus/src/internal/rerank.ts:283-291 ANSWER_READY_PENALTY looks unreachable for sections: the loader excludes not-answer-ready documents (pipeline graph/loader.py:58-59) and supersession stubs have no sections.
- packages/policy-corpus/src/internal/rerank.ts:403 and :100, change-markers.ts:33, query-intent.ts:98-100 contain redundant list entries ('1915(b) waiver' inside '1915(b)', 'change no.' inside 'change no', 'contracts' inside 'contract').
- packages/policy-corpus/src/internal/query-intent.ts:5 the year regex treats SSA section numbers as years: 'section 1915(c)' yields requestedYears ['1915'] and sets isHistoricalReimbursementQuery (probe).
- packages/policy-corpus/src/internal/query-intent.ts:379 'hearing' substring makes 'hearing aids' set asksForPublicNoticeDetails; :9 'child' makes 'childless adults' pediatric; :287 'Do ...', 'Am I ...' and a leading space defeat isYesNoCoverageQuery (all probed).
- packages/policy-corpus/src/internal/query-intent.ts:301 'difference between' alone makes a question policy_variant ('What is the difference between Medicaid and Medicare?', probe).
- packages/policy-corpus/src/internal/search.ts:6-42 the stop list has 36 entries, so 'must', 'they', 'follow', 'this', 'about' become scored terms; :65-69 single digits such as '7' and '2' become substring terms; :75-83 de-pluralisation yields 'proces', 'addres', 'diabete' and double-counts plurals (probe).
- packages/policy-corpus/src/internal/search.ts:134-138 extractQuotedPhrases treats text between two apostrophes as a quoted phrase ("What's ... child's" yields 's the income limit for a child', probe).
- packages/policy-corpus/src/internal/focus-ranking.ts:50-58 the CFR tiebreaker hard-codes part numbers, and the 'chip' token is a substring test.
- packages/policy-corpus/src/primitives/sections.ts:67-72 container children are collected without ORDER BY, so aggregated content order is arbitrary; :146 and policy-lookup.ts:70 section lists are unordered; sections.ts:180 orders children lexically ('5.10' before '5.2').
- packages/policy-corpus/src/primitives/sections.ts:199 the sibling query uses NEXT_SIBLING*0.. per sibling and returns every sibling with no limit; local documents have up to 2,628 sections.
- packages/policy-corpus/src/primitives/sections.ts:107 the 'more child sections' count uses combined.split('###') and miscounts when child content contains '###'.
- packages/policy-corpus/src/primitives/sections.ts:22-23 the two OPTIONAL MATCHes on CorpusRelease and JevAnnotation rely on single nodes without a uniqueness constraint in graph/schema.py.
- packages/policy-corpus/src/primitives/references.ts:11-12 labels(target)[0] depends on label order and both CASE branches are identical; no ORDER BY, LIMIT, target status or supersession information; an unknown section id returns [] exactly like a section with no references (also true of getSectionContext and getAmendments).
- packages/policy-corpus/src/primitives/policy-lookup.ts:66 a document with two SUPERSEDED_BY edges would be returned twice; only lookupPolicy exposes supersession, getDocument and getSection do not.
- packages/policy-corpus/src/primitives/amendments.ts:51-69 the authoritative copy lists 16 fields by hand and drops sourceModifiedDate and retrievedAt.
- packages/policy-corpus/src/contracts.ts:20-50 only 5 of 29 QueryFlags are read through analysis.flags in src; rerank.ts:166-191 recomputes 17 of the predicates and frames build their own flag sets.
- packages/policy-corpus/src/contracts.ts:85-93 RetrievalProfile.name, lane and wideningPolicy are never read in src; every profile enables the same base backends, so the registry and enabledBackends indirection has one effective configuration.
- packages/policy-corpus/src/internal/base.ts:2 and record-mapping.ts:106 read process.env inside the library instead of taking configuration through PolicyCorpusDependencies.
- packages/policy-corpus/src/index.ts:36-39 the public surface re-exports analyzeQuery, the Jev client and section-role heuristics alongside the corpus interface, and SearchHit.score exposes an unnormalised fusion value that can exceed 1.
- packages/policy-corpus/tests/search-ranking.test.ts:263-270 pins a cross-manual change-number comparison (MA-3550 04-26 against MA-2910 02-26) as desired behaviour.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/loader.py:291 writes effective_date YYYY-01-01 for every DHHS change notice; primitives return it as effectiveDate with no approximate marker.
- agent-processors-tools: packages/agent/src/tools/search.ts:21 suggests documentType 'change_notice', which has only synthetic section-less nodes and guarantees an empty search; packages/agent/src/tools/read.ts:12-13 describes get-section as returning the complete text; packages/agent/src/tools/concepts.ts:19 lists GOVERNS and REFERENCES_CONCEPT as examples.
- pipeline-eval: heldout-paraphrase.json still carries pre-migration evidence ids (doc:clinical_policy:3K-2); the last saved held-out retrieval runs are from 2026-06-14, and the only same-commit pair (08b490e) shows primary-hit 0.58 on golden against 0.48 on held-out.
- pipeline-eval: two saved 2026-06-14 retrieval runs with the reranker disabled are identical on 50 of 50 questions, a third at the same sha matches on only 10; the cause is unexplained (candidates: graph state change, missing secondary sort keys, embedding variance).
- neo4j-live: every claim about timing, index use, tie order and Lucene parsing in this scope is from reading and vendor documentation and deserves a PROFILE on the real graph.

## security-appsec

- packages/agent/src/health.ts:56 the /dependencyz OpenAI probe makes a real 1-token chat completion to gpt-5-mini per cache window (60s) — intentional, but it is a paid call on an unauthenticated path (readiness routes are public); a flood of /dependencyz hits is served from cache so bounded, but confirm the cache cannot be bypassed.
- packages/agent/src/chat-route.ts:95 logs userId (WorkOS id) on every chat.usage line; opaque id, acceptable, but note it in the data-classification doc.
- packages/agent/src/processors/scope-gate.ts:93 logs the classifier `reason` (a one-sentence LLM explanation that can echo user text) at info level — minor sensitive-data-in-logs.
- ops-deploy-ci: scripts/ops/lib.sh and railway-tcp-proxy.sh are careful (env -u RAILWAY_API_TOKEN wrapper, GraphQL-200-error handling, EXIT-hook teardown of the public bolt proxy); no shell-injection from user/crawled values observed in the ops scripts I read.
- node_modules/@mastra/server checkRouteAuth accepts `?apiKey=<token>` as an auth token (chunk server-adapter index.js:541) — dead for owned routes because the execution gateway runs first and 401s unbound requests, but it means a bearer token could be placed in a URL query for any pre-gateway route; worth noting with the pre-gateway routes finding.
- security/npm-audit-exceptions.json is {} and scripts/check-production-audit.mjs fails CI on any high/critical and any moderate without a current, owner+reason+expiry exception — this is a well-designed gate; no exceptions to justify today.
- packages/web/src/components/SourcesPanel.tsx:149 and DeepResearchReport.tsx:97 render corpus source URLs as <a href={url}> without an explicit https scheme check (DeepResearchView.tsx:180 does guard) — not exploitable because React 19 sanitizes javascript: hrefs, but make the guard consistent for defense-in-depth.
- web-app-lib: feedback-client.ts and use-chat-thread.ts send credentials:'include' to the agent origin; harmless today (no agent-origin cookie) but if a shared parent cookie domain is ever adopted, credentialed CORS (index.ts:274-277 credentials:true) plus cookie auth would open CSRF — latent.

## mastra-installed

- agent-verifier: gateAnswerStream forwards a data-tripwire chunk to the client and then suppresses the withheld-answer text (answer-release.ts:105,120); if the web UI does not render the tripwire's userMessage, a scope-gate/injection/coverage block shows as an empty answer.
- index.ts:119 `savePerStep: true` in chat-route defaultOptions is a no-op in production: installed map-results-step.ts:90 sets shouldSavePerStep = savePerStep && !memoryConfig?.observationalMemory, and OM is enabled by default, so OM owns persistence.
- mastra-upstream: the gate's updateMessages path can leave a legacy row's string `content.content` draft in storage — LibSQL updateMessages merges `{...existing.content, ...patch.content}` and guardMessage/textOf only inspect `parts`; readers go back through the gate so they are masked, but the raw row retains it (answer-release.ts:86-95, installed libsql updateMessages:758-776). Low confidence; worth a targeted test.
- index.ts:355-372 and deep-research/workflow.ts:111-125 parse tool-result envelopes with `as any` and a dual flat/payload fallback 'for versions'; against installed core the shape is stable, so the fallback is dead defensive surface that could be typed.
- model-strategy/model-inventory: observational memory uses openai/gpt-5.4-mini for BOTH observation and reflection — the top-level `model` in chat-memory.ts:27 applies to both per installed observational-memory.ts:426-434 (it does NOT fall through to the google/gemini-2.5-flash default), so no missing-provider-key issue.
- ops-deploy-ci: Dockerfile runs `npx mastra build --dir src` → deployer writes .mastra/output/package.json with pinned exact versions (e.g. @mastra/core 1.45.0, neo4j-driver 6.1.0) resolved from the build host, then `node index.mjs`; production therefore runs a deployer-generated dependency set, not the repo lockfile. Supported Mastra path, but worth noting the version source differs from package-lock.json.
- deep-research/agents.ts worker/report agents have no outputProcessors, so the hallucination verifier never runs as a Mastra processor for research; verification is done explicitly via verifyResearchAnswer (workflow.ts). Consistent with the design; confirms the index.ts comment that generate-path verification uses a separate flow.

## ops-deploy-ci

- .github/workflows/ci.yml:38,54,70 — the three CI Neo4j services still use a `cypher-shell` health-cmd every 5 s, the pattern gotchas.md:87 forbids locally (PR #211 fixed compose only).
- docs-drift: .nvmrc:1 `22.22.0` vs package.json:9 engines `22.23.3` vs RUNBOOK.md:6 `>=22.12.0`; no .npmrc engine-strict; the launchd plists (scripts/ops/launchd/*.plist:23/26) put /opt/homebrew/bin first, which is Node v26.9.0 on the ops laptop today.
- scripts/ops/lib.sh:89-98 — the mkdir lock writes a pid but never checks it; scripts/ops/daily-check.sh:14-18 pings hc_ok whenever refresh.lock exists, so a lock left by SIGKILL or power loss keeps the daily dead-man switch green forever.
- scripts/ops/backup-mastra.sh:30 and weekly-refresh.sh:25 — `acquire_lock ... || exit 0` runs before hc_trap, so a lock-contended run sends no ping at all.
- packages/web/railway.json:13 — no healthcheckPath and the web app has no health route; Railway switches traffic without verifying the new container (add one during the IaC migration).
- packages/web/Dockerfile:62 — the `sh -c` CMD is fine only because BusyBox ash execs the last command (verified: PID 1 on BusyBox 1.37); prefer `ENV HOSTNAME=0.0.0.0` and an exec-form CMD.
- packages/agent/railway.json:14-25 — no drainingSeconds or overlapSeconds; Railway's default drain is 0 s, so in-flight chat streams and Mastra shutdown get no grace on deploy (possibly related to the WAL-checkpoint log at RUNBOOK.md:326; not verified).
- scripts/ops/backup-mastra.sh:73-74 — 'harmless; next deploy clears it' is wrong for /data, a persistent volume; the 2026-09-04 run logged this warning, so a full chat-store copy may still sit on the volume.
- scripts/ops/backup-mastra.sh:40 and backup-corpus.sh:45 — mktemp snapshot directories have no EXIT cleanup; a failed run leaves a chat-store copy in /var/folders.
- privacy-compliance-product: scripts/ops/backup-mastra.sh:58 with lib.sh:41-42 — on failure the Railway SSH gateway's account JSON (name, email, workspace and project ids) is written to the log and POSTed to healthchecks.io in the /fail body.
- scripts/ops/weekly-refresh.sh:71-75 — the proxy-delete exit hook is registered after `create` returns; a failure in between leaves bolt public. Register the idempotent delete first.
- scripts/deploy-data.sh:45 — `bolt://` without TLS over the public TCP proxy sends the Neo4j password in cleartext; :37 calls `railway variables -s neo4j` with no project or environment pin.
- scripts/ops/railway-tcp-proxy.sh:33 and corpus-release.sh:96-97 — the bearer token and NEO4J_PASSWORD are passed on argv.
- scripts/ops/corpus-release.sh:36-41 — `railway variables --kv` pulls every agent secret into the job's shell to read four values.
- scripts/ops/lib.sh:22-24 — sourcing lib.sh creates ~/Library/Logs and ~/.cache directories inside the Linux job container; :113 uses bash 4.1 fd allocation while the plists invoke /bin/bash 3.2 (unused on macOS today; every script passes `bash -n` under 3.2).
- scripts/ops/lib.sh:40-42 — hc_fail attaches a log tail only when LOG_FILE is set; railway-corpus-job.sh never sets it, so hosted failure alerts carry no context.
- scripts/ops/daily-check.sh:42-56 — CORPUS_RELEASE_TRIGGER_URL has no receiver anywhere in the repo and is not set in ops.env (dead path); RUNBOOK.md:136 and :164-170 describe the daily job as `check` but the script runs a full `crawl`.
- scripts/ops/eval-gate.sh:42-44 — the baseline advances on every pass, so a steady decline under the per-run threshold never trips the gate.
- docs-drift: scripts/eval-ab.sh:26 says CANDIDATE_DIMS defaults to 2048 while :47 sets 1024; :48-51 and :173 baselines (gpt-5.4, gpt-5.4-mini, voyage-law-2) are no longer the deployed defaults.
- docs-drift: RUNBOOK.md:23 VERIFIER_MODEL default `gpt-5.4-mini` vs packages/agent/src/processors/verifier/config.ts:9 `gpt-5.6-terra`; RUNBOOK.md:37 trace sample default `0` vs packages/agent/src/sentry.ts:42 `0.1`.
- docs-drift: deploy/railway/neo4j.env.example:8-9 (heap max 2g, pagecache 1g) vs RUNBOOK.md:337-339 (512m and 512m).
- docker-compose.yml:6-8 — Neo4j ports are published on all interfaces with the repo-known password; bind them to 127.0.0.1.
- dependency-health: .github/dependabot.yml — nothing tracks the neo4j image tag (docker-compose.yml:5; ci.yml:31,45,61), RAILWAY_CLI_VERSION=5.17.0 (packages/pipeline/Dockerfile:11; the laptop CLI reports 5.58.0 available), `uv==0.8.22` (ci.yml:99) or npm@11.11.0; there is no cooldown window for new releases.
- packages/agent/railway.json:6-12 and packages/web/railway.json:6-11 — watchPatterns omit /tsconfig.json, /turbo.json and /.dockerignore, which the Dockerfiles copy or depend on.
- .github/workflows/ci.yml — no shellcheck, actionlint or hadolint for about 2,000 lines of ops shell; the agent and web images are built but never booted; scripts/check-production-audit.mjs:7 audits only the root lockfile (not e2e/package-lock.json) and nothing audits Python dependencies.
- scripts/ops/railway-corpus-job.sh:18 — JOB_RUN_ID falls back to RAILWAY_DEPLOYMENT_ID, which repeats across daily cron executions of one deployment.
- perf-cost-reliability: scripts/ops/railway-corpus-job.sh:101-112 — a full answer eval runs automatically each month with no budget guard; docs/operations/blue-green-corpus-releases.md:35-61 does not list EVAL_OPENAI_API_KEY, so release validation and the monthly eval may draw on the production OpenAI key.
- perf-cost-reliability: scripts/ops/object-storage-backup.sh:33-41 — a full archive (documents plus parsed output, several GB) every day with 400-day retention grows toward TB scale; consider deduplicating or incremental backups.
- packages/pipeline/Dockerfile:42-46 — `uv sync` runs after `COPY packages`, so any source change reinstalls the 4.9 GB venv; copy pyproject.toml and uv.lock first. :46 `--extra dev` ships pytest, ruff and vulture in the job image; a locally built derivative is 12.7 GB.
- .gitignore:18-19 — only `.env` and `.env.local` are ignored at the root; `.env.production` or `.env.*.local` under packages/agent would be committable.
- scripts/ops/weekly-refresh.sh:41 — `npm run dev:infra` recreated the developer's local Neo4j container at Saturday 08:00 (seen in the 2026-10-03 log) regardless of in-flight local work.
- .github/workflows/ci.yml:11-14 — the pull_request paths-ignore would leave docs-only PRs without a status if CI ever becomes a required check.
- security-appsec: the GitHub org is on the Free plan with two_factor_requirement_enabled=false; secret scanning and push protection are not reported as available for the private repo.
- scripts/ops/corpus-release.sh:277-283 — unknown terminal deployment states (for example SKIPPED) wait the full ten minutes; :278 treats SLEEPING as ready.
- scripts/ops/sync-current-corpus.sh:34-48 — `rclone sync` without --backup-dir: a crawler bug that deletes documents propagates to the mirror with no undo (the laptop script backup-corpus.sh:52-54 had one).

## e2e

- e2e/scripts/smoke-production.mjs:311 — `isVisible({ timeout })`: Playwright ignores the timeout (types.d.ts marks it deprecated), so `isChatReady(page, 8_000)` returns immediately; a harmless dead wait.
- e2e/scripts/smoke-production.mjs:25 — the default screenshot `/tmp/nc-medicaid-prod-smoke.png` is full-page and includes the sidebar footer email; failure shots may capture the hosted login page.
- e2e/scripts/smoke-production.mjs:112 — the activation receipt is unsigned JSON written with default permissions (docs suggest /tmp), while the lower-stakes readiness receipt enforces 0700/0600 (lines 58-60).
- e2e/scripts/smoke-production.mjs:16-19 — loads every key from four env files into process.env although it needs only TEST_USER_* and SMOKE_*.
- e2e/scripts/smoke-production.mjs:243-289 — checks outcome, length, sources panel and one tool step, but not that the released text contains a citation (gotchas.md:55 asks for that).
- e2e/scripts/tests/smoke-readiness.test.mjs:67-71 — `setDefaultTimeout(1000)` does not override verifyLogout's explicit 30 s waits, so this CI test sleeps about 30 s; the 'Chat remained accessible' branch at smoke-readiness.mjs:45 is unreachable in practice.
- e2e/tests/smoke/chat-roundtrip.spec.ts:9-15 (same in abuse and message-persistence) — an unhealthy agent (/healthz 503) skips the suite and Playwright exits 0; the probe reads MASTRA_URL while the app uses NEXT_PUBLIC_MASTRA_URL.
- e2e/tests/smoke/chat-roundtrip.spec.ts:7-8,29 — stale comments: /healthz is no longer the only public route (packages/agent/src/readiness.ts:120-139), and the model is no longer Claude.
- e2e/tests/smoke/deep-research.spec.ts:56 — fixed `waitForTimeout(1500)`; unlike the other smoke specs it has no agent-reachability gate.
- e2e/tests/smoke/abuse.spec.ts:38-57 — the opt-in rate-limit test shares the hourly quota with every other smoke spec, so it only works when run alone; undocumented.
- e2e/tests/smoke/message-persistence.spec.ts:52,57,60 — `.first()` on /epsdt/i with accumulating same-titled threads (the ambiguity gotchas.md:157 fixed in the production script), plus `networkidle`.
- e2e/helpers/hermetic-env.ts:19-20 — the comment mentions keeping 'the browser bundle and CSP aligned'; grep finds no CSP configured anywhere in packages/web.
- e2e/helpers/mock-routes.ts:87 — the createThread mock hard-codes `resourceId: 'anonymous'`.
- e2e/helpers/stream-builder.ts:102 — detects an existing verification part by substring search over serialized events.
- e2e/tests/mocked/verification-release.spec.ts:32 — a leftover full-page screenshot is written on every run and never asserted.
- e2e/tests/mocked/public-pages.spec.ts:46-48 — passes in hermetic mode because the stub host is spelled 127.0.0.1; it proves leaving the origin, not arriving at sign-in. Assert the /user_management/authorize path and redirect_uri.
- e2e/tests/mocked/scroll-stability.spec.ts:37,43,104-110 — Tailwind-class selectors, and scrollTop is read immediately after the click (prior e2e-infra:21, still open).
- e2e/playwright.config.ts:112,119 — fixed ports with reuseExistingServer false: `npm run test:e2e` fails if a dev server already owns :3000, while README.md:63 says the e2e tests require one.
- e2e/playwright.config.ts:10 — loads the repo .env (real provider and WorkOS secrets) into the runner and the hermetic web server. HERMETIC_ENV does not blank SENTRY_DSN, so whether local hermetic runs report server errors to Sentry depends on a value I did not inspect.
- e2e/playwright.config.ts:31 with .github/workflows/ci.yml:208-209 — one CI retry plus report upload only on failure means a test that fails then passes leaves no artifact; consider `--fail-on-flaky-tests` and `if: always()`.
- .github/workflows/ci.yml:204-206 — the browser tier runs against `next dev`. The production bundle (standalone output, the /preview 404 gate in app/preview/page.tsx) is built by the Docker job but never loaded in a browser. The job has no `timeout-minutes`.
- e2e/tsconfig.json:1 — e2e is not a workspace, so no script or CI step type-checks or lints it. `tsc -p e2e/tsconfig.json --noEmit` is clean today (tsc 6.0.3, exit 0).
- agent-server: packages/agent/src/sensitive-data.ts:13 — the member_id rule matches 'Medicaid Non-Emergency', 'Medicaid ID number', 'Medicaid notification' and 'beneficiary notices' (no digit or delimiter required); the ssn rule at :9 matches ZIP+4 such as 27699-2501. Verified by running the function.
- agent-server: packages/agent/src/chat-route.ts:33 — the guard scans the whole client body, history included, although trustedChatInput keeps only the newest user text; the research route scans just the question (deep-research/routes.ts:40).
- web-app-lib: packages/web/src/lib/parse-chat-error.ts:39 — understands only the flat `{error, message}` envelope; the nested 401/404/422/503 bodies from chat-route.ts and execution-gateway.ts all render as the generic error with a retry button.
- web-app-lib: packages/web/src/lib/use-chat-thread.ts:92 — sends the full message history each turn although the server discards it (answer-release.ts:49); long threads can hit the 2 MB body cap (rate-limit/middleware.ts:35) for no benefit.
- web-app-lib: packages/web/src/app/chat/page.tsx:139 — the thread is created before the chat POST, so a blocked or rejected first message leaves an empty titled thread; the reproduction shows nothing is persisted for a tripwire turn.
- web-app-lib: packages/web/src/lib/use-answer-versions.ts:83 — regenerate re-posts the last question and the server stores it under a new id (answer-release.ts:51), so persisted history probably gains a duplicate question and both answers after a re-run (inferred, not run).
- web-app-lib: packages/web/src/lib/use-chat-thread.ts:158 — listMessages() is unpaginated; a June capture of the real response shows perPage 40, so long threads may restore truncated (not verified against the current server default).
- web-components-ux: packages/web/src/components/MessageActions.tsx:121-137 — the rating toggles expose no aria-pressed. Contrast estimates for ThreadSidebar.tsx:298,347 and MessageList.tsx:121,419 are below AA (token arithmetic, not measured).
- agent-server: packages/agent/src/answer-release.ts:120-127 — after a provider failure the gate emits the error chunk and then a withheld notice. The AI SDK throws on the error chunk first, so the user probably sees the generic error plus the ended-without-answer notice (inferred).
- security-appsec: packages/web/.env.local (untracked) carries provider API key names (OPENAI, ANTHROPIC, VOYAGE, GROQ) that the web app never reads.
- security-appsec: hermetic auth relies only on WORKOS_API_HOSTNAME/PORT/HTTPS, which the WorkOS SDK honours; the web could reject a non-default host when NODE_ENV=production as defence in depth.
- ops-deploy-ci: scripts/ops/weekly-refresh.sh:81 — the unattended `npm run smoke:prod` inherits the repeatability defect in the production-smoke finding.
- docs-drift: e2e/tests/design/screenshots.shots.ts:16 says `setup` mints the auth cookie automatically, which is true only with real TEST_USER credentials; packages/web/AGENTS.md:19-25 repeats the real-session requirement without saying why.

## privacy-compliance-product

- packages/agent/src/usage/repository.ts:108-111 says a retention of <= 0 disables pruning, but packages/agent/src/runtime-config.ts:70 requires a positive value, so USAGE_RETENTION_DAYS=0 stops startup; the table is also pruned from two places (usage/repository.ts:113 and storage/app-database.ts:204).
- packages/agent/src/usage/repository.ts:49-77 and packages/agent/src/feedback/repository.ts:55-70 re-create tables already owned by the numbered migrations in packages/agent/src/storage/app-database.ts:18-55; remove the lazy copies.
- packages/agent/src/feedback/repository.ts:33 probeWritable has no production caller; packages/agent/src/readiness.ts:87 uses AppDatabase.probeWritable.
- packages/agent/src/storage/app-database.ts:43 usage_events.thread_id outlives thread deletion for 400 days (metadata only); list it in the retention table.
- agent-processors-tools: packages/agent/src/processors/scope-gate.ts:93 logs the classifier's free-text reason, which paraphrases the user's message; log the verdict code only.
- agent-processors-tools: packages/agent/src/tools/web-search.ts:38 and :56 log the raw web-search query at warn and error level.
- agent-server: packages/agent/src/chat-route.ts:29-39 returns {error:{code,message}} while packages/agent/src/rate-limit/middleware.ts:105 returns {error:'rate_limited',message}; one envelope would let the web show every guard message.
- agent-server: packages/agent/src/rate-limit/middleware.ts:95 records quota before the handler runs, so requests rejected with a 4xx still consume it.
- security-appsec: Sentry event payloads leave the agent process with raw authorization and cookie headers (scratch probe against packages/agent/src/sentry.ts:35 options); strip them in beforeSend rather than relying on server-side scrubbing.
- ops-deploy-ci: scripts/ops/backup-mastra.sh:40 writes the plaintext snapshot to a mktemp directory and removes it only at :75; a failed run leaves it on the laptop.
- docs-drift: RUNBOOK.md:18 and :23 name gpt-5.4-mini as the verifier default; packages/agent/src/processors/verifier/config.ts:9 defaults to gpt-5.6-terra.
- docs-drift: RUNBOOK.md:25 and :84 and the comment at packages/agent/src/index.ts:127-130 describe cross-conversation working memory that packages/agent/src/chat-memory.ts:29 disables.
- RUNBOOK.md:105 calls rate_limit_events a usage audit log; packages/agent/src/runtime-config.ts:164 prunes it after 25 hours.
- packages/web/src/app/privacy/page.tsx:87 states Sentry retention is 90 days by default; not checked against the plan in use.
- packages/web/src/app/terms/page.tsx:16-17 treats use as acceptance with no acceptance record, and :110 caps liability at $100; both are points a B2B customer and counsel will revisit.
- .env and packages/agent/.env define GROQ_API_KEY (names only inspected); no source file reads it, so the credential can be removed.
- packages/web/src/app/chat/page.tsx:139 stores the first 60 characters of the question as the thread title, so titles can hold whatever the identifier screen missed.
- packages/crawler/src/crawl/robots.ts:31 and :36 treat a non-200 or failed robots.txt fetch as allow-all; packages/pipeline/src/pipeline/federal/ecfr_client.py:19 and ssa_client.py:18 reuse the User-Agent whose contact URL is 404.
- packages/agent/src/prompt.ts:20 tells the model to open coverage answers with a definitive Yes or No while :22 tells it not to decide personal cases; the boundary between the two is not tested with a fact-pattern question.
- packages/web/src/components/EmptyState.tsx:70-73 ('can't give legal advice or look up individual cases') disappears after the first message; the permanent line at packages/web/src/components/ChatInput.tsx:132 omits 'not legal advice'.

## test-quality

- agent-verifier: packages/agent/src/processors/verifier/answer-validation.ts:144-145 URL regexes are case-sensitive and require a scheme, so `[x](HTTPS://host/fabricated)`, bare `Https://...`, `[x](//host/fabricated)` and `[x](www.host/fabricated)` are not examined (probe: checkedUrlCount 0). The LLM check still applies, so this is loss of the deterministic layer, not a clean bypass.
- agent-verifier: answer-validation.ts:173-175 keeps trailing punctuation on URLs harvested from source text while :199 strips it from answer URLs; a correct citation of a URL that ends a sentence in the source is reported unknown and the answer is withheld (probe).
- agent-verifier: answer-validation.ts:144 `[^)\s]+` truncates link targets that contain ')' (for example .../policy_(2026)), producing a false unknown URL.
- agent-verifier: answer-validation.ts:250 pairs quote characters positionally; one unpaired '"' earlier in the answer (an inch mark) shifts pairing and the real quotation is never checked (probe: checkedQuoteCount 0).
- agent-verifier: packages/agent/src/deep-research/recovery-errors.ts:14 the non-retryable regex matches substrings ('auth' inside 'authority', '401' inside longer numbers); recovery-errors.test.ts has no negative cases for those.
- security-appsec: the installed @mastra/server 1.45.0 server-adapter comment says a request carrying `x-mastra-client-type: studio` needs no route auth when studio.auth is unset; the app's execution gateway is then the only barrier. In my probe (gateway without allowStudio) the header changed nothing: anonymous 401, cross-user 403.
- security-appsec: packages/agent/src/answer-release.ts:21 releaseMessage keeps non-text parts (tool-invocation) outside the HMAC, and answer-release.test.ts:80-86 tampers only with text, never with the signed outcome or with tool parts.
- mastra-installed: @mastra/server and @mastra/deployer resolve to 1.45.0 beside @mastra/core 1.58.0 (root override pins core only).
- contracts-seams: ReleaseManifestSchema, ReleaseGateResultSchema, ReleaseStageResultSchema, ReleaseEventSchema, DeepResearchProgressSchema, ReadinessSchema, DependencyHealthSchema, CorpusStatusSchema, ApiErrorSchema and FeedbackSchema have no runtime importer outside packages/contracts/tests/schemas.test.ts:44; packages/contracts/release-policy.schema.json is referenced by no code.
- ops-deploy-ci: .github/workflows/ci.yml:163-165 the comment 'Hermetic against the Neo4j service...' describes the agent integration step but sits above the cost-audit step.
- pipeline-parse-graph: the Docling fixture's first sections are page furniture ('NC Medicaid' and 'Surgery for Ambiguous Genitalia' twice each, zero or tiny bodies), so repeated page headers become Section nodes.
- pipeline-parse-graph: packages/pipeline/tests/test_resolver_integration.py:75 pytest.skip on reserved-id collision is a silent-green path on the shared 7687 instance.
- e2e: e2e/tests/smoke/chat-roundtrip.spec.ts:14, message-persistence.spec.ts:11 and abuse.spec.ts:13 call test.skip(true, 'Agent not reachable ...'), so an unreachable agent gives a green smoke run with zero checks.
- web-components-ux: packages/web/tests/components/ChatPage.test.tsx:7-98 mocks 14 modules and asserts only mobile-sidebar focus handling; the page's transport and auth wiring is covered only by the mocked Playwright tier.
- packages/agent/tests/tools/search.test.ts:45 (and both integration files) assign globalThis.fetch directly; vi.restoreAllMocks() does not undo that. Use vi.stubGlobal with unstubAllGlobals.
- packages/agent/tests/rate-limit/middleware.test.ts:24 registers a stale '/api/workflows/deepResearchWorkflow/start-async' route while the test at :59 posts to the unregistered '/research/runs' and never checks that response's status.
- packages/agent/tests/rate-limit/middleware.test.ts:33-40 mutates process.env directly and deletes NODE_ENV in afterEach; use vi.stubEnv.
- packages/crawler/tests/crawl/downloader.test.ts:77 `expect(result === null || typeof result === 'string').toBe(true)` cannot fail.
- packages/agent/tests/processors/hallucination-verifier-guards.test.ts:243 and :260 are titled 'strips fabricated URLs' and 'marks a fabricated quote' but assert WITHHELD_ANSWER; the titles describe the old design.
- packages/agent/tests/chat-memory-http.test.ts:30-216 is one 186-line test covering about ten behaviours; an early failure hides the foreign-thread assertions at :183-209.
- packages/agent/tests/answer-release-mastra.test.ts:18-21 mocks extractSources, which gotchas.md:153 warns against; real extraction is covered by chat-memory-http.test.ts.
- packages/agent/tests/answer-release.test.ts:21-32 supplies a single user message, so trustedChatInput's newest-user-message selection (answer-release.ts:49 `.reverse().find`) is not distinguished from 'first user message'.
- packages/agent/tests/execution-gateway.test.ts:107-120: every hidden path matches no rule at all, so the per-rule HTTP method check (execution-gateway.ts:45-46) is unguarded, for example DELETE /chat.
- packages/agent/tests/integration: the two files run in parallel against one graph and both seed 'Policy 8C' sections containing 'coverage'; they rely on orthogonal embeddings to keep 'first hit' assertions stable (retrieval-chains.integration.test.ts:35-40).
- packages/agent/tests/startup-validation.test.ts:53 carries a 25-second timeout and spawns tsx to assert what runtime-config.test.ts:44-55 asserts in-process.
- packages/policy-corpus/package.json has no test:coverage script, so `turbo run test:coverage` skips the package with the retrieval logic.
- No snapshot tests or .snap files exist; no it.only, it.todo or it.skip beyond the env-gated integration suites.

## model-strategy

- ai-sdk-providers: packages/agent/src/model.ts:35-43 routes only gpt-/o1/o3/o4 ids to OpenAI and everything else to Anthropic, so governance-approved Groq or Cerebras ids are unroutable; the o1, o3-mini and o4-mini ids it special-cases shut down on 2026-10-23 per OpenAI's deprecations page.
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/references/llm_extractor.py:144 forces tool_choice, which returns 400 on claude-sonnet-5-5 and claude-opus-5-5; packages/pipeline/src/pipeline/config.py:57 hardcodes claude-haiku-4-5-20251001, whose retirement floor is 'not sooner than October 15, 2026', the nearest date in the lineup (optional feature, still Active).
- pipeline-refs-federal-jev: llm_extractor.py:136-141 caches a system prompt holding the whole document catalog; Haiku 4.5's minimum cacheable prompt is 4,096 tokens and its window is 200K, and a catalog of roughly 8,400 documents may approach that window (size not measured).
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/references/resolver.py:538-542 builds LLM candidates without a title key, so every section is presented to the model as '(untitled)'.
- agent-processors-tools: packages/agent/src/processors/scope-gate.ts:51-56 has no abortSignal and uses SDK default retries, at the classifier's default medium effort; two serial classifier calls precede every chat answer.
- agent-processors-tools: Mastra's runInputProcessors passes messageList.get.input.db() (input-source messages only), so the scope gate's four-message conversation window (scope-gate.ts:34-46) may contain only the new message in production; not verified end to end.
- privacy-compliance-product: Voyage's FAQ says zero-day retention requires an organisation admin to opt out of storage and training use, and agent search queries can contain user-authored text (packages/agent/src/policy-corpus.ts:40-44).
- privacy-compliance-product: TypeSafe documents zero data retention for enterprise customers only and I did not verify hosting location; the Jev scope gate (packages/agent/src/jev/scope.ts:17) would send user text to a vendor outside the approved list.
- pipeline-eval: packages/pipeline/src/pipeline/eval/judge.py:153-161 scores an unparseable judge reply as zeros on every dimension; in the committed 2026-09-22 run q-043 has judge_evidence_stats budget_trimmed true with sources_used 0 and the judge calls a grounded URL fabricated.
- pipeline-eval: docs/validation/qualification-cycle-2026-10-03/cost-scenario.json prices a Sonnet 5.5 judge at 16.5 using Sonnet 4.6 token counts; Anthropic documents about 30% more tokens on 4.7+ models, so about 21.5.
- perf-cost-reliability: packages/pipeline/src/pipeline/embeddings/tokenizer.py:16 sets BATCH_TOKENS to 60000 while Voyage allows 320K tokens per request on voyage-4 and 120K on voyage-4-large; the generator has no Batch API path (33% off, 12-hour window).
- neo4j-live: packages/pipeline/src/pipeline/embeddings/generator.py:76 stores vectors with SET n.embedding=row.embedding (a float list); 106,831 vectors at 1,024 dimensions is roughly 875 MB as 64-bit floats against a 512 MB page cache on Railway (storage format not verified against the live graph).
- model-inventory: packages/agent/src/usage/pricing.ts:21-32 has no entries for claude-haiku-4-5, claude-opus-5-5 or any Groq id, so those rows cost $0 with known false.
- model-inventory: packages/agent/src/chat-memory.ts:27 hardcodes the observer model; Mastra's defaults add temperature 0.3 and maxOutputTokens 100000, and no evaluation covers multi-turn memory quality, so an observer swap is currently unmeasurable.
- agent-deep-research: packages/agent/src/deep-research/config.ts:9 gives planner, workers and writer one model knob; a role split is only worth making once a research evaluation exists.
- ops-deploy-ci: packages/agent/src/health.ts:79-84 treats any status other than 401, 403, 429 or 5xx as healthy, including 404 model-not-found.
- pipeline-eval: packages/pipeline/src/pipeline/jev/benchmarks.py:161-162 hard-wires the scope baseline to gpt-5-mini and its price confirmation string, so the scope qualification benchmark dies with that model.

## model-inventory

- agent-processors-tools: packages/agent/src/processors/scope-gate.ts:37-46 builds a four-message window, but Mastra passes only messageList.get.input.db() (new user input) to processInput (node_modules/@mastra/core/dist/trip-wire-BhUIouVi.js:1036), so follow-ups are probably classified without the preceding conversation.
- agent-deep-research: the planner agent's scope gate and injection detector (packages/agent/src/deep-research/agents.ts:55-64) also run on internal reflection prompts (workflow.ts:369) that contain findings and quotations; a false positive would abort a run after spend.
- agent-deep-research: packages/agent/src/deep-research/usage.ts:48 derives provider from a 'claude-' prefix, which differs from createModel's rule; recordResearchUsage runs only when generate() resolves, so failed worker runs are unrecorded.
- model-strategy: packages/agent/src/index.ts:218 sets no reasoning effort; the provider default is none on gpt-5.4 and medium on gpt-5.6-terra, so the 2026-07-09 A/B and any prod-versus-default comparison mix reasoning settings.
- model-strategy: Voyage documents all 4-series embeddings as mutually compatible; queries could use voyage-4-lite ($0.02/M) or documents voyage-4-large without re-embedding both sides (packages/agent/src/config.ts:5 is stricter than the vendor contract).
- perf-cost-reliability: Voyage's Batch API gives a 33% discount with a 12-hour window; the offline corpus embed (packages/pipeline/src/pipeline/embeddings/voyage_client.py:73) does not use it.
- perf-cost-reliability: packages/agent/scripts/usage-report.ts:40-44 groups only by model, user or day; route and phase are stored but cannot be reported.
- privacy-compliance-product: the installed OpenAI provider leaves the Responses API store option at its default of true (node_modules/@ai-sdk/openai/dist/index.mjs:5029), so prompts and answers are retained as OpenAI application state unless store:false or ZDR is configured.
- privacy-compliance-product: packages/web/src/app/privacy/page.tsx:66-70 lists WorkOS, OpenAI, Anthropic, Voyage, Railway and Sentry; TypeSafe and Exa are absent (both opt-in).
- mastra-installed: @mastra/memory 1.26.1 defaults observational memory to google/gemini-2.5-flash; the explicit model at packages/agent/src/chat-memory.ts:27 is what keeps conversation text on OpenAI.
- mastra-installed: the provider registry bundled in @mastra/core 1.58.0 lists gpt-5-mini, gpt-5.4 and gpt-5.6-terra but no gpt-6 id; whether an 'openai/gpt-6-luna' router string resolves was not tested.
- agent-server: packages/agent/src/load-env.ts:106 installs the Jev validation fetch interceptor from the production environment loader.
- agent-server: usage_events is defined twice (packages/agent/src/storage/app-database.ts:38 and usage/repository.ts:52) and pruned twice with different USAGE_RETENTION_DAYS semantics (repository.ts:110 treats <= 0 as disabled; runtime-config.ts:70 requires a positive value).
- agent-server: packages/agent/src/health.ts:106 sends process.env.AGENT_MODEL untrimmed while :128 trims it; /dependencyz is unauthenticated and triggers paid probes (at most one per minute).
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/jev/benchmarks.py:199 prices OpenAI input tokens with the Jev rate variable; the value is unused for the OpenAI arm.
- pipeline-parse-graph: packages/pipeline/Dockerfile prefetches Voyage tokenizers but not Docling's layout, table and OCR weights (converter.py:65); not verified whether Docling pins their revisions.
- pipeline-eval: the release evaluation fingerprint (packages/pipeline/src/pipeline/evaluation_evidence.py:53-62) records only *_MODEL variables that are set; OpenAI and Anthropic aliases can be re-pointed by the vendor without changing it.
- ops-deploy-ci: .env and packages/agent/.env still define GROQ_API_KEY (names checked only); nothing reads it since the reranker was removed.
- test-quality: no test under packages/agent/tests references createModel or model.ts, so provider routing by id prefix is untested; tests/health.test.ts:24 uses claude-sonnet-4-5 as a fixture id (deprecated 2026-09-30, retiring 2026-11-30).
- ai-sdk-providers: with a claude-* AGENT_MODEL the agent sets no cache_control (grep of packages/agent/src), so a multi-step loop is billed at full input price on every step.
- docs-drift: docs/roadmap.md:111 and :166 still plan 'Sonnet vs. Opus' routing and a voyage-law-2 re-evaluation; RUNBOOK.md:37 gives SENTRY_TRACES_SAMPLE_RATE default 0 while .env.example:78 says 0.1.

## architecture

- dependency-health: packages/web/package.json devDependencies lists @mastra/core ^1.45.0, but nothing under packages/web imports it (only @mastra/client-js in src/lib/mastra-client.ts:1, use-mastra-client.ts:4, thread-helpers.ts:1).
- mastra-installed: node_modules/@mastra/client-js/node_modules/@mastra/core is 1.45.0 (client-js pins it exactly; package-lock.json:3446), so the root override to 1.58.0 does not give a single core resolution in the install tree.
- agent-server: packages/agent/src/storage/app-database.ts:124 opens its libsql client without `timeout`; @libsql/core api.d.ts:54-63 says local operations then fail immediately with SQLITE_BUSY, while Mastra's own connection to the same file sets a busy timeout. Harmless with one synchronous writer; first thing to break with any second process on the file.
- agent-server: packages/agent/src/rate-limit/repository.ts:105-107 returns allowed: true on the branch commented as unreachable, the one fail-open path in the production limiter.
- agent-server: packages/agent/src/answer-release.ts:8 defaults the signing secret to a random per-process value; forgetting configureAnswerRelease would not fail, it would silently turn all history into 'unverified' after each restart.
- agent-deep-research: packages/agent/src/deep-research/routes.ts:83-99 accepts up to 8 edited sub-questions (10,000 chars each, plus a user-settable useWeb flag) with schema validation only; see the gate-coherence finding.
- privacy-compliance-product: AppDatabase.deleteUserData (packages/agent/src/storage/app-database.ts:249) has no caller outside tests; edited research sub-questions bypass the client-identifier screen applied at chat and research start.
- agent-processors-tools: PromptInjectionDetector is constructed without lastMessageOnly (packages/agent/src/index.ts:160-165); in core 1.58.0 the default false means every message handed to processInput gets its own classifier call.
- model-inventory: verifier default model (packages/agent/src/processors/verifier/config.ts:9, gpt-5.6-terra) equals the agent default (packages/agent/src/model.ts:29), so the answer is checked by the same model unless overridden.
- corpus-retrieval: packages/policy-corpus/src/internal/rerank.ts:389-410, 425-428, 450-470 and 533 use 14 inline numeric weights although scoring-constants.ts:1-5 calls itself the single place to tune ranking signals.
- corpus-frames: packages/policy-corpus/src/scope/coverage.ts:28 maps a year-only request to that year's April 1, a MAGI-table rule, and applies it to COVID questions too ('...OTC COVID-19 home tests in 2026?' resolves 2026-04-01 and is refused).
- corpus-frames: packages/policy-corpus/src/internal/shared.ts is a barrel over 14 modules imported by 34 of 68 files, so every pipeline can reach every predicate and term list; there is no internal layering to slow accretion.
- contracts-seams: packages/web/src/lib/use-chat-thread.ts:91-97 posts the whole messages array including tool outputs, while trustedChatInput (packages/agent/src/answer-release.ts:48-53) keeps only the newest user text; with the 2 MB cap (rate-limit/middleware.ts:35) long threads will reach 413 (size not measured).
- perf-cost-reliability: packages/web/src/lib/use-corpus-status.ts:47 polls /corpus-status every 60 s from each open tab; with sleepApplication true (packages/agent/railway.json:19) this probably keeps the agent awake (Railway sleep semantics not checked).
- perf-cost-reliability: chat-path verifier tokens are never recorded (packages/agent/src/processors/verifier/processor.ts:83 passes no onUsage), so usage_events and scripts/usage-report.ts understate chat cost.
- pipeline-eval: packages/pipeline/src/pipeline/eval/levels/answer.py:63-69 takes everything after ---ANSWER--- as the answer; the agent's pino logger also writes to stdout, so a late log line would be judged as answer text (not observed).
- pipeline-release-sources: packages/pipeline/src/pipeline/answer_scope.py:54-81 binds scope approvals to SHA-256 of 25 hand-listed files and evaluation_evidence.py:29-35 hashes every source file of four packages, so a comment edit invalidates baselines.
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/references/supersessions.py:34-39 fails open to an empty map when the data file is missing (the Dockerfile smoke check at packages/pipeline/Dockerfile:52 mitigates).
- docs-drift: docs/development/gotchas.md:108 says a bad VOYAGE_API_KEY makes the retrieval CLI fail; the single-query path (retrieval-cli-runner.ts:105) now degrades to lexical silently via packages/agent/src/policy-corpus.ts:120-126.
- docs-drift: graphify-out/GRAPH_REPORT.md is dated 2026-07-07 and covers 66 files; its god nodes (normalizeSearchText, analyzeQuery, includesPhrase) still match, but it predates most of the release machinery.
- test-quality: e2e mocked project replaces the backend with hand-built streams (e2e/helpers/stream-builder.ts, mock-routes.ts), so no CI test spans the real agent and the web client.
- code density: the newest modules are packed one-liners (packages/policy-corpus/src/scope/coverage.ts has 14 lines over 200 characters, max 419; packages/agent/src/answer-release.ts, jev/eval-worker.ts similar), which raises review cost exactly where the trust boundary lives.

## ai-sdk-providers

- packages/agent/src/processors/verifier/verify.ts:98 - maxRetries 0 and processor.ts never reads result.retryable: one transient 429/5xx/timeout withholds a fully paid answer; consider one bounded retry inside the 30 s budget (the cheap fail-open classifiers get two retries).
- packages/agent/src/processors/verifier/verify.ts:111 - user message orders QUESTION, ANSWER, SOURCE DOCUMENTS and evidence.ts:467 orders sources cited-first by candidate, so a second pass cannot reuse cached sources; on gpt-5.6-terra each pass also pays the 1.25x implicit cache write on mostly unique tokens.
- packages/agent/src/processors/answer-frame-prefetch.ts:14 - activeTools shrinks the tools array to one tool on step 0 (verified: step 0 sends 1 tool, step 1 sends 9), so step 1 cannot reuse step 0's cached prefix; providerOptions.openai.allowedTools keeps the list constant. Step 0 is also a full model round trip for a call whose only required argument is the user's question (agent-processors-tools).
- packages/agent/src/index.ts:210 - date line uses the server's local date with no timeZone (likely UTC on Railway), so after about 8 pm Eastern the prompt states tomorrow's date; OpenAI also advises putting timestamps at the end of developer instructions.
- packages/agent/src/health.ts:56 - OpenAI probe uses Chat Completions with max_completion_tokens 1 while every production call uses Responses, and it never touches AGENT_MODEL or VERIFIER_MODEL.
- packages/agent/src/health.ts:106 - Anthropic probe and key check are keyed on AGENT_MODEL only; DEEP_RESEARCH_MODEL=claude-* is neither probed nor key-validated (runtime-config.ts:113).
- packages/agent/src/model.ts:26 - comment says 'SAME price ($2.50/$15)' but pricing.ts:26 and the live model page give $2/$12 for gpt-5.6-terra.
- scripts/eval-ab.sh:26 - header says CANDIDATE_DIMS default 2048 (actual default 1024 at line 47), lines 42-46 say voyage_client posts no output_dimension (it does), and the embeddings baseline arm is still voyage-law-2.
- packages/agent/src/chat-route.ts:117 - no safetyIdentifier or user on any OpenAI call; a hashed WorkOS id would let OpenAI attribute abuse to one end user instead of the organisation key.
- packages/agent/src/chat-route.ts:117 - no promptCacheKey or promptCacheRetention; OpenAI recommends a stable key on pre-5.6 models and gpt-5.4 (deployed) supports 24h retention; measured cached share in the Oct 3 sample was 35 percent of generation input.
- packages/agent/src/index.ts:204 - no maxOutputTokens on agent, verifier (verify.ts:94) or scope gate (scope-gate.ts:51); the Oct 3 cost sample capped generation at 8,192 tokens without failures.
- agent-deep-research: packages/agent/src/deep-research/workflow.ts:207 - agent.generate calls receive no abortSignal or timeout, so workflowRun.cancel() cannot interrupt an in-flight model call.
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/references/llm_extractor.py:144 - forced tool_choice works on claude-haiku-4-5 but is rejected (400) by Sonnet 5.5 and Opus 5.5; lines 274-280 skip a failed 30-section batch with no retry and return partial results as if complete; lines 284-291 attribute duplicate (target_id, matched_text) matches to the first section.
- pipeline-eval: packages/pipeline/src/pipeline/eval/judge.py:78 - temperature 0 is accepted by claude-sonnet-4-6 but non-default sampling values return 400 on Claude Sonnet 5.5, the audit's proposed judge; no retry on 429 or 5xx.
- security-appsec: packages/agent/src/sensitive-data.ts:13 - member_id regex matches ordinary phrases ('beneficiary no longer', 'Medicaid identification'); the ssn rule at line 9 matches ZIP+4 such as 27699-2501; 93 of 500 recent eval evidence bundles contain a match.
- privacy-compliance-product: packages/web/src/app/privacy/page.tsx:79 - says conversations are kept until deleted, while runtime-config.ts:161 prunes at 90 days and, with store=true, OpenAI keeps Response objects for 30 days after a thread is deleted.
- model-strategy: OpenAI's deprecation table names gpt-5.6-terra as the replacement for gpt-5-mini, i.e. the mid tier of the 5.6 family; the flagship is gpt-5.6-sol.
- packages/agent/src/chat-memory.ts:27 - observer model 'openai/gpt-5.4-mini' and the detector model are the only roles not configurable by env; they go through Mastra's router (bundled @ai-sdk/openai 3.0.88) while other roles use the app's 3.0.74.
- packages/agent/src/answer-release.ts:127 - every provider error is rewritten to one string ('The answer could not be completed. Please try again.'); a quota 429 and a transient 5xx look identical to the user.
- packages/pipeline/src/pipeline/config.py:57 - claude-haiku-4-5-20251001 is Active, but Anthropic's deprecations page lists its retirement as not sooner than 2026-10-15.
- packages/agent/src/jev/scope.ts:17 - the opt-in Jev scope gate sends the conversation window to api.typesafe.ai; governance decision (d) should be checked before enabling.
- packages/agent/src/deep-research/usage.ts:48 - provider label derived from startsWith('claude-'), a fourth copy of the routing rule.
- packages/agent/src/index.ts:352 - CLI and deep-research use agent.generate (non-streaming doGenerate) while web uses doStream; with Anthropic ids the installed provider would send max_tokens 128000 on those non-streaming calls.

## docs-drift

- ops-deploy-ci: production chat-store backup (scripts/ops/backup-mastra.sh:55) has failed daily from 2026-09-22 to 2026-10-04; Railway SSH returns account JSON instead of running the command; last success 2026-09-21 (~/Library/Logs/nc-medicaid/backup-mastra-*.log).
- ops-deploy-ci: launchd daily-check and weekly-refresh die at the crawl step with better-sqlite3 ERR_DLOPEN_FAILED under Node 26.9.0; plist PATH at scripts/ops/launchd/com.ncmedicaid.weekly-refresh.plist:24.
- ops-deploy-ci: ~/.cache/nc-medicaid is empty, so scripts/ops/eval-gate.sh:34-37 would pass without a baseline and weekly-refresh.sh:63 would not skip the production deploy on the next completed run.
- ops-deploy-ci: the weekly corpus backup is step 7 of scripts/ops/weekly-refresh.sh:91 and has not been reached since at least 2026-09-12.
- ops-deploy-ci: scheduled corpus-job mode runs a paid answer evaluation on the first of each month (scripts/ops/railway-corpus-job.sh:101-110).
- privacy-compliance-product: packages/web/src/app/privacy/page.tsx:80 says conversations are kept until deleted; code deletes after 90 idle days. page.tsx:66-70 processor list omits Exa (EXA_API_KEY) and TypeSafe (SCOPE_GATE_PROVIDER=jev).
- security-appsec: the local root .env contains GROQ_API_KEY, which no code reads since the reranker was removed; packages/agent/.env and packages/web/.env.local are untracked symlinks to the root file, so the web process receives every provider key.
- security-appsec: /dependencyz makes provider calls and is registered with requiresAuth: false (packages/agent/src/readiness.ts:130-134).
- model-inventory: scripts/eval-ab.sh:9-10 and 27-28 document stale baselines (voyage-law-2, gpt-5.4-mini verifier); header says CANDIDATE_DIMS default 2048, line 47 sets 1024.
- model-inventory: packages/agent/src/model.ts:26 comment says terra costs the same as gpt-5.4 ($2.50/$15); usage/pricing.ts:26 lists 2/12.
- agent-server: packages/agent/src/sentry.ts:11-15 comments contradict the code below them (lines 24-42).
- agent-server: packages/agent/src/index.ts:127-130 comment says the kill switch covers working memory; chat-memory.ts:29 disables it unconditionally.
- agent-server: duplicate defaults for AGENT_MODEL (runtime-config.ts:87, model.ts:29) and USAGE_RETENTION_DAYS (runtime-config.ts:163, usage/repository.ts:110).
- pipeline-eval: packages/pipeline/src/pipeline/eval/levels/answer.py:168-169 comment says evals run the injection detector and observational memory; gotchas.md:79 says the CLI skips both.
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/cli/federal.py:22 help text says ssa.gov; ssa_client.py:22 fetches uscode.house.gov.
- pipeline-parse-graph: build-mixed-corpus defaults to --reset (packages/pipeline/src/pipeline/cli/build.py:373-374) and is the only dev-sized build path.
- crawler: the URL in docs/development/gotchas.md:90 now redirects to /about-nc-medicaid/health-plans.
- test-quality: RUNBOOK.md:292 lists npm run test:integration as a routine check; it writes and deletes test:agent-tools:* nodes in whatever graph NEO4J_URI names (packages/agent/tests/integration/neo4j-tools.integration.test.ts:20,38-44).
- RUNBOOK.md:22 routing description omits the o1 prefix (packages/agent/src/model.ts:37).
- RUNBOOK.md:25, :84 and :109 still describe working memory as active (packages/agent/src/chat-memory.ts:29).
- RUNBOOK.md:309 and docs/development/gotchas.md:64 say to set agent watch paths in the Railway UI; packages/agent/railway.json:6-12 sets watchPatterns.
- RUNBOOK.md:301 and :379 call /healthz the health check; Railway uses /readyz (packages/agent/railway.json:15); /livez and /dependencyz are undocumented.
- RUNBOOK.md:444 '~30 minutes' full rebuild and :424 RTO predate the fee-schedule and managed-care families (docs/development/gotchas.md:8).
- RUNBOOK.md:471 lists 42 and 45 CFR only; packages/pipeline/src/pipeline/config.py:97 also ingests 2 CFR Part 200.
- docs/development/README.md:9-11 bootstraps uv into .local-recovery/uv-tools; that directory does not exist on the owner's machine, which uses Homebrew uv 0.12.18 rather than the pinned 0.8.22.
- docs/development/README.md:15 does not mention that pipeline setup downloads two tokenizer files from huggingface.co (packages/pipeline/src/pipeline/embeddings/tokenizer.py:31).
- docs/development/gotchas.md:16 is a mid-file migration marker ('carried forward from main at dc81a97'); lines 181-246 sit under the wrong heading.
- docs/development/gotchas.md:8 cites about $115 for corpus embedding; docs/validation/fee-compaction-2026-10-04/README.md:20 replaces it with a $13.66 projection.
- docs/development/jev.md does not record the hosting and retention check done for TypeSafe; it exists only in the owner's memory note.
- packages/pipeline/data/audits/latest-corpus-audit.md:3 is dated 2026-07-10 and lists ten families.
- README.md:57 says npm test covers crawler, policy-corpus, agent, web and pipeline; turbo also runs contracts, and pipeline tests can read the workstation registry (docs/development/gotchas.md:193).
- README.md:72-80 package table links agent, pipeline, policy-corpus and contracts to directories that have no README.
- Unindexed and unlabelled: docs/refactor-2026-06-19.md (still says IN PROGRESS), docs/status-update-2026-03-28.md, docs/status-update-2026-03-29.md, docs/legal/terms-of-use-analysis.md, packages/pipeline/docs/agent-requirements.md, graphify-out/GRAPH_REPORT.md (dated 2026-07-07).
- docs/decisions/0001-repository-knowledge.md:3 status line carries no date.
- greptile.json:2 ignores docs/archive but not docs/validation (248 JSON files, 4.6 MB), docs/superpowers or docs/reviews.
- .claude/settings.local.json:4-5,41 still allow brv commands and untracked .brv directories remain in three packages (docs/development/knowledge-workflow.md:32 asks for their removal).
- docs/diagrams/system-design.svg is labelled IMPLEMENTATION VIEW (22 September 2026) and draws active and candidate graphs as deployed; docs/operations/blue-green-corpus-releases.md:491 says production remains legacy.
- .nvmrc:1 was missed by PR #152.

## mastra-upstream

- agent-verifier: packages/agent/src/processors/verifier/processor.ts:69 strips `reasoning` parts between steps. A probe shows the next model call then receives only `tool-call(itemId=fc_1)`. This is safe on the installed @ai-sdk/openai 3.0.74 because ordinary function calls replay by value without an item id (node_modules/@ai-sdk/openai/dist/index.mjs:3057-3063); re-qualify on the AI SDK 7 provider and before enabling Anthropic extended thinking, which requires thinking blocks to be preserved with tool use.
- ai-sdk-providers: issue #145's stated blocker is stale. Installed core 1.58.0 already types `MastraModelConfig = ... | LanguageModelV4 | ...` (node_modules/@mastra/core/dist/llm/model/shared.types.d.ts:59; added in core 1.47.0, #18477). The issue was filed against core 1.45.0. The remaining Mastra-side prerequisite is @mastra/ai-sdk >= 1.9.0 for `version: 'v7'` (1.10.5 for ai >= 7.0.103 types); installed 1.5.0 accepts only 'v5' | 'v6'. The comment at packages/agent/src/model.ts:5-8 is stale for the same reason.
- agent-server: packages/agent/src/index.ts:256-258 constructs the route-level MastraAuthWorkos without `trustJwtClaims`, so each protected request makes a WorkOS `getUser` call (node_modules/@mastra/auth-workos/dist/index.js:165-167) on top of the middleware's JWKS check, and a WorkOS API failure there becomes a 401.
- agent-server: adding `mapUserToResourceId: user => user.id` to the server auth provider would be cheap defence in depth; the middleware must stay because the rate limiter and gateway need the id before route auth. Server 1.64.0 logs a startup warning when auth is configured without the mapper (#22915).
- agent-server: packages/agent/src/index.ts:127-130 calls observational memory a cross-conversation per-user profile. The default scope is per thread (bundled docs-memory-observational-memory.md:597) and working memory is disabled at packages/agent/src/chat-memory.ts:29.
- agent-server: packages/agent/src/index.ts:16 and :246 use `DefaultExporter`, deprecated in favour of `MastraStorageExporter`; the explicit `SensitiveDataFilter` at :247 is auto-applied already per the bundled reference.
- privacy-compliance-product: `MASTRA_TELEMETRY_DISABLED` is not set in packages/agent/Dockerfile, railway.json, docs or either .env file (names only checked). Core telemetry posts to us.posthog.com (node_modules/@mastra/core/dist/telemetry/index.js:7-8) and the installed server calls `syncUsageTelemetry` at startup (node_modules/@mastra/deployer/dist/server/index.js:4462). No user content is sent; set the variable to make the absence of third-party calls explicit.
- privacy-compliance-product: packages/agent/src/sensitive-data.ts:9 matches SSNs only with ASCII hyphen or space separators. Executed check: `123–45–6789` (en dashes), `123.45.6789` and full-width digits are not detected.
- mastra-installed: installed @mastra/ai-sdk 1.5.0 predates the 1.5.1 fix for leaking the system prompt in error responses (#18335). It is mitigated on /chat because packages/agent/src/answer-release.ts:127 rewrites every `error` chunk, but packages/agent/src/chat-route.ts:127-131 still forwards the raw error to logs and Sentry.
- test-quality: packages/agent/tests/helpers/client-request-context.ts:5-9 hand-copies eight reserved request-context keys; server 1.74.0 reserves ten (adds `mastra__inheritedMemory` and `organizationId`). The copy is conservative, not unsafe, but no test boots the real server adapter.
- agent-deep-research: packages/agent/src/deep-research/repository.ts:320 anchors the public-message regex at `^Research (step budget|...)`, but on core 1.58.0 a budget failure surfaces as "Exhausted all fallback models. Last error: Research step budget exhausted..." (probe), so users get the generic message.
- agent-deep-research: packages/agent/src/deep-research/service.ts:27-48 defines duck-typed `WorkflowLike` shims, `extractPlan` at :50-61 probes three possible suspend-payload shapes, and routes.ts:58,98,119 cast `c.get('mastra') as unknown as ResearchMastra`.
- web-app-lib: packages/web/src/components/ThreadSidebar.tsx:180-184 sends the cached thread `metadata` back on rename; the server replaces metadata wholesale (node_modules/@mastra/server/dist/chunk-HZWJL5Y4.js:1162), so a rename can roll back observational-memory thread metadata written since the list was fetched.
- dependency-health: main's lockfile holds a second @mastra/core 1.45.0 under node_modules/@mastra/client-js despite the root override; .nvmrc says 22.22.0 while package.json:9 engines say 22.23.3.
- agent-processors-tools: no upstream changelog entry between core 1.45 and 1.74 names the "Duplicate item found with id" failure that packages/agent/src/processors/openai-responses-dedup.ts works around; keep it until a recorded duplicate history proves it unnecessary.

## dependency-health

- ops-deploy-ci: .github/workflows/claude.yml:35 and .github/workflows/claude-code-review.yml:40 use `anthropics/claude-code-action@v1`, a mutable tag, with `id-token: write` and an OAuth secret, while every action in ci.yml is pinned to a commit SHA.
- docs-drift: RUNBOOK.md:6 says root engines.node is `>=22.12.0`; package.json:9 pins exactly 22.23.3.
- ops-deploy-ci: packages/pipeline/Dockerfile:39 `RUN npm ci` and :46 `uv sync --frozen --extra dev` put the full dev toolchains (1,333 npm packages; pytest, ruff, vulture) into the production corpus-job image.
- crawler: packages/crawler/package.json:30 `domhandler ^6.0.1` is used for one `import type { Element }` (packages/crawler/src/sources/medicaid-page-documents.ts:2) while cheerio 1.2.0 produces domhandler 5.0.3 nodes; pin ^5 or take the type from cheerio.
- crawler: two undici majors load in the crawler process (8.11.2 at packages/crawler/src/crawl/fetcher.ts:1; 7.30.0 through cheerio's entry point); they are independent and no global dispatcher is shared.
- mastra-upstream: @mastra/loggers 1.3.3 and 1.3.4 declare peer `@mastra/core >=1.0.0-0` but import `buildLogRecordData`, which core 1.58.0 lacks; mastra 1.31.4, deployer 1.72.0 and server 1.72.0 claim `>=1.58.0-0` yet fail with it. Worth an upstream issue.
- mastra-installed: a 2026-07-18 local build manifest (packages/agent/.mastra/output/package.json, untracked) lists `typescript` 6.0.3 as a runtime dependency of the server bundle (24 MB); confirm against the current image.
- packages/agent/package.json:1 and packages/crawler/package.json:1 have no `"private": true`, unlike the other workspaces.
- package-lock.json: `npm ls --package-lock-only` also flags @emnapi/core, @emnapi/runtime, @emnapi/wasi-threads and @napi-rs/wasm-runtime as invalid (bundled dependencies of the optional @tailwindcss/oxide-wasm32-wasi are absent from the lock); benign, but it keeps `npm ls` red.
- e2e/package.json:1 declares no engines or packageManager and resolves @types/node 25.5.0 from the root node_modules by directory walk-up; its iron-session and jose versions must be kept equal to the root lock by hand.
- packages/agent/Dockerfile:2, packages/web/Dockerfile:2, packages/pipeline/Dockerfile:16 and .github/workflows/ci.yml:91,188 run `npm install --global npm@11.11.0` because Node 22 bundles npm 10.9.9: an extra network step per build with no integrity pin.
- packages/pipeline/Dockerfile:11 `RAILWAY_CLI_VERSION=5.17.0` and :29 uv 0.8.22 have never received a Dependabot PR (none among 53); whether the docker updater parses `COPY --from=` lines was not confirmed.
- .github/dependabot.yml:66-81: `tokenizers==0.22.2` (packages/pipeline/pyproject.toml:20) is not in the uv ignore list; today only transformers' upper bound prevents a bump that would change embedding-plan token counts.
- eslint 9.39.5 is now marked deprecated on npm (`This version is no longer supported`); the recorded ESLint 10 blocker still holds (eslint-plugin-react 7.37.5 peer stops at ^9.7; jsx-a11y and import stop at ^9).
- packages/agent/package.json:33 `ai ^6.0.209`: AI SDK 7.0.127 and @ai-sdk/* 4.x are generally available; the v6 line still receives backports (6.0.300). Tracked by #145.
- package-lock.json holds three zod versions in five copies (3.25.76 at root; 4.6.5 under @mastra/memory and the two MCP packages; 4.3.6 under zod-from-json-schema). Tracked by #147.
- Local only: node_modules predates the lock (probe-image-size 7.2.3 installed against 7.4.0 locked; extraneous @emnapi/* and @img/sharp-wasm32), and better-sqlite3 is built for Node 26's ABI 147.
- privacy-compliance-product: packages/agent/src/tools/web-search.ts:42 sends the model-written search query to Exa when EXA_API_KEY is set; Exa is not on the documented inference-provider list.
- packages/pipeline/src/pipeline/parse/converter.py:719 converts downloaded .doc files with the LibreOffice shipped by Debian bookworm, which is in its LTS phase (end of life 2028-06-30 per endoflife.date).
- security-appsec: @mastra/core's `isEEEnabled()` is true whenever NODE_ENV is not production or prod, so tests and local runs exercise Mastra with Enterprise auth capabilities on and production with them off (see finding 11).
- packages/agent/package.json:43 `hono` as a devDependency is correct: the three source imports are `import type` (auth-middleware.ts:3, execution-gateway.ts:2, rate-limit/middleware.ts:2).
- package-lock.json: five packages have install scripts that `npm ci` runs in every image (@sentry/cli and better-sqlite3 in the production set; esbuild, unrs-resolver, fsevents otherwise); no `--ignore-scripts` anywhere.

## rag-design

- corpus-retrieval: packages/policy-corpus/src/retrieval/backends/keyword.ts:60 ties in the section keyword backend break on `s.content_length DESC`, favouring the longest sections; the same pattern is at policy-scoped.ts:85 and document-expansion.ts:59.
- corpus-retrieval: packages/policy-corpus/src/retrieval/collector.ts:45 calls fulltext an 'exact-phrase Lucene search', but base.ts:1 escapes double quotes, so the query is a bag of terms; its BM25 score is discarded for a rank-based mid score (collector.ts:184).
- corpus-retrieval: packages/policy-corpus/src/retrieval/backends/chunk-vector.ts:34 swallows every error with a comment about a missing index, which would also hide a dimension mismatch or query failure.
- corpus-retrieval: packages/policy-corpus/src/internal/scoring-constants.ts:10-13 says Neo4j's vector index cannot pre-filter; Neo4j documents in-index filtering (SEARCH ... WHERE) as generally available from 2026.02 including Community Edition, with `IN` predicates from 2026.06; the local container is 2026.05, so document_type would need to be denormalised onto Section and Chunk and declared as an index property.
- corpus-retrieval: 77 numeric scoring constants (scoring-constants.ts) plus 13 inline score literals in rerank.ts are added to raw cosine scores; base scores range from 0.35 (section keyword) to 1.04 (change-notice header).
- perf-cost-reliability: every retrieval hit carries the full `s.content_text` (up to 38 MB in the local graph) over Bolt and through JavaScript substring scans in rerank.ts:215-225.
- agent-processors-tools: packages/agent/src/tools/concepts.ts:17 advertises relationship types "GOVERNS" and "REFERENCES_CONCEPT" that the pipeline never creates (pipeline/graph/corpus_types.py:8 allows only COVERS, DEFINES, RESTRICTS); such calls return an empty list.
- agent-processors-tools: packages/agent/src/tools/search.ts:19 offers "change_notice" as a document-type filter, but all 4,267 change_notice documents in the local graph have zero sections, so the filter can return nothing.
- agent-processors-tools: packages/agent/src/prompt.ts:83-87 lists five document types; the graph also holds fee_schedule, state_plan_amendment, managed_care_contract, managed_care_guidance, bulletin, waiver, provider_manual and federal_statute.
- agent-processors-tools: packages/agent/src/tools/read.ts:15 gives the example id "doc-123:sec-4.1", which does not resemble real ids (sec:doc:...).
- agent-processors-tools: packages/agent/src/prompt.ts:119 'Always provide a substantive final answer, even when the corpus is incomplete' pulls against abstention; the golden set has no question whose correct outcome is 'not in the corpus'.
- corpus-frames: packages/policy-corpus/src/scope/policy.json:81 sets `supported_until` to 2026-12-31 for the current MAGI table, so undated MAGI income questions will be refused from 2027-01-01 until the file is edited.
- agent-verifier: packages/agent/src/processors/verifier/verify.ts:97 uses a 30-second timeout with no retry; the September milestone recorded verification p95 of 24.2 s and a maximum of 36.8 s.
- agent-server: packages/agent/src/index.ts:127-130 describes observational memory as cross-conversation with a per-user profile; the installed default scope is 'thread' and working memory is disabled (chat-memory.ts:29).
- pipeline-eval: saved answer-eval configs omit the agent model (July files) so the two arms of an agent A/B at one git sha are indistinguishable; packages/pipeline/src/pipeline/eval/levels/answer.py:177 reads AGENT_MODEL but the result config does not record it.
- pipeline-eval: scripts/eval-ab.sh:8-9 and :41-46 still describe voyage-law-2 and gpt-5.4-mini baselines and say voyage_client posts no output_dimension; voyage_client.py:75 now sends it.
- pipeline-eval: in the September milestone the judge deducted hallucination points on q-031 for citing section 2.1.1, a label that does not appear in the answer text, and on q-043 for a URL that had passed the deterministic URL check.
- pipeline-parse-graph: packages/pipeline/src/pipeline/graph/loader.py:253 matches only zero-padded MM/DD/YYYY dates when deriving a clinical policy's effective date; revision tables also contain forms such as 1/1/08.
- pipeline-parse-graph: 12,348 of 71,695 sections in the local graph are empty headings and the median section is 375 characters; small fragments are embedded individually with their breadcrumb.
- docs-drift: docs/development/gotchas.md:114 records section 2.1.1 as the policy description or scope section; in the stored policies the description is section 1.0.

## mutation-probe

- [mutation-probe] X14 survived and is not promoted to a finding only because of the finding cap: packages/agent/src/processors/verifier/evidence.ts:330, deleting `...frame.supportingSections,` from extractFrameCorpusSections passes 143/143 tests in 13 files; tests/processors/verifier-frame-evidence.test.ts:9 puts the same section in primary and supporting, so supporting-only evidence is never asserted. Effect is fail-closed: valid answers citing supporting sections would be withheld. diagnostics.probe.test.ts kills it.
- [mutation-probe] X08's textual form (`&& part.type !== 'finish'` at answer-release.ts:120) would not pass tsc (TS2367); it stands for deleting the fallback block at answer-release.ts:120-126. All other surviving mutants were written to leave no unused binding or type error (by inspection; tsc and eslint were not run).
- [agent-verifier] packages/agent/src/processors/verifier/processor.ts:101 replaceFinalAnswerText and answer-validation.ts:282 renderCorrectedAnswer have no caller in packages/agent/src, yet tests/processors/hallucination-verifier.test.ts:573-648 and :760-815 hold 14 tests for them (grep-verified).
- [mastra-installed] node_modules/@mastra/core/dist/trip-wire-BhUIouVi.js:1534-1612 (core 1.58.0) calls processOutputStep without abortSignal, so `signal: abortSignal` at processor.ts:83 is always undefined: a client disconnect cannot cancel the paid verifier call (a real-Mastra probe saw no signal on either turn).
- [security-appsec] chat-route.ts:57-60 accepts any client-chosen thread id when no thread row exists, and @mastra/libsql keys thread-scoped observations by thread id alone (node_modules/@mastra/libsql/dist/index.js:7563); together with finding 4 this is what lets a stale summary follow a reused id.
- [privacy-compliance-product] packages/web/src/app/privacy/page.tsx:80 says conversations 'are kept until you delete them', but runRetention (app-database.ts:241) deletes threads idle for CONVERSATION_RETENTION_DAYS, default 90 (runtime-config.ts:161).
- [docs-drift] RUNBOOK.md:78-84 'Retention in force' omits the conversation-retention job and says memory profiles are kept while the account exists; RUNBOOK.md:18 names gpt-5.4-mini as the verifier while processors/verifier/config.ts:9 defaults to gpt-5.6-terra.
- [test-quality] packages/agent/tests/chat-memory-http.test.ts:213 storage.close() logs 'LibSQLStore: Failed to checkpoint WAL before close ... SQLITE_BUSY' on every run (3 of 3) while exiting 0: background writes are still in flight at teardown.
- [agent-verifier] run.ts:126 `sources.some(s => s.text.trim())` is satisfied by any extracted entry, including the routing-hint frame or a metadata-only getDocument or lookupPolicy listing, because every extractor emits a non-empty header (evidence.ts:127, 155, 206, 265); 'evidence present' does not mean corpus body text was retrieved (read, not run).
- [mutation-probe] answer-release.ts:71: 'listMessagesByResourceId' is wrapped by the release gate but no test calls it (grep); not mutated.
- [mutation-probe] rate-limit/middleware.ts:36 and :59: PUT and PATCH bodies and the exact boundary (Content-Length equal to MAX_BODY_BYTES) are not exercised by tests/rate-limit/middleware.test.ts, which uses POST with 99, 101 and 10000; not mutated.
- [mutation-probe] execution-gateway.ts:45-46: no test sends a disallowed method to an owned path (for example DELETE /chat); not mutated because Mastra registers no handler there today, so the mutant would be behaviourally equivalent.
- [agent-deep-research] deep-research/repository.ts:193, :197 and :306: the early-claim guard (next_retry_at), the lease-expiry filter in the concurrency count and lease_owner on complete() are each backed by a second layer and have no isolating test (read, not mutated); service.ts:329 cancel() ownership is likewise never tested with a non-owner.

## prior-findings

- agent-verifier: replaceFinalAnswerText (packages/agent/src/processors/verifier/processor.ts:101) and renderCorrectedAnswer (verifier/answer-validation.ts:282) are imported only by tests; `const substanceLoss = false` (verifier/run.ts:96) and `pure_marker_fallback: false` (run.ts:161) are constant telemetry. The regression test for the June 'rewrite clobbers history' bug now exercises dead code.
- agent-verifier: buildSourceText breaks at the first block that exceeds the budget and drops every later source, including cited ones (packages/agent/src/processors/verifier/evidence.ts:476-480).
- pipeline-eval: answer-level result files carry retrieval-named keys derived from judge scores (packages/pipeline/src/pipeline/eval/levels/answer.py:585-588), so baseline.json reads as recall_at_k 0.92 when no retrieval ran.
- pipeline-eval: a judge response that fails JSON parsing returns all-zero scores instead of an error row (packages/pipeline/src/pipeline/eval/judge.py:153-161).
- pipeline-eval: scripts/eval-ab.sh:37 defaults to the held-out dataset whose IDs no longer exist in current graphs.
- pipeline-eval: the documented held-out baseline of 2.82 +/- 0.08 (docs/reviews/2026-06-11-remediation-plan.md:18) is the high end of the 27-run population kept locally (mean 2.768, sd 0.059).
- docs-drift: RUNBOOK.md:18 and :23 give the verifier default as gpt-5.4-mini; the code default is gpt-5.6-terra (packages/agent/src/processors/verifier/config.ts:9).
- docs-drift: docs/development/gotchas.md:23, :27 and :37 attribute the eCFR 406 to the server.
- docs-drift: docs/roadmap.md was last changed on 2026-03-29 and still targets a first paying customer by mid-May 2026.
- docs-drift: the body of issue #188 still lists eCFR 406 and the legacy identity out-of-memory failure as failing; both are repaired on main per docs/validation/qualification-unblock-2026-10-03/README.md.
- model-strategy: production and the corpus job pin AGENT_MODEL=gpt-5.4 (docs/validation/qualification-cycle-2026-10-03/model-audit-live.json) while the July A/B winner and code default is gpt-5.6-terra (packages/agent/src/model.ts:29); activation swaps only four target keys (packages/pipeline/src/pipeline/bootstrap_activation.py:16-21) and never compares the agent's model variables with the evaluated fingerprint.
- e2e: the mocked restore fixture is still one assistant message with the answer text after the tool part (e2e/tests/mocked/feedback.spec.ts:95-117), the CI blind spot the QA report named for F-RESTORE-001.
- web-app-lib: packages/web/src/lib/message-verification.ts:63-80 still parses data-verification-rewrite and data-verification-ok parts that the server drops (packages/agent/src/answer-release.ts:118-119).
- web-app-lib: pinnedRef is not reset on thread switch (packages/web/src/lib/use-pinned-scroll.ts:34) and handleRerun has no streaming guard (packages/web/src/lib/use-answer-versions.ts:56).
- web-components-ux: 'sub-questions' and 'corpus sources' are not pluralised for a count of 1 (packages/web/src/components/DeepResearchReport.tsx:129-130); the source-list anchors at :97 and :116 are not protocol-checked.
- agent-server: feedback routes read the legacy `user` context key (packages/agent/src/feedback/routes.ts:9) while chat and research use getBoundUserId.
- agent-processors-tools: the citation specification exists three times (packages/agent/src/prompt.ts:5, :50-59, :96-105); evergreen rule 'Check amendments for every document you cite' (prompt.ts:7) conflicts with 'Do not widen beyond the current structured frame' (answer-frame-planning.ts:744).
- corpus-frames: MAGI support ends at 2026-12-31 in packages/policy-corpus/src/scope/policy.json (magi_tables supported_until), after which current-date MAGI questions become unsupported until re-review.
- corpus-retrieval: retrieval_ready=false and answer_ready=false are 0.18 score penalties, not filters (packages/policy-corpus/src/internal/rerank.ts:283-290).
- ops-deploy-ci: the pipeline image has no USER instruction and runs as root (packages/pipeline/Dockerfile).
- perf-cost: 'Thanks, that helps.' forces a resolveAnswerFrame call with search terms thanks, thank, that, helps (packages/agent/src/processors/answer-frame-prefetch.ts:13-15).

## perf-cost-reliability

- agent-processors-tools (important, verified in installed code, not spent as a finding): Mastra 1.58 runInputProcessors passes messageList.get.input.db(), i.e. only this request's new user message (node_modules/@mastra/core/dist/trip-wire-BhUIouVi.js:1036, message-list-CTjNC4HJ.js:12215). scope-gate.ts:34-46 conversationWindow therefore never sees prior turns, and coverage-boundary.ts:8-21 coverageConversationQuery never carries a scoped subject into a follow-up such as 'June 2025?', which also sets COVERAGE_VERIFICATION_QUERY for the verifier. Unit tests pass multi-message arrays directly, so they do not exercise the production shape.
- packages/agent/src/index.ts:148-150 TokenLimiterProcessor default trimMode is best-fit: it walks newest to oldest and skips any message that does not fit, so one oversized current-turn assistant message (accumulated tool results) can be dropped while older history is kept; dropped messages are removed from the list for the rest of the run. Derived from source, not run.
- corpus-retrieval: packages/policy-corpus/src/primitives/concepts.ts:47-57 findConceptSections has no LIMIT; policy-lookup.ts:67-70 returns every section of up to 25 documents; sections.ts:146 getDocument returns every section. Tool results are unbounded and feed the limiter above.
- corpus-retrieval: packages/policy-corpus/src/primitives/sections.ts:31 transfers the full content_text and record-mapping.ts:142-145 truncates to 6,000 chars client-side; text beyond 6,000 chars of a leaf section cannot be read by the model.
- packages/policy-corpus/src/frame/context/hydration.ts:33-40 hydrates frame sections with sequential awaited getSection calls (also :94-99 and :112-117), re-fetching bodies the search already returned.
- packages/agent/src/policy-corpus.ts:113-127 no cache for query embeddings; the sample shows 2-3 sequential Voyage calls inside every frame.
- packages/agent/src/policy-corpus.ts:22 retrievalMode is a module global written by every request; /corpus-status reports whichever request wrote last.
- packages/agent/src/neo4j.ts:44 maxTransactionRetryTime has no effect because every query uses session.run; :41-45 sets no maxConnectionPoolSize (default 100) and no connectionLivenessCheckTimeout, so sockets left stale by a Neo4j restart or blue-green switch surface as first-query failures.
- packages/agent/src/rate-limit/repository.ts:86-89 prune DELETE on every allowed request filters on created_at alone; the only index is (user_id, created_at). usage/repository.ts:112-115 also deletes on every insert.
- packages/agent/src/processors/scope-gate.ts:50 and verifier/verify.ts:93 construct createOpenAI() on every call.
- packages/agent/src/logger.ts:9 comment says JSON to stdout; @mastra/loggers PinoLogger writes through an in-process pino-pretty stream (node_modules/@mastra/loggers/dist/index.js:18).
- ops-deploy-ci: packages/agent/src/readiness.ts:120-139 /readyz, /healthz and /dependencyz are unauthenticated and each triggers outbound packets (Neo4j query; one paid 1-token completion plus a Voyage embed at most once a minute). Any external poller keeps the Railway service from sleeping.
- docs-drift: packages/agent/src/deep-research/config.ts:4-6 says the limits keep a run inside the server's 10-minute request timeout; runs execute in the background with no HTTP timeout.
- agent-deep-research: packages/agent/src/deep-research/workflow.ts:207 and :245 pass no abortSignal or timeout to generate; cancellation takes effect only at the next reserveStep.
- packages/web/src/lib/use-deep-research.ts:141 fixed 1.5 s poll with no backoff or hidden-tab pause; each poll runs RUN_SELECT with two correlated COUNT subqueries (deep-research/repository.ts:29-32).
- packages/agent/src/chat-memory.ts:27 sets only the observer model; it inherits temperature 0.3, maxOutputTokens 100000 and Google-specific providerOptions from @mastra/memory defaults, with no OpenAI reasoning effort.
- packages/agent/src/index.ts:91 retention runs at every process start, so with Railway sleep it runs on every wake.
- packages/agent/src/health.ts:106 the Anthropic probe sends process.env.AGENT_MODEL as the model with max_tokens 1.
- packages/web/src/lib/use-chat-thread.ts:74 messageCache holds full message arrays (including tool outputs) per thread and only deletes an entry when that thread is re-selected.

## neo4j-live

- packages/policy-corpus/src/retrieval/backends/fulltext.ts:12 - the path collector.ts:45-46 and :160 call exact-phrase recovery is an OR-of-tokens BM25 query: quotes are escaped (internal/base.ts:1), a true phrase query for "personal care services" has 453 hits against 28,190 as issued, one full question matched 52,541 of 71,695 sections (stop words alone match 54,960), and the same 50k-row join to Document is repeated per type group (about 380k db hits each, 5 to 8 times per search).
- packages/pipeline/src/pipeline/graph/schema.py:24 - the full-text index uses the default standard-no-stop-words analyzer: no stemming (eligible 5,956 hits, eligibility 7,918; reimburse 573, reimbursement 3,045) and policy numbers are split (escaped 3K-2 matches 11,555 sections, the phrase 45).
- packages/pipeline/src/pipeline/graph/schema.py:17-22 - five Document range indexes have readCount 0 since 2026-04-10 (doc_answer_ready, doc_authority_tier, doc_corpus_bucket, doc_retrieval_ready, doc_variant_group) and doc_status has 2 reads; no Cypher filters on those properties (status appears only inside coalesce()), so drop them or start filtering.
- packages/pipeline/src/pipeline/embeddings/generator.py:76 - vectors are stored with SET n.embedding=row.embedding as LIST<FLOAT> (604 MB arrays store for 67.6k vectors); the vendor documents db.create.setNodeVectorProperty as the more space-efficient write, and the native VECTOR type needs block format (Enterprise).
- packages/pipeline/src/pipeline/embeddings/indexer.py:13-18 - index options rely on defaults (live: m 16, ef_construction 100, quantization enabled); vector.quantization.enabled is deprecated in 2026.06 and the default quantization type becomes binary in 2026.08, so pin vector.quantization.type before bumping the image.
- packages/policy-corpus/src/primitives/sections.ts:188-189 - CALL { WITH s, parent, d ... } is the deprecated importing-WITH form (server notification 01N00); plan_graph.py already uses CALL (s) { ... }.
- docs-drift: packages/pipeline/src/pipeline/graph/schema_version.py:4-7 says the agent or policy-corpus reads SchemaVersion via getSchemaVersion; no such reader exists in policy-corpus, agent or web, and the node is absent from the local graph although the writer dates from 2026-04-17.
- agent-server: packages/agent/src/readiness.ts:56-68 requires a CorpusRelease node even outside production, so readiness reports a Neo4j error against the documented local graph, which has none.
- agent-processors-tools: packages/agent/src/tools/search.ts:19 and packages/agent/src/prompt.ts:86 advertise document type change_notice (always 0 hits); packages/agent/src/tools/concepts.ts:17 advertises relationship types GOVERNS and REFERENCES_CONCEPT, which no writer creates.
- web-app-lib: packages/web/src/components/EmptyState.tsx:76 shows documentCount from corpus-status.ts:27; locally that is 7,589 including 4,267 synthetic rows and 2 stubs (3,320 source documents).
- corpus-retrieval: with the stored embedding of an MA-2270 section as query vector, the top 10 for "What changed in the latest change notice for MA-2270?" were ten MA-2230 revision headers from 2008-2011 and no MA-2270 section (document-expansion.ts:112 orders header hits by effective_date then score); stand-in vector, re-check with a real query embedding.
- corpus-retrieval: packages/policy-corpus/src/retrieval/backends/amendment-context.ts:40-41 applies docLimit to (amendment, base) pairs; for the MA-2270 question all five type groups returned 0 rows because the top pairs' bases were single-section forms.
- corpus-retrieval: with the query vector equal to Policy 3L section 3.3's own embedding, that section ranked 8th (1.379) behind DHHS form fragments of 57 to 525 characters scoring 1.47 to 1.96; additive boosts outweigh cosine similarity.
- rag-design: the Neo4j manual advises ranking each source independently rather than comparing raw vector scores with other scores; collector.ts:25-32 merges cosine scores with fixed keyword and concept scores by maximum.
- pipeline-refs-federal-jev: packages/pipeline/src/pipeline/references/extractor.py:20-59 has no MA- or DHB-series pattern, so 80 of 13,221 non-empty DHHS manual sections have any outbound reference; extractor.py:38 lets 21xx match manual section numbers (unresolved Section 2180 and 2191).
- pipeline-refs-federal-jev: 17 SSA parent sections duplicate their children's text (2.48 M characters; section 1905 is 229,261 characters and its 37 children sum to 229,155), and leaves such as ssa-title-19:1902-yy (543,119 characters) or 1917-i titled "by striking ..." look like statutory notes attached to subsection headings; not verified against the statute.
- packages/pipeline/src/pipeline/concepts/linker.py:53 - any heading containing limitation yields RESTRICTS: 134 of 525 EPSDT RESTRICTS edges are the boilerplate "EPSDT Special Provision: Exception to Policy Limitations", the opposite meaning (edges last written 2026-04-22).
- packages/pipeline/src/pipeline/concepts/linker.py:77-81 and packages/pipeline/src/pipeline/references/resolver.py:453-458 read every section body in one unpaged result and list() it; on this graph that is 2.78 GB with a 38.5 MB maximum, the pattern plan_graph.py:50-60 pages by ten to avoid. Not executed.
- packages/pipeline/src/pipeline/graph/corpus_writer.py:155-260 - merge_reference_edges, merge_concept_links and merge_amendments are MERGE-only and skip _prepare_source_mutation; edges of a section whose text changed are never retracted (locally: concept links from 2026-04-22 on sections reloaded 2026-07-11, and PolicyConcept still has the alias HHS that seed.py:23-25 removed).
- packages/pipeline/src/pipeline/graph/loader.py:58-59 with packages/policy-corpus/src/internal/rerank.ts:284-286 - the current loader excludes every not-answer-ready parse, so answer_ready=false can only occur on section-less stubs; ANSWER_READY_PENALTY and the doc_answer_ready index are dead on a current graph (the July graph still has 247 such documents, including all 16 billing_guidance and 212 of 217 managed_care_guidance).
- packages/pipeline/src/pipeline/federal/loader.py:19-25 - NEXT_SIBLING in federal documents chains every section in document order regardless of parent (34 edges cross parents in the SSA), unlike _assign_hierarchy.
- packages/pipeline/src/pipeline/references/resolver.py:46-47 - 32 (document_id, section_number) groups are ambiguous (96 sections, 17 groups with more than one non-empty body); 100 REFERENCES edges land on them via ORDER BY s.id LIMIT 1.
- crawler: document titles taken from anchor text: "here" x8, "Spanish" x6, "English", "flyer", "clean page" x4, "cover letter" x4, "Presentation" x5; these render as citation links such as [here](url) and feed the embedding heading context.
- pipeline-release-sources: fee-schedule variant grouping is fragile: "hysician Service Fee Schedule - May 19, 2020" forms its own primary group, 52 documents with filename-style titles have no variant_date, and 64 of 143 primary schedules are dated 2022 (newest 2025-02-01).
- pipeline-release-sources: packages/pipeline/data/unresolved-references.json (2026-07-11, 4,552 entries) names clinical policies cited but absent from the graph: 10B x49, 1A-30 x18, 1K-7 x15, 1A-41 x13, 1S-4 x13, 9C x11.
- crawler: 17 DHHS change-notice titles exist twice (for example ma_cn01-15.pdf and ma_cn01-15-1.pdf, or ABD and Family and Children's copies), duplicating AMENDS edges; 11 DHHS notices and 7 revised SPAs have status amendment but no AMENDS edge.
