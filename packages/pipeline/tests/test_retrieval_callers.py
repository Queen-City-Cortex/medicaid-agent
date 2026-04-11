"""Regression tests for Python callers of canonical retrieval."""

from click.testing import CliRunner

from pipeline.cli import cli
from pipeline.eval.levels import retrieval
from pipeline.retrieval import agent_bridge


def test_evaluate_retrieval_uses_bridge_results(monkeypatch):
    calls: list[list[dict]] = []

    def fake_search_batch(requests: list[dict], timeout_seconds: int | None = None):
        calls.append(requests)
        return {
            "q-1": [
                {"section_id": "sec:primary"},
                {"section_id": "sec:supporting"},
                {"section_id": "sec:other"},
            ]
        }

    monkeypatch.setattr(retrieval, "search_sections_batch_via_agent_cli", fake_search_batch)

    results = retrieval.evaluate_retrieval([
        {
            "id": "q-1",
            "difficulty": "medium",
            "reasoning_type": "direct_lookup",
            "question": "Who qualifies?",
            "evidence": {
                "primary_sections": [{"section_id": "sec:primary"}],
                "supporting_sections": [{"section_id": "sec:supporting"}],
            },
        }
    ], top_k=3)

    assert calls == [[
        {
            "id": "q-1",
            "query": "Who qualifies?",
            "top_k": 3,
        }
    ]]
    assert results == [
        {
            "id": "q-1",
            "difficulty": "medium",
            "reasoning_type": "direct_lookup",
            "precision": 2 / 3,
            "recall": 1.0,
            "mrr": 1.0,
            "primary_hit": True,
            "retrieved": ["sec:primary", "sec:supporting", "sec:other"],
            "expected_primary": ["sec:primary"],
            "expected_supporting": ["sec:supporting"],
        }
    ]


def test_search_cli_uses_bridge_and_prints_results(monkeypatch):
    calls: list[tuple[str, int, list[str] | None]] = []

    def fake_search(query: str, top_k: int = 10, document_types: list[str] | None = None):
        calls.append((query, top_k, document_types))
        return [
            {
                "policy_number": "8C",
                "section_number": "4.1",
                "section_title": "Eligibility",
                "content": "This is the first sentence of the section.",
                "score": 0.97,
            }
        ]

    monkeypatch.setattr(agent_bridge, "search_sections_via_agent_cli", fake_search)

    result = CliRunner().invoke(cli, ["search", "eligibility", "-k", "1", "--type", "dhhs_policy"])

    assert result.exit_code == 0
    assert calls == [("eligibility", 1, ["dhhs_policy"])]
    assert "8C" in result.output
    assert "4.1 Eligibility" in result.output
    assert "This is the first sentence of the section." in result.output


def test_evaluate_retrieval_batches_large_runs(monkeypatch):
    calls: list[list[str]] = []

    def fake_search_batch(requests: list[dict], timeout_seconds: int | None = None):
        calls.append([request["id"] for request in requests])
        return {
            request["id"]: [{"section_id": f"sec:{request['id']}"}]
            for request in requests
        }

    monkeypatch.setattr(retrieval, "search_sections_batch_via_agent_cli", fake_search_batch)

    entries = [
        {
            "id": f"q-{index}",
            "difficulty": "simple",
            "reasoning_type": "single_lookup",
            "question": f"Question {index}",
            "evidence": {
                "primary_sections": [{"section_id": f"sec:q-{index}"}],
                "supporting_sections": [],
            },
        }
        for index in range(6)
    ]

    results = retrieval.evaluate_retrieval(entries, top_k=2)

    assert calls == [
        ["q-0", "q-1", "q-2", "q-3", "q-4"],
        ["q-5"],
    ]
    assert len(results) == 6
    assert all(result["primary_hit"] for result in results)
