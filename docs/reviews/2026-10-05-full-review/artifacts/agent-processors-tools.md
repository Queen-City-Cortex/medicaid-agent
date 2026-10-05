# Working artifact from the agent-processors-tools reviewer

## A. Input-processor chain as it runs (web path)

Mastra prepends memory processors, then runs the configured list. Verified with a probe on @mastra/core 1.58.0 and @mastra/memory 1.26.1.

| # | Processor | Hook | Messages it sees (OM on, default) | Mutates | Failure behaviour | Cost |
|---|---|---|---|---|---|---|
| 1 | MessageLengthGuard | processInput | newest user message only | nothing | pure; aborts `message-too-long` | none |
| 2 | CoverageBoundaryProcessor | processInput | newest user message only | requestContext `coverage-verification-query` | aborts `coverage-limitation`; no log | none |
| 3 | ScopeGateProcessor | processInput | newest user message, first 300 chars | nothing | fail-open on throw (log + Sentry); no deadline | 1 gpt-5-mini call |
| 4 | PromptInjectionDetector (Mastra) | processInput | newest user message | nothing | fail-open (console.warn only) | 1 gpt-5-mini call per message with text |
| M | ObservationalMemory (auto-added) | processInputStep | loads history and observations | message list, tagged system messages | n/a | observer model when unobserved tokens exceed 30k (default) |
| 5 | OpenAIResponsesDedupProcessor | processInputStep, every step | all messages | removes duplicate parts (persisted) | silent | none |
| 6 | AnswerFramePrefetchProcessor | processInputStep, step 0 | all messages | activeTools, toolChoice, adds system message with user text | skips if no user text | forces 1 model request + frame retrieval |
| 7 | AnswerFramePlanningProcessor | processInputStep, steps >= 1 | all messages (newest frame result anywhere) | adds plan system message, rebuilt each step | silently no plan | none |
| 8 | TokenLimiterProcessor(128k) | processInputStep, every step | all messages | removes whole messages over budget (persisted) | TripWire if nothing fits | none |

With OBSERVATIONAL_MEMORY_ENABLED=false, Mastra adds MessageHistory (processInput) instead of M, and processors 1-4 then receive the last 10 stored messages plus the new one. The CLI path runs only 5-8 with no memory.

## B. Tool inventory

| Tool (model-facing key) | Input | Output | Size bound | Notes |
|---|---|---|---|---|
| resolveAnswerFrame | query, questionType? | route, up to 3 documents, up to 4 primary + 4 supporting sections (content up to 6,000 chars), up to 3 avoid sections (content null), latestRevision, coverageScope | bounded, except coverage-scope frames (all sections of the required documents) | forced at step 0; no retrievalMode |
| searchSections | query, documentTypes? (free strings), topK? (unbounded) | sectionId, title, policyNumber, documentType, 300-char head snippet, score; retrievalMode | topK not clamped | no sectionNumber or citation |
| getSection | sectionId | section metadata + content up to 6,000 chars | bounded | no continuation; container headings combine children up to 6,000 chars |
| getDocument | documentId | metadata + every section (id, number, title, chars) | unbounded | |
| getSectionContext | sectionId | ancestors, siblings, children (id, title, number) | siblings unbounded | no content |
| followReferences | sectionId | references | unbounded | |
| getAmendments | documentId | up to 50 amendments, base, authoritative document | bounded | |
| findConceptSections | conceptName, relationshipType? (free string) | sections | unbounded | invalid relationship returns [] |
| lookupPolicy | policyNumber | up to 25 documents, each with every section, plus supersession | sections unbounded | prefix match |
| webSearch (deep-research worker, only with EXA_API_KEY) | query | up to 5 results, 800 chars each | bounded | errors return [] |

Thrown tool errors surface to the model as `error-text` tool results and to the client as tool error text.

## C. Coverage boundary: who gets blocked (probe1, today = 2026-10-04)

| Question | Outcome |
|---|---|
| Does NC Medicaid cover at-home COVID tests? | blocked (intended by the scope review) |
| My mom got COVID and now needs care at home. Will Medicaid pay for a home health aide? | blocked, OTC-test notice |
| Does Medicaid cover at-home nursing for a COVID long-hauler? | blocked, OTC-test notice |
| Are OTC medications like cough medicine covered by Medicaid if I have COVID? | blocked, OTC-test notice |
| Do I need prior authorization for Paxlovid after a positive at-home COVID test? | blocked, standing-order notice |
| What is the income limit for Medicaid expansion after the 5% disregard? | blocked, MAGI-period notice |
| Is the MAGI income limit based on income before or after taxes? | blocked |
| I lost my previous job. Do I meet the Medicaid expansion income limit now? | blocked |
| Medicaid expansion started in December 2023. What is the income limit for a single adult? | blocked |
| Is Medicaid expansion coverage limited for immigrants who arrived in 2019? | blocked |
| How did the MAGI income limit change between 2025 and 2026? | blocked |
| What is the income limit for Medicaid expansion for a family of 3? | scoped to the April 2026 table; blocked when today >= 2027-01-01 |
| What counts as income under MAGI? / Are there visit limits for physical therapy under Medicaid expansion? / Does Medicaid expansion cover dentures, and is there a dollar amount cap? | not blocked, but scoped to the MAGI table |

Other refusal paths outside this scope's files: SSN, phone, email, date-of-birth or member-id patterns (422 at the route), messages over 10,000 chars, off_topic verdicts, injection scores >= 0.8 (generic 'couldn't be processed' text).

## D. Probe ledger (scratch directory, no network, no Neo4j, empty environment)

| Script | Scenario | Observed |
|---|---|---|
| probe1-pure.mts | resolveCoverageScope, coverageConversationQuery, analyzeQuery | table C; with history the follow-up 'June 2025?' resolves to the 2025 table, latest-only resolves to no scope; follow-ups route to general / baseline_hybrid / widening none |
| probe2-chain.mts S1, S6 | two turns, OM on, agent.stream and handleChatStream v6 | processInput sees only the newest message; COVERAGE_VERIFICATION_QUERY = latest text; no tripwire for 'And for February 2025?' or the Gujarati follow-up |
| probe2-chain.mts S1 | same, OM off | history visible; query becomes 'What MAGI income table applies in  ?\nFollow-up: June 2025?' |
| probe2-chain.mts S1 | step inspection | prefetch system message only at step 0; plan rebuilt at each later step; forced tool choice only at step 0 |
| probe2-chain.mts S3 | frame tool throws on turn 2 | part state output-error; plan says 'Cover first: § 1.1 FRAME-FOR<Does Medicaid cover dentures?>' for 'What about hearing aids?' |
| probe2-chain.mts S4 | limiter at 3,000 tokens, five ~1,000-token reads | model call 5 sees no tool results; plan gone afterwards; stored thread keeps the last two results |
| probe2-chain.mts S5 | blocked question | nothing persisted for the blocked turn |
| probe2-chain.mts S7 | observation forced (messageTokens 1) | at step 2 the question and frame are gone from the message list; no plan |
| probe3-planner.mts | planner as pure function | EPSDT directive dropped with real route + avoid section; speech-language directive on a psychotherapy question; empty section reference |
| probe4-prompt.mts | prompt measurement | 10,494 chars; citation block copies differ by two lines each |

## E. Direct answers to brief questions

- openai-responses-dedup: patches Mastra history duplication that made OpenAI Responses reject requests with 'Duplicate item found'. Whether it is still needed on 1.58.0 is unknown because it is silent; instrument, then remove if idle.
- tools/web-search.ts and exa-js: wired, feature-flagged on EXA_API_KEY, attached only to the deep-research worker; no checked-in env file or env table sets or documents the key.
- Jev wrappers: scope provider behind SCOPE_GATE_PROVIDER=jev (blocks only off_topic at probability >= 0.95, 500 ms, no retry, fail-open at info level); eval-worker is an offline stdin/stdout tool that reports every error as classifier_failed_open; the validation budget is a local-only fetch shim installed from load-env when JEV_VALIDATION_LEDGER is set and refuses production.
- Non-text parts: dropped before the agent by trustedChatInput, so processors only handle text.
