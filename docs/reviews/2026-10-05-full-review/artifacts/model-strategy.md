# Working artifact from the model-strategy reviewer

## A. Role-by-role verdicts

Prices are USD per 1M tokens (input / cached input / output unless noted), fetched live on 2026-10-04. Citation keys are in section E.

| Role | Wired at | Today | Verdict | Candidate and prerequisites | Gate |
|---|---|---|---|---|---|
| Main agent | agent/src/model.ts:29; deployed override per model-audit.md | Code default gpt-5.6-terra 2 / 0.20 / 12 [O3]; deployed gpt-5.4 2.50 / 0.25 / 15 at effort none [O4] | Switch after gate | gpt-6.1-sol 2 / 0.10 / 10, cache writes 2.50 [O1][O6], at explicit medium, then low. Needs @ai-sdk/openai 3.0.124 [N1]. gpt-6-astra 10 / 1 / 50 [O1] only if Sol at high falls short. Claude 5.5 models are blocked by the step-0 forced tool call [A4] | Answer eval, non-inferiority margin 0.10: 3 runs/arm on overall, 5 on hallucination |
| Verifier | verifier/config.ts:9, verify.ts:93 | gpt-5.6-terra at low, 30 s, two passes | Keep as pass 2; add a cross-lab pass 1 | claude-sonnet-5-5 2 / 0.20 / 10 [A1] at low effort, needs @ai-sdk/anthropic 3.0.127 [N1]; claude-sonnet-4-6 3 / 0.30 / 15 [A1] works on the installed provider; gpt-6.1-sol at low is a same-lab fallback and needs forceReasoning | Seeded-fault benchmark, one pass of about 300 cases per arm, then 5 answer runs/arm |
| Scope gate | processors/scope-gate.ts:52 | gpt-5-mini 0.25 / 0.025 / 2 [O5], default effort, no timeout | Switch before 2026-12-11 [O2] | gpt-6-luna 0.10 / 0.01 / 0.50 [O7] at effort none with a 3 s timeout; Groq openai/gpt-oss-20b 0.075 in / 0.30 out [G1] needs provider routing | 48 boundary scenarios plus 200 scope conversations, zero classifier failures |
| Injection detector | index.ts:161, deep-research/agents.ts:59 | gpt-5-mini, hardcoded | Switch before 2026-12-11 [O2] | openai/gpt-6-luna with providerOptions effort low (Mastra's bundled provider recognises gpt-6). Groq llama-prompt-guard-2-86m 0.04 [G1] is Preview with a 512-token context: evaluate only | Adversarial set, zero failures |
| Memory observer | chat-memory.ts:27 | gpt-5.4-mini 0.75 / 0.075 / 4.50 [O8] | Stay | gpt-6-luna only after real HTTP memory checks; watch for a 5.4-family deprecation notice (5.4-nano was deprecated 2026-10-01 [O2]) | None exists for multi-turn memory |
| Deep research planner, workers, writer | deep-research/config.ts:9 | Inherits AGENT_MODEL | Stay (inherit) | Split planner and writer to a stronger tier only once a research evaluation exists; fix the deadline issue first | None exists |
| Evaluation judge | pipeline/config.py:89 | claude-sonnet-4-6 3 / 15, retirement not sooner than 2027-02-17 [A1][A3] | Stay through the current campaign; fix credentials; plan successor | claude-opus-5-5 through the Batch API at 2 / 10 [A1] after a calibration bridge | Bridge: about 150 archived answers judged by both; no agent runs |
| Reference extractor | pipeline/config.py:57 | claude-haiku-4-5-20251001 1 / 5, retirement not sooner than 2026-10-15 [A1][A2][A3] | Stay (optional feature) | Make the id configurable, replace forced tool_choice [A4], use the Batch API (0.50 / 2.50) | Spot-check precision on a labelled sample |
| Document and query embeddings | pipeline/config.py:51, agent/src/config.ts:7 | voyage-4, 1,024 dimensions, 0.06 [V1][V2] | Stay | See section D | Retrieval eval is deterministic: 1 run/arm |
| Reranker | none (removed in PR 71) | none | Stay removed | rerank-3 0.05 and rerank-3-lite 0.02 exist [V1][V4]; the frame-selection objection still applies | n/a |
| Jev classifiers | policy-corpus/src/jev/client.ts:2 | jev-1.13.0, 0.042 input, output free [T1]; disabled | Stay disabled | Section roles use corpus text only and are fine offline; the scope gate would send user text to a vendor outside the approved list | Per docs/development/jev.md |
| Health probe | health.ts:67 | gpt-5-mini | Switch with the classifiers | Probe the classifier model actually deployed; treat 404 as an error | n/a |

Fast-inference providers: Groq documents no retention of inference data by default, a zero-data-retention toggle and US storage [G2], and lists openai/gpt-oss-120b (about 500 tokens/s, 0.15 / 0.60) and gpt-oss-20b as production models; its Llama models are now enterprise-only [G1]. Cerebras lists gpt-oss-120b at about 3,000 tokens/s (0.35 / 0.75) but describes its self-serve tier as not intended for production use [C1][C2]. Neither is a different lab from OpenAI for decorrelation purposes when serving gpt-oss.

## B. Cost per question at measured token volumes

Measured on 2026-10-03 (six questions, committed ledger): agent 25.0k input and 768 output tokens per question over three requests with 35% cache reads; verifier 12.3k input and 481 output per question over 1.33 passes. Claude 4.7+ rows apply Anthropic's documented 30% tokenizer increase [A1]. Reasoning or thinking tokens beyond the measured output are extra.

| Role | Model | USD per question | Basis |
|---|---|---|---|
| Agent | gpt-5.4 (deployed) | 0.054 | Measured |
| Agent | gpt-5.6-terra | about 0.052, plus 0.012 per 1k reasoning tokens | 35% reads at 0.20, 65% writes at 2.50 |
| Agent | gpt-6.1-sol | about 0.049, plus 0.010 per 1k reasoning tokens | 35% reads at 0.10, 65% writes at 2.50 |
| Agent | gpt-6-astra | about 0.25, plus 0.05 per 1k reasoning tokens | Same shape |
| Agent | claude-sonnet-5-5 | about 0.075 | Uncached, 32.5k / 1.0k tokens |
| Agent | claude-opus-5-5 | about 0.15 | Uncached |
| Verifier | gpt-5.6-terra (today) | 0.032 | Measured; 85% of input billed as cache write |
| Verifier | gpt-5.6-terra, explicit caching | about 0.028 | Static prompt read, rest uncached |
| Verifier | gpt-6.1-sol at low | about 0.031 | Implicit caching |
| Verifier | claude-sonnet-5-5 at low | about 0.038 | 16.0k / 0.6k tokens |
| Verifier | claude-sonnet-4-6 | about 0.044 | Old tokenizer |
| Verifier | claude-haiku-4-5 | about 0.015 | |
| Verifier | Groq openai/gpt-oss-120b | about 0.002 | |
| Judge, per answer | claude-sonnet-4-6 | 0.075 (batch 0.038) | Repo assumption of 20k in, 1k out |
| Judge, per answer | claude-sonnet-5-5 | about 0.065 (batch 0.033) | 26k / 1.3k tokens |
| Judge, per answer | claude-opus-5-5 | about 0.13 (batch 0.065) | 26k / 1.3k tokens |

One 55-question gate run is about $8.9: generation $3.0, verification $1.8, judge $4.1.

## C. What must pass the evaluation gate, and how many runs

Measured noise from 15 archived runs (five configurations, three runs each, 50 held-out questions, July 2026, legacy verifier): within-question standard deviation 0.30 on overall and 0.38 on hallucination, on the 0-3 scale. Runs per arm on 55 questions for 80% power at two-sided 5%:

| True difference | Overall | Hallucination |
|---|---|---|
| 0.05 | 11 | 17 |
| 0.075 | 5 | 8 |
| 0.10 | 3 | 5 |
| 0.15 | 2 | 2 |

| Change | Gate | Effect I expect | Runs |
|---|---|---|---|
| Pin main-agent effort (deployed none vs medium) | Answer eval | Plausibly 0.05-0.10 on overall, concentrated in multi-hop questions | 3 runs/arm for 0.10 on overall; 5 for hallucination |
| Main agent to gpt-6.1-sol | Answer eval as non-inferiority at 0.10, plus cost and latency | Within plus or minus 0.05; decide on non-inferiority and cost | 3-5 runs/arm; 11-17 if a 0.05 claim is required |
| Cross-lab verifier | New seeded-fault benchmark, then answer eval for withholding and hallucination | Aggregate judge effect under 0.05 because only about a quarter of answers are altered; mutant recall plausibly 10 points | One pass of about 300 cases per arm; then 5 runs/arm |
| Scope gate and injection detector models | Labelled classification sets | Zero false blocks, zero failures | One pass, repeated three times for stability |
| 512-dimension embeddings | Retrieval eval (deterministic) | No loss beyond one question | 1 run/arm |
| voyage-4-large documents | Retrieval eval plus answer eval | Below what 55 questions can resolve | Not recommended now |
| Judge successor | Calibration bridge on archived answers | Offset to be measured | No agent runs; about $10-25 |
| Explicit prompt caching, Batch API judging | None needed (same tokens, same model) | Cost only | Usage-counter smoke on six questions |

All gate work is blocked until the Anthropic evaluation credential recorded as 401 on 2026-10-04 is restored.

## D. Re-embedding cost at measured token counts

Measured with the pinned voyage-4 tokenizer: 227,390,545 tokens in 106,831 inputs across 59,415 non-empty sections (post-compaction candidate, 2026-10-04); fee schedules 205,608,000 (90.4%); the other twelve families 21,782,545; archived pre-compaction corpus 1,919,469,387.

| Model | USD per 1M [V1] | Whole corpus 227.39M | Non-fee 21.78M | Pre-compaction 1,919.47M | Whole corpus via batch (33% off) [V6] |
|---|---|---|---|---|---|
| voyage-4 | 0.06 | 13.64 | 1.31 | 115.17 | 9.14 |
| voyage-4-large | 0.12 | 27.29 | 2.61 | 230.34 | 18.28 |
| voyage-4-lite | 0.02 | 4.55 | 0.44 | 38.39 | 3.05 |
| voyage-context-4 | 0.12 | 27.29 | 2.61 | 230.34 | 18.28 |
| voyage-law-2 | 0.12 | 27.29 | 2.61 | 230.34 | not offered |

Notes. The same tokenizer asset is pinned for voyage-4 and voyage-4-large, so their counts are exact; the other rows are approximations. Voyage lists the first 200M tokens free for the 4 series and voyage-context-4 (50M for voyage-law-2), and free tokens do not apply to batch [V1]; whether this account has any allowance left is unknown. Dimensions are 1,024 by default with 256, 512 and 2,048 available; output types are float, int8, uint8, binary and ubinary [V2][V8]. All 4-series embeddings share one space, so documents and queries may use different 4-series models [V3][V7]. voyage-context-4 uses a separate endpoint with a 32K-token limit per pre-chunked request [V5].

## E. Vendor ledger (all fetched 2026-10-04)

- [O1] https://developers.openai.com/api/docs/pricing : gpt-6-astra 10 / 1 / 12.50 write / 50; gpt-6.1-sol 2 / 0.10 / 2.50 write / 10; gpt-6-luna 0.10 / 0.01 / 0.125 write / 0.50; batch and flex 50%; over 272K input is 2x input and 1.5x output; regional processing +10%.
- [O2] https://developers.openai.com/api/docs/deprecations : gpt-5-mini-2025-08-07 removed 2026-12-11; gpt-5.4-nano, gpt-5.1, gpt-5.3-codex removed 2027-04-01; o1, o3-mini, o4-mini removed 2026-10-23; at least six months' notice for generally available models.
- [O3] https://developers.openai.com/api/docs/models/gpt-5.6-terra : id gpt-5.6-terra; effort default medium; cache writes 1.25x; described as roughly the mini tier of earlier GPT-5 families.
- [O4] https://developers.openai.com/api/docs/models/gpt-5.4 : snapshot gpt-5.4-2026-03-05; effort default none.
- [O5] https://developers.openai.com/api/docs/models/gpt-5-mini : only snapshot gpt-5-mini-2025-08-07.
- [O6] https://developers.openai.com/api/docs/models/gpt-6.1-sol : effort low to max, default medium; Responses API required for tool calling; cached input at 5%.
- [O7] https://developers.openai.com/api/docs/models/gpt-6-luna : effort none to max, default medium.
- [O8] https://developers.openai.com/api/docs/models/gpt-5.4-mini : snapshot gpt-5.4-mini-2026-03-17; effort default none.
- [O9] https://developers.openai.com/api/docs/guides/prompt-caching : GPT-5.6+ writes 1.25x, reads 0.1x (0.05x on Sol), implicit and explicit modes, 1,024-token minimum, 30-minute lifetime.
- [O10] https://developers.openai.com/api/docs/guides/reasoning and [O11] https://developers.openai.com/api/docs/guides/latest-model : effort defaults and GPT-6 migration notes.
- [A1] https://platform.claude.com/docs/en/about-claude/pricing : claude-opus-5-5 4 / 20 (cache read 0.20, batch 2 / 10); claude-sonnet-5-5 2 / 10 (read 0.20, batch 1 / 5); claude-sonnet-4-6 3 / 15 (batch 1.50 / 7.50); claude-haiku-4-5 1 / 5 (batch 0.50 / 2.50); 4.7+ tokenizer about 30% more tokens.
- [A2] https://platform.claude.com/docs/en/about-claude/models/overview : ids claude-opus-5-5, claude-sonnet-5-5, claude-haiku-4-5-20251001.
- [A3] https://platform.claude.com/docs/en/about-claude/model-deprecations : retirement floors and the temperature rule for 4.7+.
- [A4] https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide : forced tool choice and sampling parameters return 400.
- [A5] https://platform.claude.com/docs/en/build-with-claude/prompt-caching : minimum cacheable prompt 512 tokens (Sonnet 5.5, Opus 5.5), 1,024 (Sonnet 4.6), 4,096 (Haiku 4.5).
- [V1] https://docs.voyageai.com/docs/pricing ; [V2] https://docs.voyageai.com/docs/embeddings ; [V3] https://blog.voyageai.com/2026/01/15/voyage-4/ ; [V4] https://docs.voyageai.com/docs/reranker ; [V5] https://docs.voyageai.com/docs/contextualized-chunk-embeddings ; [V6] https://docs.voyageai.com/docs/batch-inference ; [V7] https://docs.voyageai.com/docs/faq ; [V8] https://docs.voyageai.com/docs/flexible-dimensions-and-quantization
- [G1] https://console.groq.com/docs/models ; [G2] https://console.groq.com/docs/your-data
- [C1] https://www.cerebras.ai/pricing ; [C2] https://inference-docs.cerebras.ai/models/overview
- [T1] https://docs.typesafe.ai/models
- [N1] npm registry ai-v6 dist-tags: @ai-sdk/openai 3.0.124, @ai-sdk/anthropic 3.0.127 (installed: 3.0.74 and 3.0.85).

## F. Reproduction

Scripts and notes are in <review scratch directory, not kept>/model-strategy : variance.py and power.py (variance components and run counts from saved eval results), pin_check.py (offline tokenizer-pin check), ledger.md (vendor facts), npm/ (the two newer provider tarballs inspected).
