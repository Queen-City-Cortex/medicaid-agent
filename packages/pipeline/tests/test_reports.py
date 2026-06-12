"""print_answer_report must tolerate error rows (None scores) — a single
judge or agent error previously crashed the report for the whole run."""

from pipeline.eval.reports import print_answer_report


def _error_row(question_id: str, error_type: str) -> dict:
    return {
        "id": question_id,
        "difficulty": "simple",
        "reasoning_type": "single_lookup",
        "agent_answer": "",
        "agent_error": "Agent timed out" if error_type == "agent" else None,
        "scores": {
            "factual_accuracy": None,
            "completeness": None,
            "hallucination": None,
            "citation_quality": None,
            "overall": None,
            "explanation": "boom",
            "error_type": error_type,
        },
    }


def _scored_row(question_id: str, overall: int) -> dict:
    return {
        "id": question_id,
        "difficulty": "simple",
        "reasoning_type": "single_lookup",
        "agent_answer": "Covered under [Policy 8C § 3.2.1](https://example.com).",
        "agent_error": None,
        "scores": {
            "factual_accuracy": overall,
            "completeness": overall,
            "hallucination": overall,
            "citation_quality": overall,
            "overall": overall,
            "explanation": "fine",
        },
    }


def test_report_survives_judge_and_agent_error_rows(capsys):
    result = {
        "run_id": "2026-06-11T00:00:00",
        "level": "answer",
        "config": {"dataset_count": 4, "judge_model": "test"},
        "aggregate": {"overall": 2.0},
        "by_difficulty": {},
        "by_category": {},
        "per_question": [
            _scored_row("q-1", 3),
            _scored_row("q-2", 1),
            _error_row("q-judge", "judge"),
            _error_row("q-agent", "agent"),
        ],
    }

    # Must not raise.
    print_answer_report(result)

    out = capsys.readouterr().out
    assert "q-judge" in out
    assert "q-agent" in out
    # The genuine failure still shows up; error rows are not listed as misses.
    assert "Failures" in out
    assert "q-2" in out
