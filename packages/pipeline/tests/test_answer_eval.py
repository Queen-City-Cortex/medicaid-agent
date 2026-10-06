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

    result, route, verifier, evidence = answer._invoke_agent_cli("What is CAP/DA?")

    assert result == "final answer"
    assert route is None
    assert verifier is None
    assert evidence is None
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


def test_invoke_agent_uses_cli_so_verifier_evidence_metadata_is_preserved(monkeypatch):
    calls = []

    def fake_cli(question, *, progress_label=None):
        calls.append((question, progress_label))
        return (
            "final answer",
            {"route": {"lane": "graph_reasoning"}},
            {"supported": True},
            {"sources": [{"toolName": "getSection", "key": "sec:1", "text": "Evidence"}]},
        )

    monkeypatch.setattr(answer, "_invoke_agent_cli", fake_cli)

    result = answer._invoke_agent("What is covered?", progress_label="q-001")

    assert calls == [("What is covered?", "q-001")]
    assert result[0] == "final answer"
    assert result[2] == {"supported": True}
    assert result[3]["sources"][0]["toolName"] == "getSection"


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


def test_is_retryable_agent_error_detects_vercel_ai_call_errors():
    # The q-026 regression: agent exits code 1 with a Vercel AI_APICallError
    # and isRetryable:true in stderr. The old harness didn't retry these.
    assert answer._is_retryable_agent_error(
        "Agent error: Agent exited with code 1 (stderr_tail=... "
        "Symbol(vercel.ai.error.AI_APICallError): true ...)"
    )
    assert answer._is_retryable_agent_error(
        'Agent error: Agent exited with code 1 (stderr_tail=... "isRetryable": true ...)'
    )
    assert answer._is_retryable_agent_error(
        "Agent error: fetch failed"
    )
    assert not answer._is_retryable_agent_error(
        "Agent error: RuntimeError: Schema mismatch in tool definition"
    )
    assert not answer._is_retryable_agent_error(None)
    assert not answer._is_retryable_agent_error("")


def test_evaluate_answers_retries_transient_tool_failure_answer(monkeypatch):
    calls = iter([
        "I can't verify that from the policy corpus right now because the policy database connection is down.",
        "final policy answer",
    ])

    monkeypatch.setattr(answer, "AGENT_EVAL_MAX_RETRIES", 1)
    monkeypatch.setattr(answer, "AGENT_EVAL_RETRY_DELAY_SECS", 0)
    monkeypatch.setattr(answer.time, "sleep", lambda secs: None)
    monkeypatch.setattr(answer, "_invoke_agent", lambda question: next(calls))
    monkeypatch.setattr(answer, "_fetch_evidence_sections", lambda sections: [])
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


ENTRY = {
    "id": "q-verifier",
    "difficulty": "simple",
    "reasoning_type": "single_lookup",
    "question": "Question?",
    "answer": {"text": "gold"},
    "evidence": {"primary_sections": [], "supporting_sections": []},
}
WITHHELD_NOTICE = "I could not verify this answer against the retrieved sources."
PASSED = {"outcome": {"status": "passed", "passCount": 1}, "pass_count": 1, "verifier_unavailable": False}
WITHHELD = {
    "outcome": {"status": "withheld", "reason": "unsupported", "passCount": 2},
    "pass_count": 2,
    "withholding_reason": "unsupported",
    "verifier_unavailable": False,
}
# What cli-verification.ts emits when verification could not run at all.
UNAVAILABLE = {
    "outcome": {"status": "withheld", "reason": "unavailable", "passCount": 0},
    "pass_count": 0,
    "withholding_reason": "unavailable",
    "verifier_unavailable": True,
}


def run_with_verifier(monkeypatch, runs, *, max_retries=1):
    """Evaluate one question against scripted agent runs; return the row, the
    number of agent runs and the number of judge calls."""
    remaining = list(runs)
    counts = {"agent": 0, "judge": 0}

    def fake_agent(question, *, progress_label=None):
        counts["agent"] += 1
        text, verifier = remaining.pop(0)
        return text, None, verifier, None

    def fake_judge(**kwargs):
        counts["judge"] += 1
        return {
            "factual_accuracy": 3,
            "completeness": 3,
            "hallucination": 3,
            "citation_quality": 3,
            "overall": 3,
            "explanation": "ok",
        }

    monkeypatch.setattr(answer, "AGENT_EVAL_MAX_RETRIES", max_retries)
    monkeypatch.setattr(answer.time, "sleep", lambda secs: None)
    monkeypatch.setattr(answer, "_invoke_agent", fake_agent)
    monkeypatch.setattr(answer, "_fetch_evidence_sections", lambda sections: [])
    monkeypatch.setattr(answer, "judge_answer", fake_judge)

    return answer.evaluate_answers([ENTRY])[0], counts["agent"], counts["judge"]


def test_row_records_the_configuration_the_agent_reported(monkeypatch):
    # The harness cannot know the agent's resolved defaults or its own .env.
    reported = {"agent_model": "gpt-5.6-terra", "agent_reasoning_effort": "medium", "verifier_model": "gpt-5.6-terra"}
    monkeypatch.setattr(
        answer,
        "_invoke_agent",
        lambda question, *, progress_label=None: ("answer", None, PASSED, {"sources": [], "agent_config": reported}),
    )
    monkeypatch.setattr(answer, "_fetch_evidence_sections", lambda sections: [])
    monkeypatch.setattr(answer, "judge_answer", lambda **kwargs: {"overall": 3, "completeness": 3, "factual_accuracy": 3})

    assert answer.evaluate_answers([ENTRY])[0]["agent_config"] == reported


def test_row_without_an_evidence_block_records_no_configuration(monkeypatch):
    row, _, _ = run_with_verifier(monkeypatch, [("answer", PASSED)])

    assert row["agent_config"] is None


def test_withheld_answer_is_not_judged_and_has_no_hallucination_score(monkeypatch):
    # Judging the fixed notice scored every withhold hallucination 3, so the
    # safety metric rose when the product answered fewer questions.
    row, agent_runs, judge_calls = run_with_verifier(monkeypatch, [(WITHHELD_NOTICE, WITHHELD)])

    assert agent_runs == 1  # a genuine withhold is an outcome, not a retry
    assert judge_calls == 0
    assert row["scores"]["overall"] == 0
    assert row["scores"]["hallucination"] is None
    assert row["scores"]["outcome"] == "withheld"
    assert "unsupported" in row["scores"]["explanation"]
    # require_complete_results rejects any error_type; a withhold must not
    # invalidate release evidence.
    assert "error_type" not in row["scores"]
    assert row["agent_error"] is None
    assert row["judge_error"] is False
    assert row["verifier"] == WITHHELD


def test_verifier_outage_is_rerun_then_counted_as_an_infrastructure_error(monkeypatch):
    row, agent_runs, judge_calls = run_with_verifier(
        monkeypatch,
        [(WITHHELD_NOTICE, UNAVAILABLE), (WITHHELD_NOTICE, UNAVAILABLE)],
    )

    assert agent_runs == 2  # re-run by the harness, up to its retry limit
    assert judge_calls == 0
    assert row["scores"]["error_type"] == "agent"
    assert all(
        row["scores"][dim] is None
        for dim in ("factual_accuracy", "completeness", "hallucination", "citation_quality", "overall")
    )
    assert "Verifier unavailable" in row["agent_error"]


def test_verifier_outage_that_clears_on_rerun_is_judged_normally(monkeypatch):
    row, agent_runs, judge_calls = run_with_verifier(
        monkeypatch,
        [(WITHHELD_NOTICE, UNAVAILABLE), ("final policy answer", PASSED)],
    )

    assert agent_runs == 2
    assert judge_calls == 1
    assert row["agent_answer"] == "final policy answer"
    assert row["agent_error"] is None
    assert row["scores"]["hallucination"] == 3
    assert "outcome" not in row["scores"]


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


def test_extract_evidence_metadata_parses_sources_payload():
    """Agent emits `---EVIDENCE---` before `---VERIFIER---` and `---ANSWER---`;
    extractor must bound the search correctly and parse the single-line JSON."""
    sources_payload = (
        '{"sources":[{"toolName":"getAmendments","key":"cn:04-26",'
        '"text":"[getAmendments]\\nAppendix B change"}],"evidence_bytes":42}'
    )
    stdout = (
        "prelude\n"
        "---ROUTE---\n"
        '{"route":{"lane":"graph_reasoning"}}\n'
        "---EVIDENCE---\n"
        f"{sources_payload}\n"
        "---VERIFIER---\n"
        '{"rewrote":false,"supported":true}\n'
        "---ANSWER---\n"
        "final\n"
    )
    evidence = answer.extract_evidence_metadata(stdout)
    assert evidence is not None
    assert evidence["evidence_bytes"] == 42
    assert len(evidence["sources"]) == 1
    assert evidence["sources"][0]["toolName"] == "getAmendments"
    # Route extractor must stop before the evidence block, not absorb it.
    route = answer.extract_route_metadata(stdout)
    assert route["route"]["lane"] == "graph_reasoning"
    # Verifier extractor must still work (evidence block is before it).
    verifier = answer.extract_verifier_metadata(stdout)
    assert verifier["supported"] is True


def test_extract_evidence_metadata_returns_none_when_block_absent():
    stdout = "---ROUTE---\n{}\n---ANSWER---\nok\n"
    assert answer.extract_evidence_metadata(stdout) is None


def test_invoke_agent_with_progress_pads_legacy_three_tuple():
    """Older monkeypatches returning 3-tuples still work — padded with None
    for evidence_info."""
    from pipeline.eval.levels import answer as mod

    class _Stub:
        def __call__(self, question, *, progress_label=None):
            return ("ans", None, {"rewrote": False})

    original = mod._invoke_agent
    mod._invoke_agent = _Stub()
    try:
        ans, route, verifier, evidence = mod._invoke_agent_with_progress("q")
        assert ans == "ans"
        assert verifier == {"rewrote": False}
        assert evidence is None
    finally:
        mod._invoke_agent = original


def test_build_agent_env_prefers_eval_openai_key(monkeypatch):
    # A research run must not draw on the production agent's OpenAI quota.
    monkeypatch.setenv("OPENAI_API_KEY", "prod-key")
    monkeypatch.setenv("EVAL_OPENAI_API_KEY", "eval-key")
    env = answer._build_agent_env()
    assert env["OPENAI_API_KEY"] == "eval-key"


def test_build_agent_env_falls_back_to_openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "prod-key")
    monkeypatch.delenv("EVAL_OPENAI_API_KEY", raising=False)
    env = answer._build_agent_env()
    assert env["OPENAI_API_KEY"] == "prod-key"


# What `src/cli.ts` prints when the coverage boundary refuses a question, with
# Mastra's log lines before the blocks as they appear on a pipe.
GATE_NOTICE = "I cannot establish the applicable MAGI income table for that period within the supported dated coverage."
GATE_REFUSAL_STDOUT = "\n".join([
    'WARN (mastra): Input processor tripwire triggered',
    '    reason: "Evidence required by this request is outside the supported coverage scope"',
    "",
    "---EVIDENCE---",
    "",
    '{"sources":[],"evidence_bytes":0,"agent_config":{"agent_model":"gpt-5.6-terra","agent_reasoning_effort":"medium",'
    '"verifier_model":"gpt-5.6-terra","input_processors":["message-length-guard","coverage-boundary","scope-gate",'
    '"openai-responses-dedup","answer-frame-prefetch","answer-frame-planning","token-limiter"],'
    '"runtime_options":{"memory":false,"prompt_injection_detector":false}}}',
    "",
    "---VERIFIER---",
    "",
    '{"gate":{"processor_id":"coverage-boundary","code":"coverage-limitation"},'
    '"coverage_policy_id":"bounded-policy-research-v1","coverage_issue":"' + GATE_NOTICE + '",'
    '"latency_ms":0,"pass_count":0,"withholding_reason":"coverage-limitation",'
    '"outcome":{"status":"withheld","reason":"coverage-limitation","passCount":0},'
    '"rewrote":false,"supported":false,"verifier_unavailable":false}',
    "",
    "---ANSWER---",
    "",
    GATE_NOTICE,
    "",
])


def refused_by_gate(monkeypatch):
    monkeypatch.setattr(
        answer.subprocess, "Popen", lambda *args, **kwargs: DummyProc(stdout=GATE_REFUSAL_STDOUT)
    )
    return answer._invoke_agent_cli("What MAGI income table and limits apply in February 2025?")


def test_invoke_agent_cli_runs_the_cli_entrypoint(monkeypatch):
    observed = {}

    def fake_popen(command, **kwargs):
        observed["command"] = command
        return DummyProc(stdout="---ANSWER---\nok\n")

    monkeypatch.setattr(answer.subprocess, "Popen", fake_popen)
    answer._invoke_agent_cli("Question?")

    assert observed["command"][0] == "node"
    assert observed["command"][1].endswith("node_modules/tsx/dist/cli.mjs")
    assert observed["command"][2:] == ["src/cli.ts", "Question?"]
    assert (answer.AGENT_DIR / "src/cli.ts").is_file()


def test_gate_refusal_is_a_distinct_withheld_outcome_and_is_neither_judged_nor_retried(monkeypatch):
    text, route, verifier, evidence = refused_by_gate(monkeypatch)
    assert text == GATE_NOTICE
    assert route is None
    assert answer._gate_refusal(verifier) == {"processor_id": "coverage-boundary", "code": "coverage-limitation"}
    monkeypatch.setattr(answer, "_invoke_agent", lambda question, *, progress_label=None: (text, route, verifier, evidence))
    monkeypatch.setattr(answer, "_fetch_evidence_sections", lambda sections: [])
    judged = []
    monkeypatch.setattr(answer, "judge_answer", lambda **kwargs: judged.append(kwargs))

    row = answer.evaluate_answers([ENTRY])[0]

    assert judged == []
    assert row["agent_answer"] == GATE_NOTICE
    assert row["agent_error"] is None
    assert row["gate_refusal"] == {"processor_id": "coverage-boundary", "code": "coverage-limitation"}
    assert row["scores"]["outcome"] == "withheld"
    assert row["scores"]["gate"] == row["gate_refusal"]
    assert row["scores"]["overall"] == 0
    assert row["scores"]["hallucination"] is None
    assert "coverage-boundary input gate (coverage-limitation)" in row["scores"]["explanation"]
    # Not an error: the row stays valid release evidence and counts as withheld.
    assert "error_type" not in row["scores"]
    # The row records which gates ran and which runtime options were off.
    assert row["agent_config"]["input_processors"][:3] == ["message-length-guard", "coverage-boundary", "scope-gate"]
    assert row["agent_config"]["runtime_options"] == {"memory": False, "prompt_injection_detector": False}

    from pipeline.eval.results import compute_rollup
    from pipeline.evaluation_evidence import verification_summary

    assert verification_summary({"per_question": [row]})["withholdingReasons"] == {"coverage-limitation": 1}
    assert compute_rollup([row])["withheld_count"] == 1


def test_verifier_withhold_and_released_answer_carry_no_gate_refusal(monkeypatch):
    withheld, _, _ = run_with_verifier(monkeypatch, [(WITHHELD_NOTICE, WITHHELD)])
    released, _, _ = run_with_verifier(monkeypatch, [("answer", PASSED)])

    assert withheld["gate_refusal"] is None and "gate" not in withheld["scores"]
    assert released["gate_refusal"] is None


def test_scope_acceptance_accepts_a_coverage_boundary_refusal_as_its_withheld_case(monkeypatch):
    from pipeline import evaluation_evidence
    from pipeline.answer_scope import scope_policy
    from pipeline.eval.answer_scope import CASES, run_scope_acceptance

    monkeypatch.setattr(evaluation_evidence, "evaluation_fingerprint", lambda: {})
    refusal = refused_by_gate(monkeypatch)
    assert refusal[2]["coverage_policy_id"] == scope_policy()["id"]

    def invoke(question, **_kwargs):
        case = next(case for case in CASES if case[1] == question)
        if case[2] == "withheld":
            return refusal
        verifier = {
            "coverage_policy_id": scope_policy()["id"],
            "verifier_unavailable": False,
            "outcome": {"status": "passed"},
            "coverage_issue": None,
            "pass_count": 1,
            "supported": True,
            "citations_complete": True,
        }
        return "Answer " + " ".join(case[3]), {}, verifier, {"sources": []}

    assert run_scope_acceptance("a" * 64, invoke=invoke)["all_passed"] is True
