# Working artifact from the ai-sdk-providers reviewer

## A. Call-site inventory (what the code actually sends)

| # | Role | Call site | Model id (default) | Provider path | API surface | Structured output | Options set | Timeout / abort | Retries | On failure | Usage recorded |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Chat agent, web | index.ts:204 via chat-route.ts:105 (agent.stream) | AGENT_MODEL (gpt-5.6-terra; prod override gpt-5.4 per Oct 3 audit) | createModel -> app @ai-sdk/openai 3.0.74 | Responses, streaming | n/a | none (body keys: model, input, tools, tool_choice) | none / client disconnect | Mastra p-retry 2, honours Retry-After | generic error text; gate emits withheld | yes, agent tokens only |
| 2 | Chat agent, CLI/eval | index.ts:352 (agent.generate) | same | same | Responses, non-streaming | n/a | none | none / none | 2 | process exit code | no |
| 3 | Deep research planner, worker, reflection, reporter | workflow.ts:207, 245, 369, 447 | DEEP_RESEARCH_MODEL (= AGENT_MODEL) | same | Responses, non-streaming | planner/reflection: Mastra direct mode, strict json_schema | none | none / none | 2 plus checkpoint recovery | run failed or recovered | yes, per phase |
| 4 | Hallucination verifier | verify.ts:94 (generateObject) | VERIFIER_MODEL (gpt-5.6-terra) | createOpenAI, always OpenAI | Responses, non-streaming | strict json_schema | reasoningEffort low | 30 s / request signal | 0 | fail closed: withheld 'unavailable' | deep research only; not on chat |
| 5 | Scope gate | scope-gate.ts:51 (generateObject) | SCOPE_GATE_MODEL (gpt-5-mini, removal 2026-12-11) | createOpenAI, always OpenAI | Responses, non-streaming | strict json_schema | none | none / none | AI SDK default 2 | fail open, log + Sentry | no |
| 6 | Scope gate, Jev (opt-in) | jev/scope.ts:17 -> policy-corpus/src/jev/client.ts:42 | jev-1.13.0 | raw fetch api.typesafe.ai | TypeSafe systemone | typed answers validated | n/a | 500 ms | 0 | fail open | no |
| 7 | Prompt-injection detector | index.ts:160, deep-research/agents.ts:58 | 'openai/gpt-5-mini' (hardcoded) | Mastra router -> bundled @ai-sdk/openai 3.0.88 | Responses, non-streaming | Mastra direct mode, strict json_schema | temperature 0 requested (stripped); no effort | none | Mastra 2 | fail open, console.warn only | no |
| 8 | Observational memory | chat-memory.ts:27 | 'openai/gpt-5.4-mini' (hardcoded) | Mastra router -> bundled 3.0.88 | Responses | not inspected | not inspected | not inspected | not inspected | not inspected | no |
| 9 | Query embedding | policy-corpus.ts:33 | VOYAGE_MODEL (voyage-4) | raw fetch | Voyage /v1/embeddings | n/a | input_type query; no output_dimension | 15 s | 1 (429/5xx/network) | degrade to lexical | no |
| 10 | Health probes | health.ts:29, 56, 98 | voyage-4; gpt-5-mini; AGENT_MODEL if claude-* | raw fetch | Voyage embeddings; OpenAI Chat Completions (max_completion_tokens 1); Anthropic Messages (max_tokens 1) | n/a | n/a | 5 s | 0, cached 60 s | status 'error' | n/a |
| 11 | Web client | web/src/lib/use-chat-thread.ts:82-104 | n/a | useChat + DefaultChatTransport | POST /chat, full history body | n/a | n/a | stop() aborts fetch | n/a | console.error, status error | n/a |
| 12 | Eval judge (Python) | eval/judge.py:73 | claude-sonnet-4-6 | raw httpx | Anthropic Messages | free-text JSON, brace-scan fallback | temperature 0, max_tokens 1024 | 60 s | 0 | HTTP error excluded; parse failure scored 0 | n/a |
| 13 | Reference extraction (Python) | references/llm_extractor.py:129 | claude-haiku-4-5-20251001 | raw httpx | Anthropic Messages | forced tool_choice (non-strict) | cache_control on tool + system, max_tokens 4096 | 120 s | 0 | skip batch; abort after 3 consecutive | n/a |
| 14 | Document embedding (Python) | embeddings/voyage_client.py:73 | EMBEDDING_MODEL (voyage-4) | raw httpx | Voyage /v1/embeddings | n/a | output_dimension, truncation false, input_type document | 120 s | 5 attempts, Retry-After | raise | n/a |
| 15 | Jev offline (Python) | jev/client.py:87, jev/inference.py:12 | jev-1.13.0 | raw httpx | TypeSafe systemone | validated | n/a | 15 s | 3 budgeted attempts | JevError | SQLite ledger |
| 16 | AI diagnostic review (Python) | jev/ai_review.py:76-86 | gpt-5-mini; claude-opus-4-6 | raw httpx | OpenAI Responses; Anthropic Messages | native json_schema both | reasoning effort low, max_output_tokens 8192; max_tokens 8192 | 180 s | one resumed retry | receipt 'pending_*' | SQLite ledger |

## B. Offline experiments (fake fetch; global fetch throws; every run printed 'blocked network attempts: none')

Scripts are in SCRATCHDIR.

| Script | Question | Result |
|---|---|---|
| exp_routing.mts | Where does createModel send non-standard ids, and does startup validation notice? | 'openai/gpt-5.4', ' gpt-5.4', 'GPT-5.4', 'ft:gpt-5.4:org::abc', 'chatgpt-4o-latest', 'o5-mini', 'gemini-3-pro' -> anthropic.messages; loadRuntimeConfig accepts all of them without ANTHROPIC_API_KEY. 'o1dummy' -> openai.responses. |
| exp_dedup.mts | Do duplicate ids reach the Responses request without the dedup processor (3 turns, parallel tool calls, memory, savePerStep)? | A (no processor): 6 requests, dupes=none. B (with processor): identical. C (store false): no item_reference; reasoning sent with id and encrypted content; include=[reasoning.encrypted_content]; round-trips through LibSQL memory. |
| exp_webpath.mts, exp_webpath_attr.mts | Web versus CLI request shape | CLI: steps carry ref:rs_N. Web: no reasoning items between steps; next turn has assistant text with no id. Verifier-only run reproduces the loss; release-gate-only run keeps ref:rs_N within the turn. |
| exp_classifiers.mts | What do input processors receive with production memory (observational memory on)? | 1 message per turn; detector 1 call per turn; detector request has reasoning null, store unset, json_schema. |
| exp_classifiers_omoff.mts | Same with OBSERVATIONAL_MEMORY_ENABLED=false | processInput receives 1, 3, 5, 7 messages; detector makes 1, 3, 5, 7 calls including assistant answers. |
| exp_prefix.mts, exp_prefix2.mts | Tools and options per step with the real prefetch processor | Step 0: tools=[resolveAnswerFrame], tool_choice function; step 1+: 9 tools, auto. Agent body keys: model, input, tools, tool_choice. |
| exp_capabilities.mts | How does @ai-sdk/openai 3.0.74 treat GPT-6 ids? | gpt-6.1-sol, gpt-6-luna, gpt-6-astra: reasoning not sent (warning), system role 'system', no include. gpt-5.x: reasoning sent, role developer. |
| exp_anthropic.mts | What does @ai-sdk/anthropic 3.0.85 send? | claude-sonnet-4-6, claude-opus-4-8: max_tokens 128000, native json_schema, no thinking, no cache_control. claude-sonnet-5-5, claude-opus-5-5: max_tokens 4096; structured output via tool_choice any. |
| exp_history_422.mts | Does re-uploaded assistant text trip the identifier guard? | New question alone: []. Full body: ['member_id']. Tool output at depth 7 is not scanned. |
| sensitive_scan.py | How often do recorded answers contain a trigger? | Last 10 full runs: 4/500 answers (all member_id false positives); 93/500 evidence bundles. 0/155 benchmark questions. |
| judge_parse_errors.py | Judge parse failures in committed results | 4 rows in 122 files, all scored 0 with error_type None. |

## C. Live documentation used (checked 2026-10-04)

| Fact | Source |
|---|---|
| gpt-5.4: reasoning.effort 'none (default), low, medium, high and xhigh'; $2.50 / $0.25 / $15 | developers.openai.com/api/docs/models/gpt-5.4 |
| gpt-5.6-terra: 'none, low, medium (default), high, xhigh, and max'; $2 / $0.20 / $12; cache writes 1.25x; 1,050,000 context | developers.openai.com/api/docs/models/gpt-5.6-terra |
| Pass reasoning items back with function calls; GPT-6.1 Sol and GPT-6 Luna default medium | developers.openai.com/api/docs/guides/reasoning |
| gpt-5-mini-2025-08-07 removed from the API on Dec 11, 2026; replacement gpt-5.6-terra; model page labelled Deprecated | developers.openai.com/api/docs/deprecations, .../models/gpt-5-mini |
| Response objects saved 30 days by default; disable with store false | developers.openai.com/api/docs/guides/conversation-state |
| GPT-5.6+: implicit and explicit cache breakpoints, cache_write_tokens, 30m TTL; pre-5.6: prompt_cache_key aids routing, 24h retention on gpt-5.4; timestamps belong at the end | developers.openai.com/api/docs/guides/prompt-caching |
| Item-reference failures and the store false guidance | github.com/vercel/ai issues 8811, 9119, 7543; PR 13234 |
| Sonnet 5.5 and Opus 5.5 reject tool_choice any/tool with 400 | platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5 and opus-5-5 migration guide |
| Claude model retirement dates (sonnet-4-6 not before 2027-02-17; haiku-4-5-20251001 not before 2026-10-15; sonnet-5-5 active) | platform.claude.com/docs/en/about-claude/model-deprecations |
| voyage-4 and voyage-4-large: default 1024, output_dimension 256/512/1024/2048; truncation default true | docs.voyageai.com/docs/embeddings |
| 'Sending only the last message' transport pattern | ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence |
| @ai-sdk/openai ai-v6 tag 3.0.124; ai ai-v6 tag 6.0.300 | npm registry dist-tags |

## D. Installed versions relevant to this scope

ai 6.0.209; @ai-sdk/openai 3.0.74 (app) and 3.0.88 (bundled inside @mastra/core 1.58.0); @ai-sdk/anthropic 3.0.85 (app) and 3.0.103 (bundled); @ai-sdk/react 3.0.211; @mastra/ai-sdk 1.5.0; @mastra/memory 1.26.1.
