# Evaluation Harness — Design Specification

**Project:** NC Medicaid Navigator — Layer 1
**Author:** Jeff Hoffman / Queen City Cortex LLC
**Date:** March 27, 2026
**Depends on:** Layer 0 (complete)
**Location:** `packages/pipeline/src/pipeline/eval/` (new subpackage)

---

## 1. Purpose

Build a test framework that measures retrieval quality, cross-reference resolution, and answer quality independently, using real questions with verified answers. Every downstream change — embedding model swaps, retrieval tuning, agent prompt changes, graph schema updates — must be measurable against this harness within minutes.

### What This Does

- Defines a golden dataset format for Medicaid policy Q&A pairs
- Measures retrieval precision and recall at the section level
- Measures cross-reference traversal accuracy
- Measures end-to-end answer correctness (stub until Layer 3 agent exists)
- Measures citation accuracy (stub until Layer 3)
- Tracks all results over time for regression detection

### What This Does NOT Do

- Replace manual review
- Test the product UI (Layer 4)
- Test update pipeline correctness (Layer 5)
- Generate golden dataset entries automatically (human-authored and human-verified)

---

## 2. Golden Dataset

### 2.1 Entry Schema

Each entry is a single policy question with a verified answer and evidence trail.

```jsonc
{
  "id": "q-047",
  "version": 2,
  "created": "2026-03-28",
  "updated": "2026-03-28",
  "question": "Does NC Medicaid cover power wheelchair repairs for CAP/DA beneficiaries, and is prior authorization required?",
  "difficulty": "moderate",               // simple | moderate | complex
  "reasoning_type": "multi_hop",          // single_lookup | multi_hop | cross_document | temporal
  "topics": ["dme", "prior_authorization", "cap_da"],
  "target_users": ["beneficiary", "case_manager"],
  "answer": {
    "text": "Yes. NC Medicaid covers power wheelchair repairs under Clinical Coverage Policy 5B...",
    "confidence": "high",                 // high | medium | low
    "caveats": ["Dollar threshold for PA may change with bulletin updates"]
  },
  "evidence": {
    "primary_sections": [
      {
        "document_id": "doc:clinical_policy:5B",
        "section_id": "sec:doc:clinical_policy:5B:5.1",
        "section_number": "5.1",
        "relevance": "Defines DME repair coverage and PA thresholds"
      }
    ],
    "supporting_sections": [...],
    "cross_references": [
      {
        "from_section": "sec:doc:clinical_policy:5B:5.1",
        "to_section": "sec:doc:waiver:cap_da:4.3",
        "type": "requires_context",
        "note": "Policy references waiver requirements without citing specific section"
      }
    ],
    "federal_references": [...]
  },
  "source": "lived_experience",           // lived_experience | legal_aid | edge_case | regression
  "notes": "Real beneficiary question."
}
```

### 2.2 Question Categories & Targets

| Category | Target | Description |
|---|---|---|
| Simple lookup | 15–20 | Single document, single section answers |
| Multi-hop | 15–20 | Answer requires following cross-references |
| Cross-document | 10–15 | Answer spans multiple unrelated documents |
| Temporal | 5–10 | Depends on effective dates, supersession |
| Definitional | 5–10 | Requires resolving a defined term |
| Federal-state | 5–10 | State policy alongside federal regulation |
| Negative | 5–10 | Correct answer is "not covered" |
| Ambiguous | 5 | No clear answer — tests uncertainty signaling |

Minimum viable dataset: 50 entries. Target: 100.

### 2.3 Storage

```
packages/pipeline/data/golden/
├── dataset.json              # Full golden dataset (array of entries)
├── dataset.schema.json       # JSON Schema for validation
└── CHANGELOG.md              # Track changes
```

Version-controlled in git. Eval results also committed for regression tracking.

---

## 3. Eval Levels

### Level 1: Retrieval

Given a question, does vector search return the right sections?

**Metrics:**
- Precision@k, Recall@k, MRR, Primary Hit Rate

### Level 2: Cross-Reference Resolution

Given a retrieved section that references another, does the resolver find the correct target?

**Metrics:**
- Resolution Rate, False Resolution Rate, Extraction Miss Rate

### Level 3: End-to-End Answer Quality (stub — requires Layer 3 agent)

LLM-as-judge evaluation: factual accuracy, completeness, hallucination rate, confidence calibration, refusal accuracy.

**Judge model:** claude-sonnet-4-6 (cheaper model judges the agent's output)

### Level 4: Citation Accuracy (stub — requires Layer 3 agent)

Do citations in the agent's answer point to sections that actually support the claims?

**Metrics:**
- Citation Precision, Citation Recall, Phantom Citation Rate, Wrong-Section Rate

---

## 4. Architecture

### 4.1 Project Structure

```
packages/pipeline/src/pipeline/eval/
├── __init__.py
├── runner.py                # Main eval orchestrator
├── levels/
│   ├── __init__.py
│   ├── retrieval.py         # Level 1
│   ├── cross_ref.py         # Level 2
│   ├── answer.py            # Level 3 (stub)
│   └── citation.py          # Level 4 (stub)
├── judge.py                 # LLM-as-judge wrapper (stub)
├── metrics.py               # Metric computation and aggregation
├── dataset.py               # Golden dataset loader and validator
├── results.py               # Result storage and comparison
└── reports.py               # Human-readable report generation
```

### 4.2 Result Storage

```
packages/pipeline/data/eval-results/
├── 2026-03-28T14:30:00_retrieval.json
├── 2026-03-28T14:30:00_cross_ref.json
└── ...
```

Each result includes: run_id, level, config (model, top_k, git_sha), aggregate metrics, by_difficulty breakdown, by_category breakdown, per_question details.

### 4.3 Regression Detection

`results.py` provides `compare(run_a, run_b)` that computes deltas, flags regressions beyond threshold (default 5%), and lists questions that flipped pass→fail.

---

## 5. CLI Interface

```bash
python -m pipeline.cli eval                              # Run all available levels
python -m pipeline.cli eval --level retrieval             # Specific level
python -m pipeline.cli eval --level retrieval --top-k 20  # Custom top-k
python -m pipeline.cli eval --level retrieval --category multi_hop
python -m pipeline.cli eval --level retrieval --difficulty complex
python -m pipeline.cli eval --level retrieval --question q-047
python -m pipeline.cli eval-compare <run_a> <run_b>       # Compare two runs
python -m pipeline.cli eval-runs                          # List past runs
python -m pipeline.cli eval-validate                      # Validate dataset against graph
```

---

## 6. Configuration

Add to `config.py`:

```python
GOLDEN_DATASET_PATH = PROJECT_ROOT / "data" / "golden" / "dataset.json"
GOLDEN_DATASET_SCHEMA = PROJECT_ROOT / "data" / "golden" / "dataset.schema.json"
EVAL_RESULTS_DIR = PROJECT_ROOT / "data" / "eval-results"
EVAL_DEFAULT_TOP_K = 10
EVAL_REGRESSION_THRESHOLD = 0.05
EVAL_JUDGE_MODEL = "claude-sonnet-4-6"
```

---

## 7. Testing

### Unit Tests
- Golden dataset schema validation
- Precision/recall/MRR computation with known inputs
- Regression comparison logic
- Dataset filtering by difficulty, category, question ID

### Integration Test
- Run `eval --level retrieval --question <id>` against live graph for one known-good entry
- Verify primary section in top-10

---

## 8. Implementation Order

1. Golden dataset schema + validator + loader (`dataset.py`, `dataset.schema.json`)
2. Seed 5-10 synthetic entries from known graph documents
3. Retrieval eval (`levels/retrieval.py`, `metrics.py`)
4. Result storage + comparison (`results.py`)
5. CLI integration (`eval`, `eval-compare`, `eval-runs`, `eval-validate`)
6. Report formatting (`reports.py`)
7. Cross-reference eval (`levels/cross_ref.py`)
8. Stub Level 3 and Level 4 (`levels/answer.py`, `levels/citation.py`, `judge.py`)

---

## 9. Success Criteria

1. Golden dataset has 10+ validated entries (synthetic seed; Jeff expands to 50).
2. `eval-validate` passes with zero reference integrity errors.
3. `eval --level retrieval` runs in under 60 seconds and produces correct metrics.
4. `eval --level cross-ref` reports resolution accuracy against golden cross-references.
5. `eval-compare` correctly identifies regressions.
6. Baseline retrieval numbers established.
7. At least 3 eval runs stored, demonstrating regression tracking.
