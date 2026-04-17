import subprocess

import pytest

from pipeline.eval.levels import answer


class DummyProc:
    def __init__(self, *, returncode=0, stdout="", stderr="", pid=123, timeout=False):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr
        self.pid = pid
        self.timeout = timeout
        self.communicate_calls = 0

    def communicate(self, timeout=None):
        self.communicate_calls += 1
        if self.timeout and self.communicate_calls == 1:
            raise subprocess.TimeoutExpired(["npx", "tsx"], timeout)
        return self._stdout, self._stderr


def test_invoke_agent_cli_returns_extracted_answer_and_uses_in_memory_observability(monkeypatch):
    observed = {}
    proc = DummyProc(stdout="preface\n---ANSWER---\nfinal answer\n", stderr="")

    def fake_popen(*args, **kwargs):
        observed["args"] = args
        observed["kwargs"] = kwargs
        return proc

    monkeypatch.delenv("MASTRA_OBSERVABILITY_PATH", raising=False)
    monkeypatch.setattr(answer.subprocess, "Popen", fake_popen)

    result, route, verifier = answer._invoke_agent_cli("What is CAP/DA?")

    assert result == "final answer"
    assert route is None
    assert verifier is None
    assert observed["kwargs"]["start_new_session"] is True
    assert observed["kwargs"]["env"]["MASTRA_OBSERVABILITY_PATH"] == ":memory:"


def test_invoke_agent_cli_raises_on_nonzero_exit(monkeypatch):
    proc = DummyProc(returncode=1, stdout="", stderr="fatal agent error")

    monkeypatch.setattr(answer.subprocess, "Popen", lambda *args, **kwargs: proc)

    with pytest.raises(RuntimeError, match="fatal agent error"):
        answer._invoke_agent_cli("What is CAP/DA?")


def test_invoke_agent_cli_kills_process_group_on_timeout(monkeypatch):
    proc = DummyProc(timeout=True, stdout="partial", stderr="timeout stderr", pid=456)
    killed = []

    monkeypatch.setattr(answer.subprocess, "Popen", lambda *args, **kwargs: proc)
    monkeypatch.setattr(answer, "AGENT_EVAL_TIMEOUT_SECS", 5)
    monkeypatch.setattr(answer.os, "killpg", lambda pid, sig: killed.append((pid, sig)))

    with pytest.raises(subprocess.TimeoutExpired):
        answer._invoke_agent_cli("What is CAP/DA?")

    assert killed == [(456, answer.signal.SIGKILL)]
    assert proc.communicate_calls == 2


def test_is_retryable_agent_answer_detects_tool_connection_failure():
    assert answer._is_retryable_agent_answer(
        "I can't verify that because the policy database connection is down."
    )
    assert answer._is_retryable_agent_answer(
        "I tried to search the policy database, but the policy database connection failed."
    )
    assert not answer._is_retryable_agent_answer(
        "I could not find a definitive answer in the retrieved policy text."
    )


def test_evaluate_answers_retries_transient_tool_failure_answer(monkeypatch):
    calls = iter([
        "I can't verify that from the policy corpus right now because the policy database connection is down.",
        "final policy answer",
    ])

    monkeypatch.setattr(answer, "AGENT_EVAL_MAX_RETRIES", 1)
    monkeypatch.setattr(answer, "AGENT_EVAL_RETRY_DELAY_SECS", 0)
    monkeypatch.setattr(answer.time, "sleep", lambda secs: None)
    monkeypatch.setattr(answer, "_invoke_agent", lambda question: next(calls))
    monkeypatch.setattr(answer, "_fetch_evidence_texts", lambda sections: ["evidence"])
    monkeypatch.setattr(
        answer,
        "judge_answer",
        lambda **kwargs: {
            "factual_accuracy": 3,
            "completeness": 3,
            "hallucination": 3,
            "citation_quality": 3,
            "overall": 3,
            "explanation": "ok",
        },
    )

    results = answer.evaluate_answers([
        {
            "id": "q-retry",
            "difficulty": "simple",
            "reasoning_type": "single_lookup",
            "question": "Question?",
            "answer": {"text": "gold"},
            "evidence": {"primary_sections": [], "supporting_sections": []},
        }
    ])

    assert results[0]["agent_answer"] == "final policy answer"
    assert results[0]["scores"]["overall"] == 3


# ── Marker extraction ──────────────────────────────────────────────────────


def test_extract_route_metadata_stops_before_verifier_block():
    """Route block must not greedily absorb the interleaved ---VERIFIER--- JSON."""
    stdout = (
        "prelude\n"
        "---ROUTE---\n"
        '{"route":{"lane":"baseline_hybrid"},"authoritative_document":{"policy_number":"8C"}}\n'
        "\n"
        "---VERIFIER---\n"
        '{"rewrote":true,"supported":false,"unsupported_claim_count":2}\n'
        "\n"
        "---ANSWER---\n"
        "final answer text\n"
    )
    route = answer.extract_route_metadata(stdout)
    verifier = answer.extract_verifier_metadata(stdout)
    assert route is not None
    assert route["route"]["lane"] == "baseline_hybrid"
    assert verifier is not None
    assert verifier["rewrote"] is True
    assert verifier["unsupported_claim_count"] == 2


def test_extract_route_metadata_handles_missing_verifier():
    stdout = (
        "---ROUTE---\n"
        '{"route":{"lane":"graph_reasoning"}}\n'
        "---ANSWER---\n"
        "text\n"
    )
    route = answer.extract_route_metadata(stdout)
    assert route["route"]["lane"] == "graph_reasoning"
    assert answer.extract_verifier_metadata(stdout) is None
