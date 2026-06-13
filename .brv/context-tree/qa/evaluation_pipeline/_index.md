---
children_hash: 6da4f43dadad43e3e6442db83b18ccd0b6f53e1e25a52f2c282a4038c75f3dd0
compression_ratio: 0.2840885142255005
condensation_order: 1
covers: [answer_quality/_index.md, answer_quality_and_cross_reference_evaluation.md, context.md, cross_reference_resolution/_index.md, evaluation_pipeline.md, held_out_evaluation_dataset_and_ssa_ingestion_rules.md]
covers_token_total: 4745
summary_level: d1
token_count: 1348
type: summary
---
# Evaluation Pipeline

The QA evaluation pipeline has two coordinated layers: **Level 3 answer evaluation** and **Level 2 cross-reference evaluation**. Together they score agent answers against golden data, resolve supporting evidence from Neo4j, and verify document/section relationship integrity for the NC Medicaid agent.

## Core structure
- **Level 3 answer scoring** lives in `packages/pipeline/src/pipeline/eval/levels/answer.py`
- **Level 2 cross-reference checking** lives in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
- Both feed aggregated QA metrics such as recall, precision, and primary hit
- Related orchestration and dataset handling are covered in **held_out_evaluation_dataset_and_ssa_ingestion_rules.md**

## Level 3: Answer Evaluation
See **answer_quality/_index.md** and **answer_quality_and_cross_reference_evaluation.md** for the answer-scoring flow.

### Flow
`question -> _invoke_agent -> _fetch_evidence_texts -> judge_answer -> results append`

### Key behaviors
- Agent invocation is **HTTP-first**, using `http://localhost:4111/api/agents/ncMedicaidAgent/generate`
- If HTTP fails, it falls back to CLI execution via `npx tsx src/index.ts` in `AGENT_DIR`
- Evidence is fetched from **Neo4j Section nodes** by section ID and concatenated as `title + content_text`
- `evaluate_answers(entries)` records agent output, evidence texts, and judge scores per golden entry
- Compatibility fields include aliases such as `precision`, `recall`, `mrr`, and `primary_hit`

### Error handling rules
- If `agent_error` is present, all numeric scores are set to `0`, and the explanation is preserved
- If `judge_answer` raises or returns a judge-type error, `factual_accuracy`, `completeness`, `overall`, and `citation_quality` become `None`
- Judge errors are **excluded from aggregation** so they do not skew metrics

### Dependencies and links
- Uses `httpx`, `subprocess`, `get_session`, and `judge_answer`
- Connected evaluation contexts:
  - `qa/evaluation_pipeline/evaluation_pipeline.md`
  - `qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md`
  - `qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md`
  - `qa/hallucination_verifier/hallucination_verifier_processor.md`
  - `qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md`

## Level 2: Cross-Reference Evaluation
See **cross_reference_resolution/_index.md** and **answer_quality_and_cross_reference_evaluation.md** for relationship validation details.

### Purpose
This layer verifies whether golden cross-references are supported by Neo4j graph relationships between documents and sections.

### Flow
`entry -> iterate cross_references -> document-level Neo4j query -> section-level fallback -> compute metrics -> aggregate results`

### Resolution rules
A reference counts as resolved when the graph contains:
- `REFERENCES_DOCUMENT`
- `AMENDS` in either direction
- section-level `REFERENCES` fallback when document edges are missing

### Metrics and outputs
- Captures `resolved_count`, `missed_count`, `precision`, `recall`, `difficulty`, `reasoning_type`, and `primary_hit`
- Uses `total_refs = len(cross_references)`
- `precision` and `recall` are derived from resolved count over total refs
- `false_resolutions` and `extraction_misses` remain hard-coded to `0` pending future instrumentation

### Outcome notes
- Bidirectional and fallback relationship checks improved coverage
- Previously failing references still flagged for extraction improvement include:
  - `q-004`
  - `q-009`
  - `q-020`

## Related pipeline orchestration
See **evaluation_pipeline.md** for the higher-level pipeline description.

### Combined behavior
- Level 3 performs answer scoring with agent invocation, Neo4j evidence retrieval, and judge scoring
- Level 2 validates cross-reference relationships in the graph
- Downstream aggregates combine these outputs for final QA reporting

### Shared dependencies
- `judge_answer`
- Neo4j session helpers
- `AGENT_DIR` configuration for agent access

## Dataset and ingestion context
See **held_out_evaluation_dataset_and_ssa_ingestion_rules.md** for the evaluation runner and dataset rules that support this pipeline.

### Important facts
- Held-out paraphrase dataset uses IDs `h-001..h-050`
- `eval/eval-validate` accepts `--dataset`
- `run_eval` records dataset path in result config
- Schema IDs match `^(q|h)-\d+$`
- SSA ingestion uses explicit SSA↔USC mapping and freestanding USC exclusions
- Section numbering alone must never be used to infer SSA membership

### Operational notes
- `run_eval` supports retrieval, cross-ref, answer, and citation levels
- CLI eval defaults to retrieval when `--level` is omitted
- Citation eval requires `--from-result`
- Mixed-corpus build includes parsing, loading state/federal sources, cross-reference extraction, amendment detection, embedding, vector indexing, and optional concept seeding

## Drill-down references
- **answer_quality/_index.md** — Level 3 answer evaluation summary and scoring rules
- **answer_quality_and_cross_reference_evaluation.md** — combined QA pipeline documentation
- **cross_reference_resolution/_index.md** — Level 2 cross-reference evaluation overview
- **evaluation_pipeline.md** — end-to-end QA pipeline summary
- **held_out_evaluation_dataset_and_ssa_ingestion_rules.md** — dataset, runner, and SSA ingestion rules