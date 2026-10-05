# Working artifact from the round-two triage-agent review

I read all 157 minor notes in the eight scopes and opened code or recorded data for 28 groups of them. Five held up at medium or above and are returned. Four were already covered: the URL and quote validator notes by test-quality-07, the scoped-frame bypass by agent-processors-tools-02, the token-limiter note by agent-processors-tools-06, and the lease notes rest on the SQLITE_BUSY ground rejected in agent-server-05. Five did not hold: tripwire blocks do render in the web UI, the /dependencyz cache cannot be bypassed, the observer's 100,000-token output cap does not apply to a non-default model, the retrieval-mode global is report-only, and stale Neo4j sockets are bounded by the idle close. The rest were low on reading or on inspection.

The serious one was a note its author rated minor: the verifier's evidence budget. Replaying the real function on the committed gate run shows 75,223 characters of section listings kept and two cited regulation bodies dropped, for an answer recorded as passed. The other four: reflection researches questions the user struck from the plan; a proven client write path into the model's system messages (extends agent-verifier-01); unverified plan prose shown before any check; and a start quota that counts declined and failed runs.

Found to be fine: thread PATCH enforces ownership (403), answer text stayed gated in every probe, and the September gate answers show no glued step narration.

## Notes opened in code or data (28 groups of the 157 notes read)

| Scope | Note (short) | Decision | Reason |
| --- | --- | --- | --- |
| agent-verifier | evidence.ts:476-480 truncation; :458 cited by URL | Promoted, high | Real-module replay on the committed gate run: listings kept, cited bodies dropped, recorded outcome passed |
| agent-deep-research | workflow.ts:362-379 reflection re-adds | Promoted, medium | Probe: 2 of 6 approved, 6 researched |
| agent-verifier / security-appsec | execution-gateway.ts:32 PATCH writes mastra.om | Promoted, medium | End-to-end PoC; extends agent-verifier-01 fix item 3 |
| agent-deep-research | repository.ts:78 plan brief unverified | Promoted, medium | Probe: brief public with 0 verifier calls |
| agent-deep-research | repository.ts:122-124 quota counts all runs | Promoted, medium | Confirmed; pinned by repository.test.ts:45 |
| agent-deep-research | workflow.ts:214 res.text joins every step's text | Held, low | True in @mastra/core 1.58.0 (trip-wire-BhUIouVi.js:3636) and at index.ts:375; 0 of 150 September gate answers start with narration |
| agent-verifier | Frame section and getSection counted twice | Held, low | Measured 8.2% (same body) to 14.0% (same key) of evidence characters in the final gate run |
| agent-verifier | answer-release.ts:41 textless messages lose OM markers | Held, low | OM falls back to record ids and timestamps (memory dist 20708-20733); no failure shown |
| agent-deep-research | agents.ts:30 webSearch always in the toolset | Held, low | True; inert without EXA_API_KEY (no such name in local env files); overlaps security-appsec-09 |
| agent-processors-tools | scope-gate.ts:35 first 300 characters | Held, low | True; classifier is biased to allow and fails open |
| agent-processors-tools | search.ts:22 free-form documentTypes, unbounded topK | Held, low | True in the schema; no recorded tool arguments to show it occurs |
| agent-processors-tools / ai-sdk-providers | index.ts:210 server-local date | Held, low | True; off by one for a few evening hours |
| agent-verifier / agent-processors-tools | Evidence includes earlier turns' tool results | Held, low | True (processor.ts:76-79); current-turn sources are ordered first |
| agent-server / agent-verifier | Malformed chat body returns 500 | Held, low | True (chat-route.ts:23 outside the try) |
| agent-processors-tools | Empty user text falls back to an earlier question | Held, low | Plausible from message-utils.ts:24-32; needs a direct API call |
| agent-deep-research | No abort signal, no wall-clock deadline | Held, low | Bounded by reserved steps and per-call transport timeouts |
| agent-server | /readyz unauthenticated with a query and a write | Held, low | True; single probe write, no growth |
| agent-verifier | run.ts:116 in-band 'unavailable' sentinel | Held, low | Fails closed |
| agent-verifier | answer-validation.ts:199 vs :173 URL punctuation | Discarded, covered | test-quality-07 |
| agent-verifier | answer-validation.ts:250 quote regex | Discarded, covered | test-quality-07 |
| agent-processors-tools | frame/service.ts:28-31 scoped query bypass | Discarded, covered | agent-processors-tools-02, corpus-frames-07 |
| perf-cost-reliability | TokenLimiter best-fit drops the current message | Discarded, covered | agent-processors-tools-06 |
| agent-deep-research | renewLease failure and SQLITE_BUSY | Discarded, covered | Rests on the ground rejected in agent-server-05 |
| mastra-installed | Tripwire block shows an empty answer | Does not hold | MessageList.tsx:204-207 renders the tripwire userMessage |
| security-appsec | /dependencyz cache bypass | Does not hold | health.ts:149-160 has no request-controlled path; one probe per 60 seconds |
| perf-cost-reliability | Observer inherits maxOutputTokens 100000 | Does not hold | @mastra/memory 1.26.1 (src-DGdlH4fo.js:24129) applies it only to the default model; Google options are namespaced |
| perf-cost-reliability | policy-corpus.ts:22 retrieval-mode global | Does not hold as a request defect | Only /corpus-status reads it; searches use AsyncLocalStorage |
| perf-cost-reliability | neo4j.ts:41-45 stale sockets | Does not hold as stated | Five-minute idle close bounds pooled sockets |

## Evidence-budget replay, final gate run (finding 1)

| Measure | Value |
| --- | --- |
| Answers over the 120,000-character budget | 1 of 50 (q-010) |
| q-010 evidence recorded / sent after budgeting | 129,516 / 115,842 characters |
| q-010 listing entries kept | 39,516 + 35,707 characters |
| q-010 section bodies dropped | 441.302 (6,524), 441.303 (6,541), 3K-2 § 7.15.2 (460) |
| Share of all evidence that is listings | 26.3% (533,079 of 2,028,943) |
| Largest evidence with listings removed | 61,740 characters; 0 of 50 over budget |
| All recorded answer rows (current code replayed) | 34 of 1,449 truncate; 24 drop a section body; 57 of 132 dropped entries would fit with `continue` |

## Reproduction files

All in `<review scratch directory, not kept>/gaps/triage-agent`:

- `replay_real.mts`, `replay_q010_terms.mts`, `replay_q010_more.mts`: run with `node_modules/.bin/tsx` from that directory.
- `sim_truncation.py`, `dup_evidence.py`, `narration.py`: Python, read-only.
- `pocJ/poc-thread-metadata.mts` with saved outputs; set `POC_MESSAGE_TOKENS=1` for the forced-observation variant.
- `probeI/plan.probe.test.ts` with `probeI/vitest.config.ts` and saved output `probeI/probe-output.txt`.
- `ledger.md`: note-by-note decisions.
