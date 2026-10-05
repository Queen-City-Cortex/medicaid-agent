# Working artifact from the agent-verifier reviewer

## A. Channel inventory: where model-generated text can go (chat path)

Scenario ids refer to scratch runs through the production route with mocked models (A1-A11) and pure-function runs (D1-D8, expB).

| Channel | Carries | Reaches client | Persisted | Gated? | Evidence |
|---|---|---|---|---|---|
| SSE text-start/delta/end | agent prose (interim and final draft) | no | n/a | yes: dropped; text comes only from the verification part's answer | A1-A8 |
| SSE reasoning-* | reasoning summaries | no | stripped | yes | answer-release.ts:118, processor.ts:69 |
| SSE tool-input-available (and deltas) | agent-written tool arguments, unbounded strings | yes, rendered by ToolStep and live narration | yes (tool-invocation args) | no, by design (progress) | A1 |
| SSE tool-output-available | corpus tool results | yes | yes | n/a (server data) | A1 |
| SSE tool-output-error | raw tool error message plus argsJson | yes | yes (errorText) | no | A11a |
| SSE error | provider/framework error | fixed string | no | yes | A11b |
| SSE data-tripwire | abort reason (classifier-written for scope gate and injection detector) and metadata | yes; UI renders only metadata.userMessage | no | no | A9 |
| SSE data-om-observation-end, data-om-buffering-end, data-om-activation | observer-LLM observations, currentTask, suggestedResponse | yes; UI drops data-om-* | yes, inside signed released messages | no | A1, A2, A10, A4om |
| SSE data-om-status | token counters | yes | yes | n/a (no model text) | A1 |
| SSE data-verification-status | status, reason, passCount, confidence, severity, counts | yes | outcome only | server-authored | A1 |
| start / finish messageMetadata | nothing configured | - | - | message-metadata chunks dropped | read |
| Thread title | client-supplied; generateTitle false and OM threadTitle false by default | own title only | yes | not model-generated today (default, not pinned) | read |
| Thread metadata mastra.om.* | observer-LLM suggestedResponse, currentTask | yes via GET thread(s) | yes | no | A1, A3 |
| Message history, update, clone | released text, tool parts, data parts | yes | yes | text: HMAC guard on write and read; data-om parts pass | A1-A10, repo tests |
| Observational-memory records | observer summaries of guarded/stripped messages | no direct route | yes | not verified; injected into later prompts; legacy filter broken (finding 8) | A3, expB |
| Working memory | - | - | - | disabled | chat-memory.ts:29 |
| Built-in Mastra agent / save-messages routes | raw agent stream | no (404) | - | positive-list gateway | execution-gateway.ts:22-35 |
| CLI stdout | verified text; raw draft only with VERIFIER_ENABLED=false outside production; evidence dump | operator | - | yes unless opted out | read |
| Private diagnostics directory | drafts, evidence, verdicts | operator filesystem | 0600 files | opt-in | read, repo tests |
| Mastra debug logs and trace spans | step text including drafts | operator | DuckDB only when TRACE_STORE=duckdb | off in production | read |

## B. Failure-mode matrix (observed)

| Event | Client receives | Storage after the turn | Run |
|---|---|---|---|
| Provider 5xx / network / 30 s timeout | withheld, reason unavailable, one attempt | signed withheld notice | A5, repo timeout test |
| Non-JSON or schema-invalid verdict | withheld, reason unavailable | signed withheld notice | A8a, A8b |
| Inconsistent verdict (supported true, unsupported claim listed) | withheld, reason unusable_correction | signed withheld notice | A8c |
| Processor throws (diagnostics directory permissions) | sanitized error, no text | nothing unsigned | repo test |
| sources = [] | withheld after 2 verifier calls | signed withheld notice | D3 |
| Routing hint only + clean LLM verdict | passed | released | D3, D8 |
| Model error mid-run | sanitized error plus withheld notice | tool parts only | A11b |
| Tool throws | tool-output-error with raw message; answer judged without that evidence | errorText persisted | A11a |
| Client disconnects during verification | nothing further | both passes complete; corrected answer persisted | A7 |
| Text plus tool call in one step | nothing | narration absent from context, observer and rows | A3 |
| Step-limit forced synthesis | correct release | extra 'not verified' notice; without OM the release sits on the feedback message | A4, A4raw, A4om |
| Input tripwire | data-tripwire (with reason) and finish | nothing persisted | A9 |
| finishReason not stop, or empty text | withheld notice at finish | text stripped | read |

## C. What decides a release

| Check | Mechanism | Blocks? |
|---|---|---|
| Coverage scope (three hard-coded topics) | deterministic, before any model call | yes |
| Claim support, citation completeness, major relevance | one gpt-5.6-terra call per pass, reasoning effort low, strict JSON schema, 30 s, 0 retries | yes |
| Minor relevance, cite_scope_and_not_covered | same call | no (informational) |
| URL provenance | deterministic; any URL in any source entry, including the routing hint, plus the portal root | yes |
| Quotations of 30+ characters and blockquotes | deterministic substring against non-frame sources | yes |
| Leftover warning markers, empty answer | regex / trim | yes |
| At least one source with text | deterministic; satisfied by the routing hint or an empty getAmendments entry | yes (never fires in chat) |
| Numbers, dates, dollar amounts; negations and qualifiers | prompt instruction only | LLM-dependent |
| Superseded or older-variant source | prompt instruction, only if a change notice is in evidence; status and supersession fields are not serialized | LLM-dependent |
| Omitted limitations | not checked | no |

Parameters: VERIFIER_MODEL default gpt-5.6-terra; evidence cap 120,000 characters (VERIFIER_MAX_SOURCE_TOKENS 30000 x 4); at most 2 passes; worst case about 32k input tokens per pass (about $0.06 at the repo's $2 per million input price) plus output; not recorded in usage_events for chat.
