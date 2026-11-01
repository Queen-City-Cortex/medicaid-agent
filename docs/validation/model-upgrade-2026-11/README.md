# Model upgrade, November 2026

The owner asked on 2026-11-01 to move every model to the current generation: `gpt-6.1-*` for OpenAI and the 5.5 models for Anthropic. This record holds what changed, why, how each change is checked, and the results. Prices are per million tokens (input / output), checked on 2026-11-01 against the OpenAI pricing and model pages and the Claude model table.

## What changes

| Use | Before | After | Price before → after |
| --- | --- | --- | --- |
| Chat agent and deep research (`AGENT_MODEL`) | `gpt-5.6-terra` | `gpt-6.1-terra` | $2 / $12 → $1 / $5 |
| Answer verifier (`VERIFIER_MODEL`) | `gpt-5.6-terra` | `gpt-6.1-terra` | $2 / $12 → $1 / $5 |
| Scope gate, injection detectors, health probe (`CLASSIFIER_MODEL`) | `gpt-5-mini` (retires 2026-12-11) | `gpt-6-luna` | $0.25 / $2 → $0.10 / $0.50 |
| Observational memory (off by default) | `gpt-5.4-mini` | `gpt-6-luna` | $0.75 / $4.50 → $0.10 / $0.50 |
| Evaluation judge (`EVAL_JUDGE_MODEL`) | `claude-sonnet-4-6` | `claude-sonnet-5-5` | $3 / $15 → $2 / $10 |
| Reference extractor, pass 2 (`LLM_MODEL`) | `claude-haiku-4-5` | `claude-haiku-5-5` | $1 / $5 → $0.10 / $0.50 |

OpenAI has no `gpt-6.1` small tier, so the classifiers use `gpt-6-luna`, the current small model. Both `gpt-6.1-terra` and `gpt-6-luna` take `none` through `max` effort but not `minimal`, which the start-up check already enforces; the agent runs at medium and the verifier at low, as before.

Not changed:

- `voyage-4` embeddings (not an OpenAI or Anthropic model).
- The Jev tooling (`ai_review.py` pins `gpt-5-mini` and `claude-opus-4-6`; `benchmarks.py` pins its frozen scope baseline to `gpt-5-mini`). Their artifacts record those ids, and issue #193 removes Jev; after 2026-12-11 the scope campaign cannot run.
- `scripts/ops/run-cost-sample.py`, which is priced for the `gpt-5.4` deployment it sampled.

Production: the October audit recorded `AGENT_MODEL=gpt-5.4` set on the production agent and corpus job. The deployment step removes it, so production runs the evaluated default.

## Expected cost

About $0.075 per chat answer before (agent plus verifier, estimated from the October measurement repriced to `gpt-5.6-terra`), about $0.035 after: roughly 53 percent less. The classifiers' cost was already under $0.001 per turn.

## Checks

Each check runs from `scripts/model-upgrade-checks.sh <stage>` with the owner's keys. None runs in CI.

| Stage | What it compares | Pass rule | Spend |
| --- | --- | --- | --- |
| `classifiers` | `gpt-5-mini` vs `gpt-6-luna` on 200 scope conversations and 22 injection probes ([gotchas](../../development/gotchas.md)) | No more real questions or benign probes blocked, no fail-opens, p95 under 5 s | under $1 |
| `judge` | `claude-sonnet-4-6` vs `claude-sonnet-5-5` on the stored answers of the 2026-09-22 release evidence | Each dimension's mean within 0.15; at least 90 percent agreement on overall ≥ 2 and hallucination ≥ 2 | at most $15 |
| `verifier` | `gpt-5.6-terra` vs `gpt-6.1-terra`, low effort, seeded and originals fixtures ([runbook](../../operations/verifier-benchmark.md)) | Decision 0002's cost-swap rule: no seeded kind drops, no more withholding, aborts under 2 percent | $10 of trials, then at most $60 per arm |
| `agent` | `gpt-5.6-terra` vs `gpt-6.1-terra` and `gpt-6.1-sol` ($2 / $10) on the held-out paraphrases, 3 runs per arm, with the old verifier and judge held fixed | `scripts/eval-ab.sh agent` verdict: overall within 0.05, and hallucination not lower. Terra is the default if it passes; Sol is adopted instead only if it scores clearly higher | about $50 |

The agent stage needs a Neo4j holding the corpus. Each stage's output goes to `model-upgrade-results/` (gitignored) and stays outside Git with the commit.

## Results

Not run yet. Each stage's summary table, spend and commit go here, and the change merges only after every stage passes.
