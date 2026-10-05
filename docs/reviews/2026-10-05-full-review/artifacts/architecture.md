# Working artifact from the architecture reviewer

## A. Gate ledger (fail-open versus fail-closed)

| # | Gate | Where | Kind | On failure | Verdict |
|---|------|-------|------|------------|---------|
| 1 | Token binding | agent/src/auth-middleware.ts:35-42 | deterministic | verify error -> no user -> 401 at gateway | closed |
| 2 | Execution gateway | execution-gateway.ts:55-73 | deterministic | unknown route 404, no user 401 | closed |
| 3 | Body-size guard | rate-limit/middleware.ts:43-66 | deterministic | missing, invalid or oversize Content-Length -> 413/400 | closed |
| 4 | Rate limiter | rate-limit/middleware.ts:114-123; repository.ts:105-107 | DB | DB error: 503 in production, pass elsewhere; "unreachable" branch allows; limit <= 0 disables a window | closed in production, two open edges |
| 5 | Route authorisation | index.ts:256-258 | deterministic | any authenticated WorkOS user allowed | authentication closed, authorisation open |
| 6 | Client-identifier screen | chat-route.ts:33; deep-research/routes.ts:40 | regex | match -> 422 | closed, but absent on edited sub-questions (routes.ts:87) |
| 7 | Thread ownership, memory store | chat-route.ts:53-60 | deterministic | 404 / 503 | closed |
| 8 | Message length | processors/message-length-guard.ts:21-30 | deterministic | tripwire | closed |
| 9 | Coverage boundary | processors/coverage-boundary.ts:28-31 | regex + dates | tripwire with notice | closed, and over-closed (2027-01-01 cliff, undated COVID question) |
| 10 | Scope gate | processors/scope-gate.ts:86-90 | model | error -> pass; logged + Sentry | open, explicit and documented |
| 11 | Prompt-injection detector | index.ts:160-165; @mastra/core 1.58.0 | model | detector error -> "allowing content", console.warn only | open, silent |
| 12 | Token limiter (128k) | index.ts:169-171 | deterministic | silently drops older context | open (verifier keeps its own sources) |
| 13 | Query embedding | policy-corpus.ts:120-125 | provider | error -> lexical only; global flag + masthead banner | open; not propagated to verifier, record or evaluation |
| 14 | Embedding model compatibility | config.ts:4-7; readiness.ts:24-28 | none | no check exists | no gate |
| 15 | Neo4j query | neo4j.ts:54-67 | infrastructure | 30 s timeout -> tool error -> no evidence -> withheld | closed at release |
| 16 | Step limit | index.ts:185-193 | deterministic | forced synthesis at step 97, still verified | closed at release |
| 17 | Verifier | verifier/verify.ts:121-135; run.ts:116-134 | model + deterministic URL/quote checks | error, timeout, no sources or unusable correction -> withheld | closed |
| 18 | SSE gate | answer-release.ts:118-126 | deterministic | all model prose dropped; finish without release -> withheld | closed |
| 19 | Memory write/read guard | answer-release.ts:28-44, 69-77 | HMAC | unsigned assistant text -> unverified-history notice | closed |
| 20 | CLI verification | cli-verification.ts:21-28 | - | exception -> withheld | closed (VERIFIER_ENABLED=false prints the draft outside production) |
| 21 | Research start | deep-research/routes.ts:40-50; repository.ts:113-125 | deterministic | 422 / 409 / 429 | closed |
| 22 | Research decision | deep-research/routes.ts:83-99; agents.ts:72-89 | schema only | edited sub-questions unscreened; worker has no input processors | no gate |
| 23 | Research verification | deep-research/workflow.ts:218-221, 477; repository.ts:297 | model | withheld -> run fails; retried only when verifier unavailable | closed |
| 24 | Web search | tools/web-search.ts:53-57 | provider | error -> empty results | open (supplementary evidence only) |
| 25 | Usage accounting | usage/repository.ts:117-119 | DB | error -> warn, row lost | open |
| 26 | Retention | index.ts:87-91; storage/app-database.ts:218, 233 | DB | error -> log + Sentry; missing mastra_* table silently skipped | open |
| 27 | /readyz | readiness.ts:56-80 | deterministic | Neo4j down, release-id mismatch or read-only storage -> 503, deploy held | closed in production; release check skipped when NODE_ENV is not production |
| 28 | Startup config | runtime-config.ts:117-145 | deterministic | throws for 29 names; 33 others parsed leniently | partly closed |
| 29 | Release build | pipeline/release.py:219-253 | deterministic | any load, CFR, SSA or embedding error aborts | closed (fails stale) |
| 30 | Release evidence | pipeline/evaluation_evidence.py:90-97 | deterministic | one agent or judge infrastructure error invalidates the run | closed (fails stale) |
| 31 | CFR supersessions | pipeline/references/supersessions.py:34-39 | deterministic | missing file -> empty map | open (image smoke check) |

Verdict: the set is coherent where it matters most. Nothing unverified can leave through chat, history, clone, CLI or research (rows 17-20, 23). It is not coherent upstream: the things that decide what evidence the verifier sees (rows 11-14) fail open without telling the release decision, the release record or the evaluation; one user-text entry point has no input gates (row 22); and the corpus-side gates (29-30) fail closed in a way whose practical outcome is a stale corpus, with no gate on staleness itself.

## B. Process machinery: load-bearing or speculative

Line counts are tracked non-test source from a script; total is about 14k of 55k.

| Machinery | Lines | Verdict for a pre-customer solo product |
|-----------|-------|------------------------------------------|
| Signed answer release + memory gate | ~160 | Load-bearing. This is the product's core safety property and it is cheap. Keep. |
| Research checkpoints, leases, claims | ~940 | Half. Checkpoint reuse and lease expiry protect paid, user-approved work across the frequent redeploys. Per-instance owners, heartbeats and lease-lost cancellation defend against contention the platform forbids. |
| Blue/green releases, qualification, identity catalog | ~4,800 | Idea load-bearing (never mutate the live graph, atomic cutover, rollback). Implementation speculative at this stage and so far unproductive: full rebuild, full re-embed and full paid evaluation per attempt, zero error tolerance, and no promoted release on record. |
| Source retirement, availability, audit, recovery | ~3,500 | Principle load-bearing ("a 404 is not withdrawal"). Mechanism over-built: evidence manifests, replay journals, relocation proofs, a seven-module deferred-import knot, and it is the proximate cause of the release freeze. |
| Bounded answer scope | ~840 | A band-aid for the release gate, hand-coded per missing document, with a calendar expiry. Replace with unresolved-source data. |
| Jev experiments, budget ledgers, review dashboards | ~3,000 | Speculative and disabled at runtime, yet read in 9 places across two packages and imported by the server's env loader. Park outside the boot path until adopted. |
| Fee XLSX compaction and cost audit | ~700 | One-off repair made permanent; fine to keep as offline tooling, not part of the release path. |

## C. Restart, two replicas, ten organisations

| Situation | What happens today | What must change |
|-----------|--------------------|------------------|
| Deploy, crash or sleep-wake | In-flight chat stream is cut, thread keeps the question and tool steps with no answer and no marker. Research waits up to 15 minutes for lease expiry, then resumes from checkpoints and spends one of two recovery claims. Rate limits, quotas, signing key and history survive (all in SQLite). Caches (provider health, corpus status, retrieval mode) reset. | SIGTERM handler, immediate reclaim of foreign leases at boot, shorter lease. |
| Two replicas | Not possible: Railway forbids replicas and overlapping deployments on a service with a volume. If forced onto separate files it would be split-brain (two signing keys, two rate-limit ledgers, two histories). | Hosted libSQL or Postgres. After that the request path is nearly replica-safe already; remaining items are migration startup races (app-database.ts:144-164 is check-then-run) and cross-replica workflow cancellation. |
| First ten organisations | No organisation concept; one global memory switch, retention policy, rate limit and research quota; any WorkOS user is authorised; usage cannot be grouped by customer; no user-data deletion entry point. | Organisation id from the token, organisations table with settings, org_id on usage, research and feedback, membership check in authorizeUser, a deletion route or CLI. |

## D. Language seam inventory

| Direction | Call site | Protocol |
|-----------|-----------|----------|
| Python -> TS | pipeline/retrieval/agent_bridge.py:10-14 | stdin JSON, stdout JSON |
| Python -> TS | pipeline/eval/levels/answer.py:189-197 | argv question, four stdout markers, per-question process |
| Python -> TS | pipeline/cli/recovery.py:171 | crawler CLI with file arguments |
| Python -> TS | pipeline/jev/benchmarks.py:19 | stdin/stdout JSON to agent/src/jev/eval-worker.ts |
| Python -> Node | pipeline/bootstrap_activation.py:156 | release-smoke.mjs |
| TS -> Python | agent/src/jev/validation-budget.ts:7 (imported by load-env.ts:1) | spawnSync into the pipeline virtualenv |
| Shared data | corpus-manifest.json | read by both (good) |
| Shared data | crawler.db | DDL in crawler/src/db/schema.ts and in retirement.py, source_lifecycle.py, answer_scope.py; Python also writes documents |
| Shared data | policy-corpus/src/scope/policy.json | read by Python from the TS package source tree |

## E. Benchmark-to-heuristic map (supports finding 1)

| Heuristic | Golden question it matches |
|-----------|----------------------------|
| isHcwdIncomePremiumQuery, asksForEarnedIncomeLimit, HCWD_INCOME_RULE_TERMS, scoreHcwdIncomePremium, collectHcwdIncomeHistoryHits, alias MA-2180 | q-009 |
| isCongregatePcsQuery, CONGREGATE_PCS_* lists with '3.2.1', '3.3', '4.2.1.2', planner congregate branch | q-005 |
| isAmbulanceNotCoveredQuery, alias '15', planner air-ambulance rules | q-017 |
| isModificationReviewQuery (home modification + multidisciplinary team) and its two boosts | q-011 |
| isPharmacyQuantityPriorAuthQuery, 'episodic', 'attachment k' | q-018 |
| isMlrQuery, MLR methodology and NC implementation phrase lists | q-021, q-048 |
| isWaiverApplicationQuery, scoreWaiverApplication with '42-CFR-441' and a '431.408' penalty | q-010, q-045 |
| isWaiverAuthorityQuery (1915(c)) | q-046 |
| telehealth + speech-therapy alias '10A', telehealth condition phrases quoted from the policy text | q-019 |
| isClinicalCriteriaLifecycleQuery (entrance, continued service, discharge) | q-003 |
| asksForCertificationDetails ('terminally ill') | q-016 |
| federalCoreConditions ('written plan of care', '60 days', 'place of residence') | q-015 |
| isEpsdtOverviewQuery | the release smoke question |

Generic template knowledge (section 1.0 description, 2.x eligibility, 3.x covered, 4.x not covered, attachments, boilerplate titles) is not part of this criticism; it applies to every clinical coverage policy and should become section properties.

## F. Ranked plan

Delete
1. The agent planner's duplicate classifiers and phrase lists now; topic-specific predicates, scorers and aliases that fail the ablation in finding 1.
2. Jev from the boot path (load-env import, nine flag reads, readiness and recovery identity hooks) until the experiment is adopted.
3. Per-document scope regexes, once unresolved sources are data.
4. RuntimeConfig fields nobody reads, the three ensureTable copies, the three-way repository constructors, the duplicated DDL in Python, the unused web devDependency.
5. Either the heartbeat and lease-lost code (if staying single-writer) or the file database (if not). Pick one.

Consolidate
1. One composition root used by server, CLI, evaluation and tests.
2. One configuration parser for all 62 names with strict types.
3. One question analysis: the frame returns flags or directives, the agent renders them.
4. Tool output schemas defined once with types inferred.
5. One owner per SQLite schema and one JSON envelope for the evaluation protocol.
6. One evidence fingerprint in place of the hand-kept file list plus the hash of every source file.

Invest, in order
1. Per-answer audit record (small): the only way to learn from a wrong or withheld answer.
2. Topic-disjoint evaluation set and the ablation (medium): tells you whether 9.7k lines of heuristics generalise before you add more.
3. Release pipeline that ships (medium to large): source waivers, embedding cache, federal cache fallback, per-question retry, staleness alarm. Until this lands, safety work protects answers from a July corpus.
4. Scope expiry fix and monitor (small, before 2027-01-01).
5. Graceful shutdown and immediate lease reclaim (small).
6. Degraded-retrieval propagation and embedding identity in readiness (small to medium).
7. Hosted database and organisation dimension, together, before the first organisational customers (medium to large).
8. Boot-and-chat smoke of the built image in CI with a stub model (medium, after the composition root exists).
