"""Tests for the two-prompt answer judge. No request leaves the process."""

import json

from pipeline.eval import judge

REFERENCE = "REFERENCE-ANSWER-SENTINEL"
EVIDENCE = "--- Golden section: sec:doc:a:1 ---\nEVIDENCE-SENTINEL"


class FakeResponse:
    def __init__(self, text: str):
        self._text = text

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"content": [{"text": self._text}]}


def fake_judge(monkeypatch, reference_reply: str, grounding_reply: str) -> list[str]:
    """Answer each prompt by which input it carries; return the prompts sent."""
    prompts: list[str] = []

    def post(url, *, json, headers, timeout):
        prompt = json["messages"][0]["content"]
        prompts.append(prompt)
        return FakeResponse(reference_reply if REFERENCE in prompt else grounding_reply)

    monkeypatch.setattr(judge, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(judge.httpx, "post", post)
    return prompts


def run_judge() -> dict:
    return judge.judge_answer(
        question="Is the service covered?",
        golden_answer=REFERENCE,
        agent_answer="AGENT-ANSWER-SENTINEL",
        evidence_texts=[EVIDENCE],
    )


def test_reference_and_grounding_are_scored_by_separate_prompts(monkeypatch):
    prompts = fake_judge(
        monkeypatch,
        json.dumps({"factual_accuracy": 3, "completeness": 2, "overall": 2, "explanation": "matches"}),
        # A stray `overall` from the grounding call must not replace the
        # reference call's score.
        json.dumps({"hallucination": 1, "citation_quality": 3, "overall": 0, "explanation": "one unsupported date"}),
    )

    scores = run_judge()

    assert len(prompts) == 2
    reference_prompt = next(p for p in prompts if REFERENCE in p)
    grounding_prompt = next(p for p in prompts if REFERENCE not in p)
    # The reference call has no evidence; the grounding call has no reference.
    assert "EVIDENCE-SENTINEL" not in reference_prompt
    assert "EVIDENCE-SENTINEL" in grounding_prompt
    assert all("AGENT-ANSWER-SENTINEL" in p for p in prompts)
    assert "hallucination" not in reference_prompt
    assert "factual_accuracy" not in grounding_prompt
    assert {k: scores[k] for k in judge.REFERENCE_DIMENSIONS + judge.GROUNDING_DIMENSIONS} == {
        "factual_accuracy": 3,
        "completeness": 2,
        "overall": 2,
        "hallucination": 1,
        "citation_quality": 3,
    }
    assert "matches" in scores["explanation"]
    assert "one unsupported date" in scores["explanation"]


def test_grounding_prompt_requires_support_from_the_cited_policy():
    assert "appears anywhere in Evidence" not in judge.GROUNDING_PROMPT
    assert "treat it as supported" not in judge.GROUNDING_PROMPT
    assert "must be supported by a block from that same policy" in judge.GROUNDING_PROMPT
    assert "{golden_answer}" not in judge.GROUNDING_PROMPT
    assert "{evidence_texts}" not in judge.REFERENCE_PROMPT


def test_missing_overall_falls_back_to_the_reference_dimension_mean(monkeypatch):
    fake_judge(
        monkeypatch,
        json.dumps({"factual_accuracy": 3, "completeness": 3, "explanation": "ok"}),
        # Grounding scores must not move a reference dimension.
        json.dumps({"hallucination": 0, "citation_quality": 0, "explanation": "ok"}),
    )

    assert run_judge()["overall"] == 3


def test_preamble_and_unparseable_replies_are_handled_per_prompt(monkeypatch):
    fake_judge(
        monkeypatch,
        'Here is my verdict: {"factual_accuracy": 2, "completeness": 2, "overall": 2, "explanation": "a {brace}"}',
        "I cannot score this.",
    )

    scores = run_judge()

    assert scores["factual_accuracy"] == 2
    assert scores["overall"] == 2
    assert scores["hallucination"] == 0
    assert scores["citation_quality"] == 0
    assert "JSON parse error" in scores["explanation"]
