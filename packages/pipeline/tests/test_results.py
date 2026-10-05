import json

from pipeline.eval import results


def test_save_result_ignores_unscorable_rows_in_rollups(tmp_path, monkeypatch):
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    path = results.save_result(
        "answer",
        [
            {
                "id": "q-error",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": None,
                "recall": None,
                "mrr": None,
                "primary_hit": None,
            },
            {
                "id": "q-ok",
                "difficulty": "moderate",
                "reasoning_type": "single_lookup",
                "precision": 1.0,
                "recall": 1.0,
                "mrr": 1.0,
                "primary_hit": True,
            },
        ],
    )

    payload = json.loads(path.read_text())

    assert payload["aggregate"]["judge_errors"] == 1
    assert payload["aggregate"]["scorable_count"] == 1
    assert "simple" not in payload["by_difficulty"]
    assert payload["by_difficulty"]["moderate"]["precision_at_k"] == 1.0
    assert payload["by_category"]["single_lookup"]["count"] == 2
    assert payload["by_category"]["single_lookup"]["judge_errors"] == 1
    assert payload["by_category"]["single_lookup"]["scorable_count"] == 1


def test_save_result_persists_answer_aggregates(tmp_path, monkeypatch):
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    path = results.save_result(
        "answer",
        [
            {
                "id": "q-1",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": 1.0,
                "recall": 1.0,
                "mrr": 1.0,
                "primary_hit": True,
                "scores": {
                    "factual_accuracy": 3,
                    "completeness": 2,
                    "hallucination": 3,
                    "citation_quality": 2,
                    "overall": 2,
                },
            },
            {
                "id": "q-2",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": 2 / 3,
                "recall": 2 / 3,
                "mrr": 2 / 3,
                "primary_hit": True,
                "scores": {
                    "factual_accuracy": 2,
                    "completeness": 3,
                    "hallucination": 3,
                    "citation_quality": 3,
                    "overall": 3,
                },
            },
        ],
    )

    payload = json.loads(path.read_text())

    assert payload["aggregate"]["overall"] == 2.5
    assert payload["aggregate"]["factual_accuracy"] == 2.5
    assert payload["aggregate"]["completeness"] == 2.5
    assert payload["by_difficulty"]["simple"]["overall"] == 2.5
    assert payload["by_category"]["single_lookup"]["citation_quality"] == 2.5


def test_zero_citation_rows_count_against_recall_and_hit_rate(tmp_path, monkeypatch):
    """An answer with no citations (precision=None, recall=0.0) must count as a
    zero-recall row, not be silently dropped — dropping it inflated recall and
    primary_hit_rate."""
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    path = results.save_result(
        "citation",
        [
            {
                "id": "q-cited",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": 1.0,
                "recall": 1.0,
                "mrr": 1.0,
                "primary_hit": True,
            },
            {
                "id": "q-no-citations",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": None,
                "recall": 0.0,
                "mrr": None,
                "primary_hit": False,
            },
        ],
    )

    payload = json.loads(path.read_text())
    agg = payload["aggregate"]

    assert agg["recall_at_k"] == 0.5          # (1.0 + 0.0) / 2 — not 1.0
    assert agg["primary_hit_rate"] == 0.5     # 1 of 2 — not 1 of 1
    assert agg["precision_at_k"] == 1.0       # only the row that has precision
    assert "judge_errors" not in agg          # both rows were scorable


def test_partial_metric_rows_do_not_crash_rollup(tmp_path, monkeypatch):
    """Rows with precision set but recall/mrr None previously crashed
    save_result with a TypeError, losing the whole run."""
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    path = results.save_result(
        "retrieval",
        [
            {
                "id": "q-partial",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "precision": 0.5,
                "recall": None,
                "mrr": None,
                "primary_hit": False,
            },
        ],
    )

    payload = json.loads(path.read_text())
    assert payload["aggregate"]["precision_at_k"] == 0.5
    assert "recall_at_k" not in payload["aggregate"]


def test_agent_error_rows_are_counted_not_scored(tmp_path, monkeypatch):
    """Agent infra failures carry None scores + error_type and must surface as
    an availability counter, not pollute the quality means as zeros."""
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    path = results.save_result(
        "answer",
        [
            {
                "id": "q-ok",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "scores": {
                    "factual_accuracy": 3,
                    "completeness": 3,
                    "hallucination": 3,
                    "citation_quality": 3,
                    "overall": 3,
                },
            },
            {
                "id": "q-timeout",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "agent_error": "Agent timed out after 600s",
                "scores": {
                    "factual_accuracy": None,
                    "completeness": None,
                    "hallucination": None,
                    "citation_quality": None,
                    "overall": None,
                    "explanation": "Agent timed out after 600s",
                    "error_type": "agent",
                },
            },
            {
                "id": "q-judge-blowup",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "scores": {
                    "factual_accuracy": None,
                    "completeness": None,
                    "hallucination": None,
                    "citation_quality": None,
                    "overall": None,
                    "explanation": "Judge error: boom",
                    "error_type": "judge",
                },
            },
        ],
    )

    payload = json.loads(path.read_text())
    agg = payload["aggregate"]

    assert agg["overall"] == 3.0          # error rows excluded, not zeroed
    assert agg["hallucination"] == 3.0
    assert agg["agent_errors"] == 1
    assert agg["judge_errors"] == 1
    # Answer-level runs have no retrieval rows; the retrieval counter must not
    # stamp scorable_count=0 onto the aggregate anymore.
    assert "scorable_count" not in agg


def test_withheld_rows_count_against_overall_but_not_hallucination(tmp_path, monkeypatch):
    """A withheld row scores overall 0 with no hallucination score: the
    hallucination mean covers released answers only, and the released-only
    means and withheld count are reported beside the all-row means."""
    monkeypatch.setattr(results, "EVAL_RESULTS_DIR", tmp_path)
    monkeypatch.setattr(results.subprocess, "check_output", lambda *args, **kwargs: "abc123\n")

    def released(question_id, hallucination):
        return {
            "id": question_id,
            "difficulty": "simple",
            "reasoning_type": "single_lookup",
            "scores": {
                "factual_accuracy": 3,
                "completeness": 3,
                "hallucination": hallucination,
                "citation_quality": 3,
                "overall": 3,
            },
        }

    path = results.save_result(
        "answer",
        [
            released("q-a", 3),
            released("q-b", 2),
            {
                "id": "q-withheld",
                "difficulty": "simple",
                "reasoning_type": "single_lookup",
                "scores": {
                    "factual_accuracy": 0,
                    "completeness": 0,
                    "hallucination": None,
                    "citation_quality": 0,
                    "overall": 0,
                    "explanation": "Answer withheld by the verifier (unsupported); not judged",
                    "outcome": "withheld",
                },
            },
        ],
    )

    agg = json.loads(path.read_text())["aggregate"]

    assert agg["overall"] == 2.0            # all rows: withholding costs the answer score
    assert agg["overall_released"] == 3.0
    assert agg["hallucination"] == 2.5      # released rows only; a withhold is not a 3
    assert "hallucination_released" not in agg
    assert agg["withheld_count"] == 1
    assert "agent_errors" not in agg
