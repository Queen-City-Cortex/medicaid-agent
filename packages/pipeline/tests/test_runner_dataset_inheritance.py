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


def test_answer_run_config_records_the_agent_reported_configuration(monkeypatch):
    from pipeline.eval import runner

    reported = {"agent_model": "gpt-5.6-terra", "agent_reasoning_effort": "medium", "verifier_model": "gpt-5.6-terra"}
    entry = {"id": "q-1", "evidence": {}}
    saved: dict = {}

    class Normalizer:
        mapping_hash = "hash"

        def graph_entries(self, entries):
            return entries

        def evidence(self):
            return {"version": 1}

        def normalized(self, raw):
            return raw

    monkeypatch.setattr(runner, "load_dataset", lambda path: [entry])
    monkeypatch.setattr("pipeline.eval.identity.load_normalizer", lambda: Normalizer())
    monkeypatch.setattr(
        "pipeline.eval.levels.answer.evaluate_answers",
        lambda entries, use_unified_evidence: [{"id": "q-1", "agent_config": None}],
    )

    def fake_save(level, per_question, config_overrides):
        saved.update(config_overrides)
        return "unused"

    monkeypatch.setattr(runner, "save_result", fake_save)
    monkeypatch.setattr("pipeline.eval.results.load_result", lambda path: {})

    runner.run_eval("answer")
    assert "agent_config" not in saved  # no row reported one

    monkeypatch.setattr(
        "pipeline.eval.levels.answer.evaluate_answers",
        lambda entries, use_unified_evidence: [{"id": "q-1", "agent_config": reported}],
    )
    runner.run_eval("answer")
    assert saved["agent_config"] == reported
