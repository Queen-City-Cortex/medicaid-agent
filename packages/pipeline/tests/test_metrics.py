"""Test metric computation."""

import pytest
from pipeline.eval.metrics import (
    precision_at_k,
    recall_at_k,
    mrr,
    primary_hit_rate,
    compare_runs,
    summarize_answer_stability,
)


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


class TestSummarizeAnswerStability:
    def test_flags_stable_misses_and_variance(self):
        runs = [
            {
                "run_id": "2026-04-11T05:55:38",
                "level": "answer",
                "per_question": [
                    {
                        "id": "q-001",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "one_step",
                        "scores": {"overall": 2, "explanation": "still incomplete"},
                    },
                    {
                        "id": "q-002",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "none",
                        "scores": {"overall": 3, "explanation": "green"},
                    },
                ],
            },
            {
                "run_id": "2026-04-11T05:40:42",
                "level": "answer",
                "per_question": [
                    {
                        "id": "q-001",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "one_step",
                        "scores": {"overall": 2, "explanation": "still incomplete"},
                    },
                    {
                        "id": "q-002",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "none",
                        "scores": {"overall": 2, "explanation": "wobbled"},
                    },
                ],
            },
            {
                "run_id": "2026-04-11T05:01:39",
                "level": "answer",
                "per_question": [
                    {
                        "id": "q-001",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "one_step",
                        "scores": {"overall": 3, "explanation": "green"},
                    },
                    {
                        "id": "q-002",
                        "difficulty": "simple",
                        "reasoning_type": "single_lookup",
                        "route_lane": "baseline_hybrid",
                        "route_widening_policy": "none",
                        "scores": {"overall": 3, "explanation": "green"},
                    },
                ],
            },
        ]

        summary = summarize_answer_stability(runs)

        q001 = next(question for question in summary["questions"] if question["id"] == "q-001")
        q002 = next(question for question in summary["questions"] if question["id"] == "q-002")

        assert q001["stable_miss"] is True
        assert q001["miss_count"] == 2
        assert q001["mean_overall"] == pytest.approx(7 / 3)
        assert q001["latest_overall"] == 2

        assert q002["stable_miss"] is False
        assert q002["high_variance"] is True
        assert q002["score_range"] == 1
        assert summary["stable_miss_ids"] == ["q-001"]
        assert summary["latest_miss_ids"] == ["q-001"]
