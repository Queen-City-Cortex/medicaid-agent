"""Tests for the Python bridge to the canonical TypeScript retrieval CLI."""

import json
import subprocess

import pytest

from pipeline.config import AGENT_DIR
from pipeline.retrieval import agent_bridge


def test_search_sections_via_agent_cli_returns_normalized_results(monkeypatch):
    calls: dict[str, object] = {}

    def fake_run(command: list[str], **kwargs):
        calls["command"] = command
        calls["kwargs"] = kwargs
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps({
                "results": [
                    {
                        "section_id": "sec:1",
                        "section_number": "4.1",
                        "section_title": "Eligibility",
                        "doc_title": "Policy 8C",
                        "document_type": "dhhs_policy",
                        "policy_number": "8C",
                        "content": "Full section content",
                        "score": 0.97,
                    }
                ]
            }),
            stderr="",
        )

    monkeypatch.setattr(agent_bridge.subprocess, "run", fake_run)

    results = agent_bridge.search_sections_via_agent_cli(
        "eligibility",
        top_k=5,
        document_types=["dhhs_policy"],
    )

    assert results == [
        {
            "section_id": "sec:1",
            "section_number": "4.1",
            "section_title": "Eligibility",
            "doc_title": "Policy 8C",
            "document_type": "dhhs_policy",
            "policy_number": "8C",
            "content": "Full section content",
            "score": 0.97,
        }
    ]
    assert calls["command"] == ["npx", "tsx", "src/retrieval-cli.ts"]
    assert calls["kwargs"]["cwd"] == str(AGENT_DIR)
    assert json.loads(calls["kwargs"]["input"]) == {
        "query": "eligibility",
        "topK": 5,
        "documentTypes": ["dhhs_policy"],
    }


def test_search_sections_via_agent_cli_raises_on_nonzero_exit(monkeypatch):
    def fake_run(command: list[str], **kwargs):
        return subprocess.CompletedProcess(command, 1, stdout="", stderr="boom")

    monkeypatch.setattr(agent_bridge.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="Retrieval CLI exited with code 1: boom"):
        agent_bridge.search_sections_via_agent_cli("eligibility")


def test_search_sections_via_agent_cli_raises_on_invalid_json(monkeypatch):
    def fake_run(command: list[str], **kwargs):
        return subprocess.CompletedProcess(command, 0, stdout="not json", stderr="")

    monkeypatch.setattr(agent_bridge.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="Retrieval CLI returned invalid JSON"):
        agent_bridge.search_sections_via_agent_cli("eligibility")


def test_search_sections_via_agent_cli_allows_empty_results(monkeypatch):
    def fake_run(command: list[str], **kwargs):
        return subprocess.CompletedProcess(command, 0, stdout='{"results":[]}', stderr="")

    monkeypatch.setattr(agent_bridge.subprocess, "run", fake_run)

    assert agent_bridge.search_sections_via_agent_cli("eligibility") == []


def test_search_sections_batch_via_agent_cli_returns_normalized_results(monkeypatch):
    calls: dict[str, object] = {}

    def fake_run(command: list[str], **kwargs):
        calls["command"] = command
        calls["kwargs"] = kwargs
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps({
                "results_by_request": [
                    {
                        "id": "q-1",
                        "results": [
                            {
                                "section_id": "sec:1",
                                "section_number": "4.1",
                                "section_title": "Eligibility",
                                "doc_title": "Policy 8C",
                                "document_type": "dhhs_policy",
                                "policy_number": "8C",
                                "content": "Full section content",
                                "score": 0.97,
                            }
                        ],
                    },
                    {
                        "id": "q-2",
                        "results": [],
                    },
                ]
            }),
            stderr="",
        )

    monkeypatch.setattr(agent_bridge.subprocess, "run", fake_run)

    results = agent_bridge.search_sections_batch_via_agent_cli([
        {
            "id": "q-1",
            "query": "eligibility",
            "top_k": 5,
            "document_types": ["dhhs_policy"],
        },
        {
            "id": "q-2",
            "query": "appeals",
            "top_k": 3,
        },
    ])

    assert results == {
        "q-1": [
            {
                "section_id": "sec:1",
                "section_number": "4.1",
                "section_title": "Eligibility",
                "doc_title": "Policy 8C",
                "document_type": "dhhs_policy",
                "policy_number": "8C",
                "content": "Full section content",
                "score": 0.97,
            }
        ],
        "q-2": [],
    }
    assert calls["command"] == ["npx", "tsx", "src/retrieval-cli.ts"]
    assert calls["kwargs"]["cwd"] == str(AGENT_DIR)
    assert json.loads(calls["kwargs"]["input"]) == {
        "requests": [
            {
                "id": "q-1",
                "query": "eligibility",
                "topK": 5,
                "documentTypes": ["dhhs_policy"],
            },
            {
                "id": "q-2",
                "query": "appeals",
                "topK": 3,
            },
        ]
    }
