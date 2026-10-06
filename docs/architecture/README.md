# Architecture guide

The system ingests public policy documents into Neo4j, retrieves policy evidence through a shared corpus library, and presents researched answers through the web application. This guide identifies implementation boundaries and behavior that architecture descriptions must preserve.

## Package responsibilities

| Package | Responsibility | Source |
| --- | --- | --- |
| `crawler` | Source discovery, document downloads, and the SQLite document registry | [Crawler guide](../../packages/crawler/README.md) |
| `pipeline` | Parsing, embeddings, graph loading, and evaluation | [Pipeline source](../../packages/pipeline/src/pipeline/) |
| `policy-corpus` | Shared retrieval, legal primitives, answer frames | [Corpus factory](../../packages/policy-corpus/src/policy-corpus.ts) |
| `contracts` | Shared API schemas and types | [Contracts source](../../packages/contracts/src/) |
| `agent` | Model/tool orchestration, verification, storage, and research execution | [Runtime entrypoint](../../packages/agent/src/index.ts) |
| `web` | Chat and research UI | [Web source](../../packages/web/src/) |
| `e2e` | Standalone Playwright mocked and smoke checks | [E2E package](../../e2e/package.json) |

Policy-family routing belongs in `PolicyCorpus` answer-frame resolution. Inspect the [frame service](../../packages/policy-corpus/src/frame/service.ts) before adding policy-specific agent prompt instructions. Keep the prompt focused on durable citation, amendment, and workflow rules.

## Chat verification

[HallucinationVerifier.processOutputStep](../../packages/agent/src/processors/verifier/processor.ts) checks the generated final answer. The server SSE adapter holds model prose and reasoning private, releases only passed or corrected final text, and emits `data-verification-status`. A correction must pass an exact-text recheck. Failed grounding or exhausted verifier retries leave the answer withheld.

Server-signed releases also guard persisted memory, recall, and thread cloning. Client verification markers do not establish trust. See the [answer release and recovery runbook](../operations/answer-release-and-recovery.md) for implementation boundaries and tests.

The [CLI entrypoint](../../packages/agent/src/index.ts) emits `---VERIFIER---` metadata consumed by the [answer-eval wrapper](../../packages/pipeline/src/pipeline/eval/levels/answer.py). Evaluation must distinguish private draft text from the released answer.

## Research persistence and recovery

[ResearchService](../../packages/agent/src/deep-research/service.ts) coordinates planning, user approval, execution, cancellation, and bounded checkpoint recovery through [ResearchRepository](../../packages/agent/src/deep-research/repository.ts). Interrupted execution can resume private completed steps with fresh internal Mastra executions, preserving the approved subset of the plan, original limits, consumed steps, and corpus identity.

Recovery permits at most two claims per run. Changed corpus/configuration, incompatible checkpoints, exhausted budgets, or failed grounding are terminal. Saved verifier drafts remain private until verified. See the [runbook](../operations/answer-release-and-recovery.md) for lease ownership, retry schedules, retention, and validation.

## Runtime configuration

The agent imports [load-env.ts](../../packages/agent/src/load-env.ts) before using its [validated runtime configuration](../../packages/agent/src/runtime-config.ts). Ad hoc scripts must import the loader or explicitly supply their environment. A successful health check is not evidence that a model request, embedding call, or multi-step conversation works; use the appropriate integration or smoke check.
