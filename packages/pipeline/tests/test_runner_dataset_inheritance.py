"""Citation eval must grade against the dataset that produced the cached
answers.

Regression test for the 2026-07-10 all-nulls citation run: the answer eval ran
on the held-out dataset (h-* IDs) while the citation eval defaulted to the
golden dataset (q-* IDs), so every cached-answer lookup missed.
"""

import json

from pipeline.eval.runner import _dataset_from_cached_result


def _write_cached_answer(tmp_path, config: dict) -> str:
    path = tmp_path / "answer.json"
    path.write_text(json.dumps({"config": config, "per_question": []}))
    return str(path)


class TestDatasetFromCachedResult:
    def test_inherits_relative_dataset_anchored_at_project_root(self, tmp_path):
        from pipeline.config import PROJECT_ROOT

        cached = _write_cached_answer(
            tmp_path, {"dataset": "data/golden/heldout-paraphrase.json"}
        )
        resolved = _dataset_from_cached_result(cached)
        assert resolved == PROJECT_ROOT / "data/golden/heldout-paraphrase.json"

    def test_keeps_absolute_dataset_path(self, tmp_path):
        dataset = tmp_path / "custom.json"
        cached = _write_cached_answer(tmp_path, {"dataset": str(dataset)})
        assert _dataset_from_cached_result(cached) == dataset

    def test_returns_none_for_legacy_runs_without_dataset(self, tmp_path):
        cached = _write_cached_answer(tmp_path, {"top_k": 10})
        assert _dataset_from_cached_result(cached) is None
