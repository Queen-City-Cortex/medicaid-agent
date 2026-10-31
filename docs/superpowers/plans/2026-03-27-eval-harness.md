# Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an eval framework that measures retrieval and cross-reference quality against a golden dataset of Medicaid policy Q&A pairs, with regression detection across runs.

**Architecture:** Golden dataset (JSON) defines questions with verified answers and evidence trails. Eval runner iterates questions, runs vector search or cross-ref resolution, computes precision/recall/MRR, stores results as timestamped JSON. Comparison function detects regressions between runs.

**Tech Stack:** Python 3.14, Neo4j (existing graph), Voyage AI (existing embeddings), Click (existing CLI), Pydantic (validation), Rich (terminal output)

**Spec:** `docs/superpowers/specs/2026-03-27-eval-harness-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `packages/pipeline/src/pipeline/config.py` | Add eval config constants (modify) |
| `packages/pipeline/src/pipeline/eval/__init__.py` | Package init (create) |
| `packages/pipeline/src/pipeline/eval/dataset.py` | Golden dataset loader, validator, filtering (create) |
| `packages/pipeline/src/pipeline/eval/metrics.py` | Precision, recall, MRR, primary hit rate computation (create) |
| `packages/pipeline/src/pipeline/eval/levels/__init__.py` | Levels package init (create) |
| `packages/pipeline/src/pipeline/eval/levels/retrieval.py` | Level 1: vector search eval (create) |
| `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` | Level 2: cross-reference resolution eval (create) |
| `packages/pipeline/src/pipeline/eval/levels/answer.py` | Level 3: stub (create) |
| `packages/pipeline/src/pipeline/eval/levels/citation.py` | Level 4: stub (create) |
| `packages/pipeline/src/pipeline/eval/judge.py` | LLM-as-judge stub (create) |
| `packages/pipeline/src/pipeline/eval/runner.py` | Eval orchestrator — selects level, iterates questions, collects results (create) |
| `packages/pipeline/src/pipeline/eval/results.py` | Result storage, loading, comparison (create) |
| `packages/pipeline/src/pipeline/eval/reports.py` | Terminal + markdown report formatting (create) |
| `packages/pipeline/src/pipeline/cli.py` | Add eval, eval-compare, eval-runs, eval-validate commands (modify) |
| `packages/pipeline/data/golden/dataset.json` | Golden dataset (create, seed with 5-10 entries) |
| `packages/pipeline/data/golden/dataset.schema.json` | JSON Schema for validation (create) |
| `packages/pipeline/data/golden/CHANGELOG.md` | Dataset change log (create) |
| `packages/pipeline/tests/test_dataset.py` | Dataset loader/validator tests (create) |
| `packages/pipeline/tests/test_metrics.py` | Metric computation tests (create) |

---

### Task 1: Config & Package Setup

**Files:**
- Modify: `packages/pipeline/src/pipeline/config.py`
- Create: `packages/pipeline/src/pipeline/eval/__init__.py`
- Create: `packages/pipeline/src/pipeline/eval/levels/__init__.py`

- [ ] **Step 1: Add eval config constants**

Append to `packages/pipeline/src/pipeline/config.py`:

```python
# Evaluation harness
GOLDEN_DATASET_PATH = PROJECT_ROOT / "data" / "golden" / "dataset.json"
GOLDEN_DATASET_SCHEMA = PROJECT_ROOT / "data" / "golden" / "dataset.schema.json"
EVAL_RESULTS_DIR = PROJECT_ROOT / "data" / "eval-results"
EVAL_DEFAULT_TOP_K = 10
EVAL_REGRESSION_THRESHOLD = 0.05  # 5% drop = regression flag
EVAL_JUDGE_MODEL = "claude-sonnet-4-6"
```

- [ ] **Step 2: Create package directories**

```bash
mkdir -p packages/pipeline/src/pipeline/eval/levels
mkdir -p packages/pipeline/data/golden
mkdir -p packages/pipeline/data/eval-results
touch packages/pipeline/src/pipeline/eval/__init__.py
touch packages/pipeline/src/pipeline/eval/levels/__init__.py
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/config.py packages/pipeline/src/pipeline/eval/
git commit -m "feat(eval): add eval config and package scaffold"
```

---

### Task 2: Golden Dataset Schema & Loader (TDD)

**Files:**
- Create: `packages/pipeline/data/golden/dataset.schema.json`
- Create: `packages/pipeline/src/pipeline/eval/dataset.py`
- Create: `packages/pipeline/tests/test_dataset.py`

- [ ] **Step 1: Create the JSON Schema**

Write `packages/pipeline/data/golden/dataset.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "version", "created", "updated", "question", "difficulty", "reasoning_type", "topics", "answer", "evidence", "source"],
    "properties": {
      "id": { "type": "string", "pattern": "^q-\\d+$" },
      "version": { "type": "integer", "minimum": 1 },
      "created": { "type": "string", "format": "date" },
      "updated": { "type": "string", "format": "date" },
      "question": { "type": "string", "minLength": 10 },
      "difficulty": { "type": "string", "enum": ["simple", "moderate", "complex"] },
      "reasoning_type": { "type": "string", "enum": ["single_lookup", "multi_hop", "cross_document", "temporal"] },
      "topics": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
      "target_users": { "type": "array", "items": { "type": "string" } },
      "answer": {
        "type": "object",
        "required": ["text", "confidence"],
        "properties": {
          "text": { "type": "string", "minLength": 10 },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
          "caveats": { "type": "array", "items": { "type": "string" } }
        }
      },
      "evidence": {
        "type": "object",
        "required": ["primary_sections"],
        "properties": {
          "primary_sections": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["document_id", "section_id", "relevance"],
              "properties": {
                "document_id": { "type": "string" },
                "section_id": { "type": "string" },
                "section_number": { "type": "string" },
                "relevance": { "type": "string" }
              }
            },
            "minItems": 1
          },
          "supporting_sections": { "type": "array" },
          "cross_references": { "type": "array" },
          "federal_references": { "type": "array" }
        }
      },
      "source": { "type": "string", "enum": ["lived_experience", "legal_aid", "edge_case", "regression"] },
      "notes": { "type": "string" }
    }
  }
}
```

- [ ] **Step 2: Write the dataset test**

Write `packages/pipeline/tests/test_dataset.py`:

```python
"""Test golden dataset loader and validator."""

import json
import pytest
from pathlib import Path
from pipeline.eval.dataset import load_dataset, validate_dataset, filter_dataset


SAMPLE_ENTRY = {
    "id": "q-001",
    "version": 1,
    "created": "2026-03-28",
    "updated": "2026-03-28",
    "question": "What is the age limit for EPSDT services in NC Medicaid?",
    "difficulty": "simple",
    "reasoning_type": "single_lookup",
    "topics": ["epsdt"],
    "target_users": ["beneficiary"],
    "answer": {
        "text": "EPSDT services are available to Medicaid beneficiaries under age 21.",
        "confidence": "high",
        "caveats": []
    },
    "evidence": {
        "primary_sections": [
            {
                "document_id": "doc:clinical_policy:1A",
                "section_id": "sec:doc:clinical_policy:1A:3.1",
                "section_number": "3.1",
                "relevance": "Defines EPSDT age eligibility"
            }
        ],
        "supporting_sections": [],
        "cross_references": [],
        "federal_references": []
    },
    "source": "lived_experience",
    "notes": "Basic EPSDT question."
}

SAMPLE_DATASET = [
    SAMPLE_ENTRY,
    {**SAMPLE_ENTRY, "id": "q-002", "difficulty": "moderate", "reasoning_type": "multi_hop"},
    {**SAMPLE_ENTRY, "id": "q-003", "difficulty": "complex", "reasoning_type": "cross_document"},
]


class TestValidateDataset:
    def test_valid_dataset(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        errors = validate_dataset(path)
        assert errors == []

    def test_missing_required_field(self, tmp_path):
        bad = {**SAMPLE_ENTRY}
        del bad["question"]
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([bad]))
        errors = validate_dataset(path)
        assert len(errors) > 0

    def test_invalid_difficulty(self, tmp_path):
        bad = {**SAMPLE_ENTRY, "difficulty": "impossible"}
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([bad]))
        errors = validate_dataset(path)
        assert len(errors) > 0


class TestLoadDataset:
    def test_loads_entries(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        entries = load_dataset(path)
        assert len(entries) == 3

    def test_returns_dicts(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        entries = load_dataset(path)
        assert all(isinstance(e, dict) for e in entries)


class TestFilterDataset:
    def test_filter_by_difficulty(self):
        result = filter_dataset(SAMPLE_DATASET, difficulty="simple")
        assert len(result) == 1
        assert result[0]["id"] == "q-001"

    def test_filter_by_category(self):
        result = filter_dataset(SAMPLE_DATASET, reasoning_type="multi_hop")
        assert len(result) == 1
        assert result[0]["id"] == "q-002"

    def test_filter_by_question_id(self):
        result = filter_dataset(SAMPLE_DATASET, question_id="q-003")
        assert len(result) == 1

    def test_no_filter_returns_all(self):
        result = filter_dataset(SAMPLE_DATASET)
        assert len(result) == 3
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_dataset.py -v`
Expected: FAIL — cannot import.

- [ ] **Step 4: Write the dataset loader**

Write `packages/pipeline/src/pipeline/eval/dataset.py`:

```python
"""Golden dataset loader, validator, and filtering."""

import json
from pathlib import Path

import jsonschema

from pipeline.config import GOLDEN_DATASET_PATH, GOLDEN_DATASET_SCHEMA


def load_dataset(path: Path | None = None) -> list[dict]:
    """Load the golden dataset from JSON."""
    path = path or GOLDEN_DATASET_PATH
    return json.loads(path.read_text())


def validate_dataset(path: Path | None = None) -> list[str]:
    """Validate the golden dataset against the JSON schema. Returns list of error messages."""
    path = path or GOLDEN_DATASET_PATH
    schema_path = GOLDEN_DATASET_SCHEMA

    data = json.loads(path.read_text())
    schema = json.loads(schema_path.read_text())

    errors: list[str] = []
    validator = jsonschema.Draft7Validator(schema)
    for error in validator.iter_errors(data):
        errors.append(f"{error.json_path}: {error.message}")

    return errors


def filter_dataset(
    entries: list[dict],
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    category: str | None = None,
) -> list[dict]:
    """Filter dataset entries by criteria."""
    result = entries

    if difficulty:
        result = [e for e in result if e["difficulty"] == difficulty]
    if reasoning_type:
        result = [e for e in result if e["reasoning_type"] == reasoning_type]
    if question_id:
        result = [e for e in result if e["id"] == question_id]
    if category:
        result = [e for e in result if e.get("reasoning_type") == category]

    return result
```

- [ ] **Step 5: Install jsonschema**

Run: `cd packages/pipeline && .venv/bin/pip install jsonschema`

Also add to `pyproject.toml` dependencies: `"jsonschema>=4.0",`

- [ ] **Step 6: Run tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_dataset.py -v`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/dataset.py packages/pipeline/tests/test_dataset.py packages/pipeline/data/golden/dataset.schema.json packages/pipeline/pyproject.toml
git commit -m "feat(eval): add golden dataset schema, loader, and validator"
```

---

### Task 3: Seed Golden Dataset

**Files:**
- Create: `packages/pipeline/data/golden/dataset.json`
- Create: `packages/pipeline/data/golden/CHANGELOG.md`

- [ ] **Step 1: Query the graph for real section IDs to use in seed entries**

Run a script to find actual section IDs for known clinical policies:

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.graph.connection import get_session
with get_session() as s:
    for policy in ['3K-2', '5B', '3L', '8C', '10A']:
        result = s.run('''
            MATCH (d:Document {policy_number: \$pn})-[:HAS_SECTION]->(sec:Section)
            WHERE sec.section_number IS NOT NULL
            RETURN d.id, sec.id, sec.section_number, sec.title
            ORDER BY sec.section_number LIMIT 8
        ''', {'pn': policy})
        print(f'\n{policy}:')
        for r in result:
            print(f'  {r[\"sec.section_number\"]} — {r[\"sec.title\"]} [{r[\"sec.id\"]}]')
"
```

Use the real IDs from the output to populate the seed entries.

- [ ] **Step 2: Create the seed dataset**

Write `packages/pipeline/data/golden/dataset.json` with 5-10 entries. Use real document/section IDs from Step 1. Cover at least: 1 simple, 2 moderate, 1 complex, 1 negative. Include at least one cross-reference entry.

The entries should be realistic Medicaid policy questions based on the documents in the graph. Example topics:
- CAP/DA eligibility (3K-2)
- DME coverage (5B)
- Personal care services (3L)
- Behavioral health services (8C)
- Outpatient therapy (10A)

Each entry needs real section IDs that exist in the graph.

- [ ] **Step 3: Validate the dataset**

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.eval.dataset import validate_dataset
errors = validate_dataset()
if errors:
    for e in errors:
        print(f'  ERROR: {e}')
else:
    print('Dataset valid')
"
```

Expected: `Dataset valid`

- [ ] **Step 4: Create CHANGELOG**

Write `packages/pipeline/data/golden/CHANGELOG.md`:

```markdown
# Golden Dataset Changelog

## v1.0 — 2026-03-27

- Initial seed with 5-10 synthetic entries based on clinical policies in the graph
- Covers: simple lookup, moderate multi-hop, complex cross-document, negative cases
- These are synthetic entries for framework validation; Jeff will replace/expand with real entries
```

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/data/golden/
git commit -m "feat(eval): seed golden dataset with initial entries"
```

---

### Task 4: Metrics Module (TDD)

**Files:**
- Create: `packages/pipeline/src/pipeline/eval/metrics.py`
- Create: `packages/pipeline/tests/test_metrics.py`

- [ ] **Step 1: Write the metrics test**

Write `packages/pipeline/tests/test_metrics.py`:

```python
"""Test metric computation."""

import pytest
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr, primary_hit_rate, compare_runs


class TestPrecisionAtK:
    def test_perfect(self):
        assert precision_at_k(["a", "b", "c"], {"a", "b", "c"}) == 1.0

    def test_half(self):
        assert precision_at_k(["a", "b", "c", "d"], {"a", "c"}) == 0.5

    def test_none(self):
        assert precision_at_k(["a", "b"], {"x", "y"}) == 0.0

    def test_empty_retrieved(self):
        assert precision_at_k([], {"a"}) == 0.0


class TestRecallAtK:
    def test_perfect(self):
        assert recall_at_k(["a", "b", "c"], {"a", "b", "c"}) == 1.0

    def test_partial(self):
        assert recall_at_k(["a", "b"], {"a", "b", "c"}) == pytest.approx(2/3)

    def test_none(self):
        assert recall_at_k(["x", "y"], {"a", "b"}) == 0.0

    def test_empty_expected(self):
        assert recall_at_k(["a", "b"], set()) == 0.0


class TestMRR:
    def test_first_position(self):
        assert mrr(["a", "b", "c"], {"a"}) == 1.0

    def test_second_position(self):
        assert mrr(["x", "a", "b"], {"a"}) == 0.5

    def test_not_found(self):
        assert mrr(["x", "y", "z"], {"a"}) == 0.0


class TestPrimaryHitRate:
    def test_all_hit(self):
        results = [
            {"retrieved": ["a", "b"], "primary": {"a"}},
            {"retrieved": ["c", "d"], "primary": {"c"}},
        ]
        assert primary_hit_rate(results) == 1.0

    def test_half_hit(self):
        results = [
            {"retrieved": ["a", "b"], "primary": {"a"}},
            {"retrieved": ["x", "y"], "primary": {"c"}},
        ]
        assert primary_hit_rate(results) == 0.5


class TestCompareRuns:
    def test_detects_regression(self):
        run_a = {"aggregate": {"precision_at_k": 0.80, "recall_at_k": 0.90}}
        run_b = {"aggregate": {"precision_at_k": 0.70, "recall_at_k": 0.88}}
        diff = compare_runs(run_a, run_b, threshold=0.05)
        assert any(d["metric"] == "precision_at_k" and d["regression"] for d in diff)

    def test_ignores_small_change(self):
        run_a = {"aggregate": {"precision_at_k": 0.80}}
        run_b = {"aggregate": {"precision_at_k": 0.78}}
        diff = compare_runs(run_a, run_b, threshold=0.05)
        assert not any(d.get("regression") for d in diff)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_metrics.py -v`

- [ ] **Step 3: Write the metrics module**

Write `packages/pipeline/src/pipeline/eval/metrics.py`:

```python
"""Metric computation for eval levels."""


def precision_at_k(retrieved: list[str], relevant: set[str]) -> float:
    """Precision: fraction of retrieved items that are relevant."""
    if not retrieved:
        return 0.0
    hits = sum(1 for r in retrieved if r in relevant)
    return hits / len(retrieved)


def recall_at_k(retrieved: list[str], relevant: set[str]) -> float:
    """Recall: fraction of relevant items that appear in retrieved."""
    if not relevant:
        return 0.0
    hits = sum(1 for r in retrieved if r in relevant)
    return hits / len(relevant)


def mrr(retrieved: list[str], relevant: set[str]) -> float:
    """Mean Reciprocal Rank: 1/rank of first relevant result."""
    for i, r in enumerate(retrieved):
        if r in relevant:
            return 1.0 / (i + 1)
    return 0.0


def primary_hit_rate(results: list[dict]) -> float:
    """Fraction of questions where at least one primary section was retrieved."""
    if not results:
        return 0.0
    hits = sum(
        1 for r in results
        if any(p in r["retrieved"] for p in r["primary"])
    )
    return hits / len(results)


def compare_runs(
    run_a: dict,
    run_b: dict,
    threshold: float = 0.05,
) -> list[dict]:
    """Compare two eval runs and flag regressions."""
    diffs: list[dict] = []
    agg_a = run_a.get("aggregate", {})
    agg_b = run_b.get("aggregate", {})

    all_metrics = set(agg_a.keys()) | set(agg_b.keys())
    for metric in sorted(all_metrics):
        val_a = agg_a.get(metric, 0.0)
        val_b = agg_b.get(metric, 0.0)
        delta = val_b - val_a
        diffs.append({
            "metric": metric,
            "before": val_a,
            "after": val_b,
            "delta": delta,
            "regression": delta < -threshold,
        })

    return diffs
```

- [ ] **Step 4: Run tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_metrics.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/metrics.py packages/pipeline/tests/test_metrics.py
git commit -m "feat(eval): add precision, recall, MRR, and regression comparison"
```

---

### Task 5: Retrieval Eval (Level 1)

**Files:**
- Create: `packages/pipeline/src/pipeline/eval/levels/retrieval.py`

- [ ] **Step 1: Write the retrieval eval**

Write `packages/pipeline/src/pipeline/eval/levels/retrieval.py`:

```python
"""Level 1: Retrieval evaluation — does vector search return the right sections?"""

import voyageai

from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL, EVAL_DEFAULT_TOP_K
from pipeline.embeddings.indexer import vector_search
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr


def evaluate_retrieval(entries: list[dict], top_k: int | None = None) -> list[dict]:
    """
    Run retrieval eval for each golden dataset entry.

    Returns per-question results with metrics.
    """
    top_k = top_k or EVAL_DEFAULT_TOP_K

    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")

    client = voyageai.Client(api_key=VOYAGE_API_KEY)
    results: list[dict] = []

    for entry in entries:
        # Embed the question
        embed_result = client.embed(
            [entry["question"]], model=EMBEDDING_MODEL, input_type="query"
        )
        query_embedding = embed_result.embeddings[0]

        # Run vector search
        search_results = vector_search(query_embedding, top_k=top_k)
        retrieved_ids = [r["section_number"] for r in search_results]

        # Build expected sets from evidence
        primary = {
            s["section_id"]
            for s in entry["evidence"]["primary_sections"]
        }
        supporting = {
            s["section_id"]
            for s in entry["evidence"].get("supporting_sections", [])
        }
        all_relevant = primary | supporting

        # Also match by section_number since IDs may differ slightly
        primary_numbers = {
            s.get("section_number")
            for s in entry["evidence"]["primary_sections"]
            if s.get("section_number")
        }
        supporting_numbers = {
            s.get("section_number")
            for s in entry["evidence"].get("supporting_sections", [])
            if s.get("section_number")
        }

        # Build retrieved set — match by both full section ID and section number
        retrieved_section_ids = []
        for r in search_results:
            # Try to get full section ID from the result
            sid = f"sec:{r.get('doc_id', '')}:{r.get('section_number', '')}" if r.get('doc_id') else ""
            retrieved_section_ids.append(sid)

        # Use section numbers for matching (more robust than full IDs)
        all_relevant_numbers = primary_numbers | supporting_numbers
        retrieved_numbers = [r.get("section_number", "") for r in search_results]

        # Compute metrics using section numbers
        p = precision_at_k(retrieved_numbers, all_relevant_numbers)
        r_val = recall_at_k(retrieved_numbers, all_relevant_numbers)
        m = mrr(retrieved_numbers, primary_numbers)
        primary_hit = any(rn in primary_numbers for rn in retrieved_numbers)

        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "precision": p,
            "recall": r_val,
            "mrr": m,
            "primary_hit": primary_hit,
            "retrieved": retrieved_numbers[:top_k],
            "expected_primary": list(primary_numbers),
            "expected_supporting": list(supporting_numbers),
        })

    return results
```

- [ ] **Step 2: Verify import**

Run: `cd packages/pipeline && .venv/bin/python -c "from pipeline.eval.levels.retrieval import evaluate_retrieval; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/levels/retrieval.py
git commit -m "feat(eval): add Level 1 retrieval evaluation"
```

---

### Task 6: Result Storage & Comparison

**Files:**
- Create: `packages/pipeline/src/pipeline/eval/results.py`

- [ ] **Step 1: Write the results module**

Write `packages/pipeline/src/pipeline/eval/results.py`:

```python
"""Eval result storage, loading, and comparison."""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config import EVAL_RESULTS_DIR, EMBEDDING_MODEL, EVAL_DEFAULT_TOP_K, EVAL_REGRESSION_THRESHOLD
from pipeline.eval.metrics import precision_at_k, recall_at_k, mrr, primary_hit_rate, compare_runs


def save_result(level: str, per_question: list[dict], config_overrides: dict | None = None) -> Path:
    """Save eval results to a timestamped JSON file. Returns the file path."""
    EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    run_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    # Compute aggregates
    aggregate = {}
    if per_question:
        aggregate["precision_at_k"] = sum(q["precision"] for q in per_question) / len(per_question)
        aggregate["recall_at_k"] = sum(q["recall"] for q in per_question) / len(per_question)
        aggregate["mrr"] = sum(q["mrr"] for q in per_question) / len(per_question)
        aggregate["primary_hit_rate"] = sum(1 for q in per_question if q.get("primary_hit")) / len(per_question)

    # Compute by_difficulty
    by_difficulty: dict[str, dict] = {}
    for diff in ["simple", "moderate", "complex"]:
        subset = [q for q in per_question if q.get("difficulty") == diff]
        if subset:
            by_difficulty[diff] = {
                "precision_at_k": sum(q["precision"] for q in subset) / len(subset),
                "recall_at_k": sum(q["recall"] for q in subset) / len(subset),
                "mrr": sum(q["mrr"] for q in subset) / len(subset),
                "primary_hit_rate": sum(1 for q in subset if q.get("primary_hit")) / len(subset),
                "count": len(subset),
            }

    # Compute by_category (reasoning_type)
    by_category: dict[str, dict] = {}
    categories = set(q.get("reasoning_type", "") for q in per_question)
    for cat in categories:
        if not cat:
            continue
        subset = [q for q in per_question if q.get("reasoning_type") == cat]
        if subset:
            by_category[cat] = {
                "precision_at_k": sum(q["precision"] for q in subset) / len(subset),
                "recall_at_k": sum(q["recall"] for q in subset) / len(subset),
                "mrr": sum(q["mrr"] for q in subset) / len(subset),
                "primary_hit_rate": sum(1 for q in subset if q.get("primary_hit")) / len(subset),
                "count": len(subset),
            }

    # Get git SHA
    try:
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        git_sha = "unknown"

    result = {
        "run_id": run_id,
        "level": level,
        "config": {
            "embedding_model": EMBEDDING_MODEL,
            "top_k": EVAL_DEFAULT_TOP_K,
            "dataset_count": len(per_question),
            "git_sha": git_sha,
            **(config_overrides or {}),
        },
        "aggregate": aggregate,
        "by_difficulty": by_difficulty,
        "by_category": by_category,
        "per_question": per_question,
    }

    filename = f"{run_id}_{level}.json"
    path = EVAL_RESULTS_DIR / filename
    path.write_text(json.dumps(result, indent=2, default=str))

    return path


def load_result(path: Path) -> dict:
    """Load a saved eval result."""
    return json.loads(path.read_text())


def list_results(level: str | None = None, last: int | None = None) -> list[Path]:
    """List saved eval result files, newest first."""
    if not EVAL_RESULTS_DIR.exists():
        return []

    files = sorted(EVAL_RESULTS_DIR.glob("*.json"), reverse=True)
    if level:
        files = [f for f in files if f.stem.endswith(f"_{level}")]
    if last:
        files = files[:last]
    return files
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/results.py
git commit -m "feat(eval): add result storage, loading, and comparison"
```

---

### Task 7: Report Formatting

**Files:**
- Create: `packages/pipeline/src/pipeline/eval/reports.py`

- [ ] **Step 1: Write the reports module**

Write `packages/pipeline/src/pipeline/eval/reports.py`:

```python
"""Human-readable report generation for eval results."""

from rich.console import Console
from rich.table import Table

console = Console()


def print_retrieval_report(result: dict):
    """Print a formatted retrieval eval report to the terminal."""
    config = result["config"]
    agg = result["aggregate"]
    by_diff = result.get("by_difficulty", {})
    by_cat = result.get("by_category", {})
    per_q = result.get("per_question", [])

    console.print(f"\n[bold]{'=' * 50}[/bold]")
    console.print(f"  [bold]Retrieval Evaluation — {result['run_id']}[/bold]")
    console.print(f"  Dataset: {config['dataset_count']} questions")
    console.print(f"  Model: {config['embedding_model']} | Top-k: {config['top_k']}")
    console.print(f"[bold]{'=' * 50}[/bold]")

    # Aggregate
    console.print("\n  [bold]Aggregate[/bold]")
    console.print(f"  {'─' * 45}")
    for metric, val in agg.items():
        if "rate" in metric:
            console.print(f"  {metric:<20s} {val:.1%}")
        else:
            console.print(f"  {metric:<20s} {val:.2f}")

    # By difficulty
    if by_diff:
        console.print(f"\n  [bold]By Difficulty[/bold]")
        console.print(f"  {'─' * 45}")
        table = Table(show_header=True, header_style="bold", box=None, padding=(0, 2))
        table.add_column("")
        table.add_column("P@k", justify="right")
        table.add_column("R@k", justify="right")
        table.add_column("MRR", justify="right")
        table.add_column("Hit%", justify="right")
        table.add_column("n", justify="right")
        for diff in ["simple", "moderate", "complex"]:
            if diff in by_diff:
                d = by_diff[diff]
                table.add_row(
                    diff,
                    f"{d['precision_at_k']:.2f}",
                    f"{d['recall_at_k']:.2f}",
                    f"{d['mrr']:.2f}",
                    f"{d['primary_hit_rate']:.0%}",
                    str(d.get("count", "")),
                )
        console.print(table)

    # Failures
    failures = [q for q in per_q if not q.get("primary_hit")]
    if failures:
        console.print(f"\n  [bold red]Failures (primary section not in top-k)[/bold red]")
        console.print(f"  {'─' * 45}")
        for f in failures:
            console.print(f"  {f['id']}  [{f['difficulty']}/{f['reasoning_type']}]")

    console.print()


def print_comparison_report(diffs: list[dict]):
    """Print a regression comparison report."""
    console.print("\n[bold]Run Comparison[/bold]")
    console.print(f"{'─' * 50}")

    for d in diffs:
        arrow = "↑" if d["delta"] > 0 else "↓" if d["delta"] < 0 else "="
        color = "red" if d.get("regression") else "green" if d["delta"] > 0 else ""
        style = f"[{color}]" if color else ""
        end_style = f"[/{color}]" if color else ""
        flag = " ⚠ REGRESSION" if d.get("regression") else ""

        console.print(
            f"  {d['metric']:<20s} {d['before']:.3f} → {d['after']:.3f} "
            f"{style}({arrow}{abs(d['delta']):.3f}){end_style}{flag}"
        )
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/reports.py
git commit -m "feat(eval): add terminal report formatting for eval results"
```

---

### Task 8: Runner & Cross-Reference Eval

**Files:**
- Create: `packages/pipeline/src/pipeline/eval/runner.py`
- Create: `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`

- [ ] **Step 1: Write the runner**

Write `packages/pipeline/src/pipeline/eval/runner.py`:

```python
"""Eval orchestrator — selects level, iterates questions, collects results."""

from pipeline.eval.dataset import load_dataset, filter_dataset
from pipeline.eval.results import save_result


def run_eval(
    level: str,
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    top_k: int | None = None,
) -> dict:
    """Run an evaluation at the specified level. Returns the result dict."""
    entries = load_dataset()
    entries = filter_dataset(
        entries,
        difficulty=difficulty,
        reasoning_type=reasoning_type,
        question_id=question_id,
    )

    if not entries:
        return {"error": "No matching entries found"}

    if level == "retrieval":
        from pipeline.eval.levels.retrieval import evaluate_retrieval
        per_question = evaluate_retrieval(entries, top_k=top_k)
    elif level == "cross-ref":
        from pipeline.eval.levels.cross_ref import evaluate_cross_refs
        per_question = evaluate_cross_refs(entries)
    else:
        return {"error": f"Unknown level: {level}. Available: retrieval, cross-ref"}

    # Save results
    config_overrides = {}
    if top_k:
        config_overrides["top_k"] = top_k

    path = save_result(level, per_question, config_overrides)

    # Load back to get the full result with aggregates
    from pipeline.eval.results import load_result
    return load_result(path)
```

- [ ] **Step 2: Write the cross-reference eval**

Write `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`:

```python
"""Level 2: Cross-reference resolution evaluation."""

from pipeline.graph.connection import get_session
from pipeline.references.extractor import extract_references
from pipeline.references.resolver import resolve_reference


def evaluate_cross_refs(entries: list[dict]) -> list[dict]:
    """
    Evaluate cross-reference resolution for golden dataset entries.

    For each entry with cross_references in the evidence, checks whether
    the resolver correctly finds the target section.
    """
    results: list[dict] = []

    for entry in entries:
        cross_refs = entry["evidence"].get("cross_references", [])
        if not cross_refs:
            continue

        resolved_count = 0
        missed_count = 0
        false_count = 0
        extraction_miss_count = 0

        for xref in cross_refs:
            from_section = xref["from_section"]
            to_section = xref["to_section"]

            # Get the from_section's content
            with get_session() as session:
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.content_text, s.document_id",
                    {"sid": from_section},
                )
                record = result.single()

            if not record:
                extraction_miss_count += 1
                continue

            content = record["s.content_text"] or ""
            doc_id = record["s.document_id"]

            # Extract references from the section text
            refs = extract_references(content)

            # Try to resolve each extracted reference
            found_target = False
            for ref in refs:
                resolution = resolve_reference(ref, from_section, doc_id)
                if resolution["resolved"]:
                    if resolution["target_node_id"] == to_section:
                        found_target = True
                        break

            if found_target:
                resolved_count += 1
            else:
                # Check if any reference was even extracted that could point to the target
                if not refs:
                    extraction_miss_count += 1
                else:
                    missed_count += 1

        total = len(cross_refs)
        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "total_refs": total,
            "resolved": resolved_count,
            "missed": missed_count,
            "false_resolutions": false_count,
            "extraction_misses": extraction_miss_count,
            "precision": resolved_count / total if total > 0 else 0.0,
            "recall": resolved_count / total if total > 0 else 0.0,
            "mrr": 0.0,  # Not applicable for cross-ref eval
            "primary_hit": resolved_count > 0,
        })

    return results
```

- [ ] **Step 3: Write stubs for Level 3 and Level 4**

Write `packages/pipeline/src/pipeline/eval/levels/answer.py`:

```python
"""Level 3: End-to-end answer quality evaluation (stub — requires Layer 3 agent)."""


def evaluate_answers(entries: list[dict]) -> list[dict]:
    """Stub: will evaluate agent answers against golden dataset when Layer 3 is built."""
    raise NotImplementedError("Level 3 (answer quality) requires the agent from Layer 3")
```

Write `packages/pipeline/src/pipeline/eval/levels/citation.py`:

```python
"""Level 4: Citation accuracy evaluation (stub — requires Layer 3 agent)."""


def evaluate_citations(entries: list[dict]) -> list[dict]:
    """Stub: will evaluate citation accuracy when Layer 3 is built."""
    raise NotImplementedError("Level 4 (citation accuracy) requires the agent from Layer 3")
```

Write `packages/pipeline/src/pipeline/eval/judge.py`:

```python
"""LLM-as-judge wrapper (stub — requires Layer 3 agent)."""


def judge_answer(question: str, golden_answer: str, agent_answer: str, evidence_texts: list[str]) -> dict:
    """Stub: will use Claude to judge answer quality when Layer 3 is built."""
    raise NotImplementedError("LLM-as-judge requires the agent from Layer 3")
```

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/runner.py packages/pipeline/src/pipeline/eval/levels/ packages/pipeline/src/pipeline/eval/judge.py
git commit -m "feat(eval): add runner, cross-ref eval, and Level 3/4 stubs"
```

---

### Task 9: CLI Integration

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add eval commands to cli.py**

Add these commands to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command()
@click.option("--level", type=click.Choice(["retrieval", "cross-ref"]), help="Eval level to run")
@click.option("--top-k", type=int, help="Top-k for retrieval eval")
@click.option("--category", type=str, help="Filter by reasoning_type")
@click.option("--difficulty", type=str, help="Filter by difficulty")
@click.option("--question", type=str, help="Run single question by ID")
def eval(level: str | None, top_k: int | None, category: str | None, difficulty: str | None, question: str | None):
    """Run evaluation against the golden dataset."""
    from pipeline.eval.runner import run_eval
    from pipeline.eval.reports import print_retrieval_report

    levels = [level] if level else ["retrieval"]

    for lvl in levels:
        console.print(f"\n[bold]Running {lvl} evaluation...[/bold]")
        result = run_eval(
            level=lvl,
            difficulty=difficulty,
            reasoning_type=category,
            question_id=question,
            top_k=top_k,
        )
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
            continue

        if lvl == "retrieval":
            print_retrieval_report(result)
        else:
            console.print(f"  Results saved: {result.get('run_id', 'unknown')}")


@cli.command("eval-compare")
@click.argument("run_a")
@click.argument("run_b")
def eval_compare(run_a: str, run_b: str):
    """Compare two eval runs for regression detection."""
    from pipeline.eval.results import load_result, list_results
    from pipeline.eval.metrics import compare_runs
    from pipeline.eval.reports import print_comparison_report
    from pipeline.config import EVAL_RESULTS_DIR, EVAL_REGRESSION_THRESHOLD

    # Find result files matching the run IDs
    all_files = list_results()
    file_a = next((f for f in all_files if run_a in f.name), None)
    file_b = next((f for f in all_files if run_b in f.name), None)

    if not file_a or not file_b:
        console.print("[red]Could not find both result files[/red]")
        return

    result_a = load_result(file_a)
    result_b = load_result(file_b)
    diffs = compare_runs(result_a, result_b, threshold=EVAL_REGRESSION_THRESHOLD)
    print_comparison_report(diffs)


@cli.command("eval-runs")
@click.option("--level", type=str, help="Filter by level")
@click.option("--last", type=int, default=10, help="Show last N runs")
def eval_runs(level: str | None, last: int):
    """List past eval runs."""
    from pipeline.eval.results import list_results, load_result

    files = list_results(level=level, last=last)
    if not files:
        console.print("No eval runs found.")
        return

    for f in files:
        result = load_result(f)
        agg = result.get("aggregate", {})
        p = agg.get("precision_at_k", 0)
        r = agg.get("recall_at_k", 0)
        hit = agg.get("primary_hit_rate", 0)
        n = result.get("config", {}).get("dataset_count", 0)
        console.print(
            f"  {result['run_id']}  [{result['level']}]  "
            f"P@k={p:.2f}  R@k={r:.2f}  Hit={hit:.0%}  (n={n})"
        )


@cli.command("eval-validate")
def eval_validate():
    """Validate the golden dataset against the graph."""
    from pipeline.eval.dataset import validate_dataset, load_dataset
    from pipeline.graph.connection import get_session

    # Schema validation
    errors = validate_dataset()
    if errors:
        console.print("[red]Schema validation errors:[/red]")
        for e in errors:
            console.print(f"  {e}")
        return

    console.print("[green]Schema validation: PASS[/green]")

    # Reference integrity
    entries = load_dataset()
    missing = []
    with get_session() as session:
        for entry in entries:
            for sec in entry["evidence"]["primary_sections"]:
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.id",
                    {"sid": sec["section_id"]},
                )
                if not result.single():
                    missing.append(f"{entry['id']}: section {sec['section_id']} not found")

            for sec in entry["evidence"].get("supporting_sections", []):
                result = session.run(
                    "MATCH (s:Section {id: $sid}) RETURN s.id",
                    {"sid": sec["section_id"]},
                )
                if not result.single():
                    missing.append(f"{entry['id']}: section {sec['section_id']} not found")

    if missing:
        console.print(f"[red]Reference integrity errors ({len(missing)}):[/red]")
        for m in missing:
            console.print(f"  {m}")
    else:
        console.print("[green]Reference integrity: PASS[/green]")

    # Completeness
    difficulties = set(e["difficulty"] for e in entries)
    categories = set(e["reasoning_type"] for e in entries)
    console.print(f"\nDataset: {len(entries)} entries")
    console.print(f"Difficulties: {', '.join(sorted(difficulties))}")
    console.print(f"Categories: {', '.join(sorted(categories))}")
```

- [ ] **Step 2: Verify CLI**

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli --help`
Expected: Shows `eval`, `eval-compare`, `eval-runs`, `eval-validate` commands.

- [ ] **Step 3: Run all tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(eval): add eval, eval-compare, eval-runs, eval-validate CLI commands"
```

---

### Task 10: End-to-End Validation

- [ ] **Step 1: Validate the golden dataset**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli eval-validate
```

Expected: Schema validation PASS. Reference integrity may have some misses if seed entries reference sections that don't exist — fix those in the dataset.

- [ ] **Step 2: Run a retrieval eval**

```bash
cd packages/pipeline && VOYAGE_API_KEY="$VOYAGE_API_KEY" .venv/bin/python -m pipeline.cli eval --level retrieval
```

Expected: Prints the formatted report with precision, recall, MRR, primary hit rate.

- [ ] **Step 3: Run a second eval (to test comparison)**

```bash
cd packages/pipeline && VOYAGE_API_KEY="$VOYAGE_API_KEY" .venv/bin/python -m pipeline.cli eval --level retrieval --top-k 20
```

- [ ] **Step 4: Compare runs**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli eval-runs
```

Note the two run IDs, then:

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli eval-compare <run_a> <run_b>
```

Expected: Shows metric deltas between the two runs.

- [ ] **Step 5: Run all tests**

```bash
cd packages/pipeline && .venv/bin/python -m pytest tests/ -v
```

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/
git commit -m "feat(eval): complete eval harness with golden dataset and baseline metrics"
```
