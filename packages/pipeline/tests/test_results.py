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
