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
    entry = {"id": "q-1", "evidence": {}, "status": "validated"}
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


def _run_retrieval(monkeypatch, entries, catalog=None):
    """Run the retrieval level over `entries` with the graph stubbed out."""
    from pipeline.eval import runner

    seen: dict = {}

    def fake_retrieval(scored, top_k=None):
        seen["ids"] = [entry["id"] for entry in scored]
        return [{"id": entry["id"]} for entry in scored]

    def fake_save(level, per_question, config_overrides):
        seen["config"] = config_overrides
        return "unused"

    monkeypatch.delenv("EVAL_IDENTITY_CATALOG", raising=False)
    if catalog is not None:
        monkeypatch.setenv("EVAL_IDENTITY_CATALOG", str(catalog))
    monkeypatch.setattr(runner, "load_dataset", lambda path: entries)
    monkeypatch.setattr("pipeline.eval.identity.load_normalizer", lambda: None)
    monkeypatch.setattr("pipeline.eval.levels.retrieval.evaluate_retrieval", fake_retrieval)
    monkeypatch.setattr(runner, "save_result", fake_save)
    monkeypatch.setattr("pipeline.eval.results.load_result", lambda path: {})
    result = runner.run_eval("retrieval")
    return result, seen


QUOTED = {
    "id": "q-1",
    "status": "validated",
    "evidence": {"primary_sections": [{"section_id": "sec:a"}]},
    "answer": {"text": "The limit is sixty days.", "confidence": "high"},
    "supporting_quotes": [{"section_id": "sec:a", "quote": "within sixty days"}],
}
UNREVIEWED = {"id": "q-2", "status": "needs_validation", "validation_note": "Not checked.", "evidence": {}}


def test_run_skips_unvalidated_entries_and_records_the_count_and_version(monkeypatch, capsys):
    _, seen = _run_retrieval(monkeypatch, [QUOTED, UNREVIEWED])

    assert seen["ids"] == ["q-1"]
    assert seen["config"]["skipped_unvalidated"] == 1
    assert seen["config"]["dataset_version"] == "3.5"
    assert "scoring 1 validated questions; skipped 1" in capsys.readouterr().out


def test_run_with_no_validated_entry_scores_nothing(monkeypatch):
    result, seen = _run_retrieval(monkeypatch, [UNREVIEWED])

    assert result == {"error": "No matching validated entries found"}
    assert "ids" not in seen


def test_run_refuses_to_start_when_a_quote_is_not_in_the_frozen_catalog(tmp_path, monkeypatch):
    import pytest

    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps({"sections": [{"section_id": "sec:a", "content_text": "within ninety days"}]}))

    with pytest.raises(ValueError, match="supporting-quote preflight: q-1: section sec:a does not contain"):
        _run_retrieval(monkeypatch, [QUOTED], catalog)

    catalog.write_text(json.dumps({"sections": [{"section_id": "sec:a", "content_text": "A request within  sixty days."}]}))
    _, seen = _run_retrieval(monkeypatch, [QUOTED], catalog)
    assert seen["ids"] == ["q-1"]


def test_answer_rows_record_whether_the_first_routed_document_is_golden(monkeypatch):
    from pipeline.eval import runner

    entries = [
        {"id": "q-1", "status": "validated", "evidence": {"primary_sections": [{"document_id": "doc:a", "section_id": "sec:doc:a:1"}]}},
        {"id": "q-2", "status": "validated", "evidence": {"primary_sections": [{"document_id": "doc:b", "section_id": "sec:doc:b:1"}]}},
        {"id": "q-3", "status": "validated", "evidence": {"primary_sections": [{"document_id": "doc:c", "section_id": "sec:doc:c:1"}]}},
    ]
    saved: list[dict] = []

    monkeypatch.setattr(runner, "load_dataset", lambda path: entries)
    monkeypatch.setattr("pipeline.eval.identity.load_normalizer", lambda: None)
    monkeypatch.setattr(
        "pipeline.eval.levels.answer.evaluate_answers",
        lambda entries, use_unified_evidence: [
            {"id": "q-1", "route_authoritative_document": {"id": "doc:a"}},
            {"id": "q-2", "route_authoritative_document": {"id": "doc:other"}},
            {"id": "q-3", "route_authoritative_document": None},
        ],
    )
    monkeypatch.setattr(runner, "save_result", lambda level, per_question, config: saved.extend(per_question) or "unused")
    monkeypatch.setattr("pipeline.eval.results.load_result", lambda path: {})

    runner.run_eval("answer")

    assert [row["route_first_document"] for row in saved] == ["primary", "none", None]
