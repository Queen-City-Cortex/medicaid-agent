"""Tests for Level 4 citation eval (levels/citation.py)."""

import json

import pytest

from pipeline.eval.levels.citation import (
    _f1,
    _normalize_url,
    _score_entry,
    evaluate_citations,
)


class TestNormalizeUrl:
    def test_none_and_empty_return_none(self):
        assert _normalize_url(None) is None
        assert _normalize_url("") is None

    def test_strips_trailing_slash(self):
        a = _normalize_url("https://example.com/foo/")
        b = _normalize_url("https://example.com/foo")
        assert a == b

    def test_lowercases_host(self):
        a = _normalize_url("https://Example.COM/foo")
        b = _normalize_url("https://example.com/foo")
        assert a == b

    def test_strips_attachment_query(self):
        base = _normalize_url("https://medicaid.ncdhhs.gov/policy-8c/download")
        with_flag = _normalize_url("https://medicaid.ncdhhs.gov/policy-8c/download?attachment")
        assert base == with_flag

    def test_preserves_meaningful_query(self):
        a = _normalize_url("https://example.com/foo?id=1")
        b = _normalize_url("https://example.com/foo?id=2")
        assert a != b


class TestF1:
    def test_none_inputs_return_none(self):
        assert _f1(None, 1.0) is None
        assert _f1(1.0, None) is None

    def test_zero_sum_returns_zero(self):
        assert _f1(0.0, 0.0) == 0.0

    def test_harmonic_mean(self):
        # precision=1, recall=0.5 → f1 = 2 * 1 * 0.5 / 1.5 = 0.6667
        assert _f1(1.0, 0.5) == pytest.approx(0.6667, abs=0.001)


def _make_entry(qid: str, primary_ids: list[str], supporting_ids: list[str] | None = None) -> dict:
    return {
        "id": qid,
        "difficulty": "moderate",
        "reasoning_type": "negative_answer",
        "evidence": {
            "primary_sections": [{"section_id": sid} for sid in primary_ids],
            "supporting_sections": [{"section_id": sid} for sid in (supporting_ids or [])],
        },
    }


class TestScoreEntry:
    def test_perfect_citation(self):
        entry = _make_entry("q-1", primary_ids=["sec:a", "sec:b"])
        url_map = {"sec:a": "https://example.com/a", "sec:b": "https://example.com/b"}
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/a", "https://example.com/b"],
            section_url_map=url_map,
        )
        assert result["citation_precision"] == 1.0
        assert result["citation_recall"] == 1.0
        assert result["citation_f1"] == 1.0
        assert result["primary_hit"] is True
        assert result["missing_primary_urls"] == []
        assert result["extraneous_urls"] == []

    def test_missing_primary_citation(self):
        entry = _make_entry("q-2", primary_ids=["sec:a", "sec:b"])
        url_map = {"sec:a": "https://example.com/a", "sec:b": "https://example.com/b"}
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/a"],
            section_url_map=url_map,
        )
        assert result["citation_precision"] == 1.0
        assert result["citation_recall"] == 0.5
        assert result["missing_primary_urls"] == ["https://example.com/b"]
        assert result["extraneous_urls"] == []

    def test_extraneous_citation_drops_precision(self):
        entry = _make_entry("q-3", primary_ids=["sec:a"])
        url_map = {"sec:a": "https://example.com/a"}
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/a", "https://example.com/wrong"],
            section_url_map=url_map,
        )
        assert result["citation_precision"] == 0.5
        assert result["citation_recall"] == 1.0
        assert result["extraneous_urls"] == ["https://example.com/wrong"]

    def test_supporting_section_counts_for_precision_not_recall(self):
        entry = _make_entry("q-4", primary_ids=["sec:a"], supporting_ids=["sec:b"])
        url_map = {"sec:a": "https://example.com/a", "sec:b": "https://example.com/b"}
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/b"],
            section_url_map=url_map,
        )
        # Supporting URL counts as a valid citation for precision
        assert result["citation_precision"] == 1.0
        # But recall only counts primary sections; none cited
        assert result["citation_recall"] == 0.0
        assert result["primary_hit"] is False

    def test_no_citations_emits_none_precision(self):
        entry = _make_entry("q-5", primary_ids=["sec:a"])
        url_map = {"sec:a": "https://example.com/a"}
        result = _score_entry(entry, cited_urls_raw=[], section_url_map=url_map)
        assert result["citation_precision"] is None
        assert result["citation_recall"] == 0.0

    def test_no_primary_emits_none_recall(self):
        entry = _make_entry("q-6", primary_ids=[])
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/a"],
            section_url_map={},
        )
        assert result["citation_recall"] is None
        assert result["primary_hit"] is None
        # Can't evaluate precision without expected URLs (cited counts toward extraneous)
        assert result["citation_precision"] == 0.0

    def test_normalization_applied_to_both_sides(self):
        entry = _make_entry("q-7", primary_ids=["sec:a"])
        url_map = {"sec:a": "https://Example.com/a/"}  # uppercase host + trailing slash
        result = _score_entry(
            entry,
            cited_urls_raw=["https://example.com/a?attachment"],  # flag added
            section_url_map=url_map,
        )
        assert result["citation_precision"] == 1.0
        assert result["citation_recall"] == 1.0


class TestEvaluateCitations:
    def test_requires_from_result(self):
        with pytest.raises(ValueError, match="requires --from-result"):
            evaluate_citations([_make_entry("q-1", ["sec:a"])], from_result=None)

    def test_reads_cached_result_and_grades(self, tmp_path, monkeypatch):
        # Stub Neo4j lookup to avoid hitting the DB in unit tests.
        monkeypatch.setattr(
            "pipeline.eval.levels.citation._lookup_section_urls",
            lambda ids: {sid: f"https://example.com/{sid}" for sid in ids},
        )

        cached_path = tmp_path / "answer.json"
        cached_path.write_text(
            json.dumps(
                {
                    "per_question": [
                        {
                            "id": "q-1",
                            "citation_support": {
                                "unique_citation_urls": ["https://example.com/sec:a"],
                            },
                        },
                    ]
                }
            )
        )
        entries = [_make_entry("q-1", ["sec:a"])]
        results = evaluate_citations(entries, from_result=str(cached_path))
        assert len(results) == 1
        assert results[0]["citation_precision"] == 1.0
        assert results[0]["citation_recall"] == 1.0
        assert results[0]["primary_hit"] is True

    def test_missing_cached_entry_records_error(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "pipeline.eval.levels.citation._lookup_section_urls",
            lambda ids: {},
        )
        cached_path = tmp_path / "answer.json"
        cached_path.write_text(json.dumps({"per_question": []}))
        entries = [_make_entry("q-missing", ["sec:a"])]
        results = evaluate_citations(entries, from_result=str(cached_path))
        assert results[0]["error"].startswith("no cached answer-eval entry")

    def test_rejects_non_answer_result(self, tmp_path):
        cached_path = tmp_path / "not-answer.json"
        cached_path.write_text(json.dumps({"something": "else"}))
        with pytest.raises(ValueError, match="does not look like an answer-eval result"):
            evaluate_citations([_make_entry("q-1", ["sec:a"])], from_result=str(cached_path))
