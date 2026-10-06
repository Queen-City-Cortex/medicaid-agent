"""The agent CLI's stdout, as the agent's own test generates it, parsed by the
evaluation's production parser.

The files under ``packages/agent/tests/fixtures/cli-stdout`` are written and
compared by ``packages/agent/tests/cli-stdout-golden.test.ts`` from the CLI's
printing code. A field renamed on the TypeScript side changes those files and
fails here; a parser change that stops reading a block fails here too.
"""

from pathlib import Path

import pytest

from pipeline.eval.levels.answer import (
    _gate_refusal,
    _is_verifier_unavailable,
    _verifier_outcome,
    extract_answer,
    extract_evidence_metadata,
    extract_route_metadata,
    extract_verifier_metadata,
)

GOLDEN_DIR = Path(__file__).resolve().parents[3] / "packages/agent/tests/fixtures/cli-stdout"
INPUT_PROCESSORS = [
    "message-length-guard", "coverage-boundary", "scope-gate", "openai-responses-dedup",
    "answer-frame-prefetch", "answer-frame-planning", "token-limiter",
]
# Every field of the agent's VerifierTelemetry, with the type the reports read.
VERIFIER_FIELDS = {
    "latency_ms": int,
    "pass_count": int,
    "outcome": dict,
    "rewrote": bool,
    "supported": bool,
    "relevant": bool,
    "citations_complete": bool,
    "unsupported_claim_count": int,
    "missing_citation_count": int,
    "relevance_issue_count": int,
    "major_relevance_issue": bool,
    "verifier_unavailable": bool,
    "verifier_model": str,
    "source_entry_count": int,
    "evidence_bytes": int,
    "fabricated_url_count": int,
    "fabricated_quote_count": int,
    "evidence_chars_sent": int,
    "evidence_entries_dropped": int,
    "unknown_section_count": int,
}
NULLABLE_VERIFIER_FIELDS = {"coverage_policy_id", "coverage_issue", "withholding_reason", "rewrite_substance_ratio"}


def _stdout(name: str) -> str:
    return (GOLDEN_DIR / name).read_text()


def _assert_agent_config(evidence: dict) -> None:
    config = evidence["agent_config"]
    assert set(config) == {"agent_model", "agent_reasoning_effort", "verifier_model", "input_processors", "runtime_options"}
    assert isinstance(config["agent_model"], str) and isinstance(config["verifier_model"], str)
    assert config["input_processors"] == INPUT_PROCESSORS
    assert config["runtime_options"] == {"memory": False, "prompt_injection_detector": False}


def test_released_answer_blocks_parse_with_every_field_the_evaluation_reads():
    stdout = _stdout("released-answer.txt")

    evidence = extract_evidence_metadata(stdout)
    sources = evidence["sources"]
    assert [source["toolName"] for source in sources] == ["lookupPolicy", "getSection"]
    for source in sources:
        assert source["key"] and source["text"].startswith(f"[{source['toolName']}]")
        assert source["link"] == "https://integration.test/cli-golden/1a-14.pdf"
    assert "Content:\nMedicaid covers the procedure" in sources[1]["text"]
    assert evidence["evidence_bytes"] == sum(len(source["text"]) for source in sources) > 0
    _assert_agent_config(evidence)

    verifier = extract_verifier_metadata(stdout)
    assert set(verifier) == set(VERIFIER_FIELDS) | NULLABLE_VERIFIER_FIELDS
    for field, kind in VERIFIER_FIELDS.items():
        assert type(verifier[field]) is kind, field
    assert verifier["outcome"] == {"status": "passed", "passCount": 1}
    assert _verifier_outcome(verifier) == ("passed", None)
    assert _gate_refusal(verifier) is None
    assert not _is_verifier_unavailable(verifier)
    assert verifier["pass_count"] == 1
    assert verifier["withholding_reason"] is None
    assert verifier["latency_ms"] == 1234
    assert verifier["coverage_policy_id"] is None and verifier["coverage_issue"] is None
    assert verifier["supported"] is True and verifier["rewrote"] is False
    assert verifier["source_entry_count"] == len(sources)
    assert verifier["evidence_bytes"] == evidence["evidence_bytes"]
    assert verifier["evidence_chars_sent"] > 0
    for count in (
        "unsupported_claim_count", "missing_citation_count", "relevance_issue_count",
        "fabricated_url_count", "fabricated_quote_count", "evidence_entries_dropped", "unknown_section_count",
    ):
        assert verifier[count] == 0, count

    answer = extract_answer(stdout)
    assert answer.startswith("Medicaid covers the procedure when it is medically necessary")
    assert answer.endswith("([Clinical Coverage Policy 1A-14](https://integration.test/cli-golden/1a-14.pdf)).")
    assert "---" not in answer
    assert extract_route_metadata(stdout) is None


def test_gate_refusal_blocks_parse_as_a_withheld_outcome_naming_the_gate():
    stdout = _stdout("gate-refusal.txt")

    evidence = extract_evidence_metadata(stdout)
    assert evidence["sources"] == [] and evidence["evidence_bytes"] == 0
    _assert_agent_config(evidence)

    verifier = extract_verifier_metadata(stdout)
    assert set(verifier) == {
        "gate", "coverage_policy_id", "coverage_issue", "latency_ms", "pass_count",
        "withholding_reason", "outcome", "rewrote", "supported", "verifier_unavailable",
    }
    assert verifier["gate"] == {"processor_id": "coverage-boundary", "code": "coverage-limitation"}
    assert _gate_refusal(verifier) == verifier["gate"]
    assert _verifier_outcome(verifier) == ("withheld", "coverage-limitation")
    assert verifier["outcome"] == {"status": "withheld", "reason": "coverage-limitation", "passCount": 0}
    assert verifier["pass_count"] == 0
    assert verifier["withholding_reason"] == "coverage-limitation"
    assert type(verifier["latency_ms"]) is int
    assert verifier["coverage_policy_id"] == "bounded-policy-research-v1"
    assert verifier["supported"] is False and verifier["verifier_unavailable"] is False
    assert not _is_verifier_unavailable(verifier)

    # The gate's fixed message is the whole answer and the coverage issue.
    answer = extract_answer(stdout)
    assert answer == verifier["coverage_issue"]
    assert answer.startswith("I cannot establish the applicable MAGI income table")


@pytest.mark.parametrize("name", ["released-answer.txt", "gate-refusal.txt"])
def test_blocks_appear_once_and_in_the_order_the_parser_bounds_them(name):
    stdout = _stdout(name)
    positions = [stdout.index(marker) for marker in ("---EVIDENCE---", "---VERIFIER---", "---ANSWER---")]
    assert positions == sorted(positions)
    assert all(stdout.count(marker) == 1 for marker in ("---EVIDENCE---", "---VERIFIER---", "---ANSWER---"))
