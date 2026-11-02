"""Tests for the two-prompt answer judge. No request leaves the process."""

import json

import httpx
import pytest

from pipeline.eval import judge

REFERENCE = "REFERENCE-ANSWER-SENTINEL"
EVIDENCE = "--- Golden section: sec:doc:a:1 ---\nEVIDENCE-SENTINEL"


class FakeResponse:
    def __init__(self, text: str = "", *, status_code: int = 200, stop_reason: str = "end_turn", headers: dict | None = None):
        self._text = text
        self._stop_reason = stop_reason
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}", request=None, response=None
            )

    def json(self) -> dict:
        return {
            "content": [{"type": "text", "text": self._text}],
            "stop_reason": self._stop_reason,
        }


REFERENCE_OK = json.dumps({"factual_accuracy": 3, "completeness": 2, "overall": 2, "explanation": "matches"})
GROUNDING_OK = json.dumps({"hallucination": 1, "citation_quality": 3, "explanation": "one unsupported date"})


def fake_judge(monkeypatch, reference_reply, grounding_reply) -> list[str]:
    """Answer each prompt by which input it carries; return the prompts sent.

    A reply is a string, a FakeResponse, an exception to raise, or a list of
    those consumed one per attempt.
    """
    prompts: list[str] = []
    queues = {
        True: list(reference_reply) if isinstance(reference_reply, list) else [reference_reply],
        False: list(grounding_reply) if isinstance(grounding_reply, list) else [grounding_reply],
    }

    def post(url, *, json, headers, timeout):
        prompt = json["messages"][0]["content"]
        prompts.append(prompt)
        queue = queues[REFERENCE in prompt]
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, FakeResponse) else FakeResponse(reply)

    monkeypatch.setattr(judge, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(judge.httpx, "post", post)
    monkeypatch.setattr(judge, "_sleep", lambda seconds: None, raising=False)
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


def test_reply_with_a_preamble_is_parsed(monkeypatch):
    fake_judge(
        monkeypatch,
        'Here is my verdict: {"factual_accuracy": 2, "completeness": 2, "overall": 2, "explanation": "a {brace}"}',
        GROUNDING_OK,
    )

    assert run_judge()["factual_accuracy"] == 2


@pytest.mark.parametrize(
    "reply",
    [
        "I cannot score this.",
        '{"factual_accuracy": 3, "completeness": 3, "overall"',
        FakeResponse(REFERENCE_OK, stop_reason="max_tokens"),
        FakeResponse(REFERENCE_OK, stop_reason="refusal"),
        json.dumps({"factual_accuracy": "3", "completeness": 3, "overall": 3}),
        json.dumps({"factual_accuracy": 2.0, "completeness": 3, "overall": 3}),
        json.dumps({"factual_accuracy": True, "completeness": 3, "overall": 3}),
        json.dumps({"factual_accuracy": 10, "completeness": 3, "overall": 3}),
        json.dumps({"factual_accuracy": -1, "completeness": 3, "overall": 3}),
        json.dumps({"factual_accuracy": 3, "completeness": 3}),
        json.dumps([3, 3, 3]),
    ],
    ids=[
        "prose", "truncated", "max_tokens", "refusal", "string", "float",
        "boolean", "too-high", "negative", "missing-overall", "not-an-object",
    ],
)
def test_an_invalid_reply_is_a_judge_error_not_a_score(monkeypatch, reply):
    prompts = fake_judge(monkeypatch, reply, GROUNDING_OK)

    with pytest.raises(judge.JudgeError):
        run_judge()
    # Invalid output is not asked again, and the grounding call is not sent.
    assert len(prompts) == 1


def test_one_failed_call_leaves_the_question_unscored(monkeypatch):
    prompts = fake_judge(monkeypatch, REFERENCE_OK, "I cannot score this.")

    with pytest.raises(judge.JudgeError, match="not a JSON object"):
        run_judge()
    assert len(prompts) == 2


@pytest.mark.parametrize(
    "failure",
    [
        FakeResponse(status_code=529),
        FakeResponse(status_code=429),
        FakeResponse(status_code=500),
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("refused"),
    ],
    ids=["529", "429", "500", "timeout", "transport"],
)
def test_a_transient_failure_is_retried(monkeypatch, failure):
    prompts = fake_judge(monkeypatch, [failure, failure, REFERENCE_OK], GROUNDING_OK)

    assert run_judge()["overall"] == 2
    assert len(prompts) == judge.JUDGE_MAX_ATTEMPTS + 1


def test_retries_stop_at_the_attempt_budget(monkeypatch):
    prompts = fake_judge(monkeypatch, FakeResponse(status_code=529), GROUNDING_OK)

    with pytest.raises(judge.JudgeError, match="after 3 attempts: HTTP 529"):
        run_judge()
    assert len(prompts) == judge.JUDGE_MAX_ATTEMPTS == 3


def test_both_calls_have_their_own_attempt_budget(monkeypatch):
    overloaded = FakeResponse(status_code=529)
    prompts = fake_judge(
        monkeypatch,
        [overloaded, overloaded, REFERENCE_OK],
        [overloaded, overloaded, GROUNDING_OK],
    )

    assert run_judge()["hallucination"] == 1
    assert len(prompts) == 2 * judge.JUDGE_MAX_ATTEMPTS


@pytest.mark.parametrize("status", [400, 401, 403])
def test_a_rejected_request_is_not_retried(monkeypatch, status):
    prompts = fake_judge(monkeypatch, FakeResponse(status_code=status), GROUNDING_OK)

    with pytest.raises(httpx.HTTPStatusError):
        run_judge()
    assert len(prompts) == 1


def test_backoff_honours_retry_after_within_a_ceiling(monkeypatch):
    fake_judge(
        monkeypatch,
        [
            FakeResponse(status_code=429, headers={"retry-after": "7"}),
            FakeResponse(status_code=529, headers={"retry-after": "9999"}),
            REFERENCE_OK,
        ],
        [httpx.ReadTimeout("timed out"), GROUNDING_OK],
    )
    waits: list[float] = []
    monkeypatch.setattr(judge, "_sleep", waits.append)

    run_judge()

    assert waits == [7.0, judge.JUDGE_MAX_BACKOFF_SECS, judge.JUDGE_BACKOFF_SECS]


def test_the_calibrated_request_is_unchanged_and_the_successor_drops_temperature():
    messages = [{"role": "user", "content": "PROMPT"}]

    assert judge._request_body("claude-sonnet-4-6", "PROMPT") == {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1024,
        "temperature": 0,
        "messages": messages,
    }
    successor = judge._request_body("claude-sonnet-5-5", "PROMPT")
    assert "temperature" not in successor
    assert successor["model"] == "claude-sonnet-5-5"
    assert successor["messages"] == messages


def test_a_thinking_block_before_the_text_is_skipped(monkeypatch):
    class ThinkingFirst(FakeResponse):
        def json(self) -> dict:
            return {**super().json(), "content": [{"type": "thinking", "thinking": ""}, *super().json()["content"]]}

    fake_judge(monkeypatch, ThinkingFirst(REFERENCE_OK), GROUNDING_OK)

    assert run_judge()["overall"] == 2


def test_reference_is_not_presented_to_the_judge_as_verified():
    assert "verified correct" not in judge.REFERENCE_PROMPT
    assert "verified correct" not in judge.GROUNDING_PROMPT


def test_the_judge_model_can_be_selected_and_must_be_an_anthropic_model(monkeypatch):
    import importlib

    from pipeline import config

    try:
        monkeypatch.setenv("EVAL_JUDGE_MODEL", "claude-sonnet-4-6")
        assert importlib.reload(config).EVAL_JUDGE_MODEL == "claude-sonnet-4-6"
        monkeypatch.setenv("EVAL_JUDGE_MODEL", "  ")
        assert importlib.reload(config).EVAL_JUDGE_MODEL == "claude-sonnet-5-5"
        monkeypatch.setenv("EVAL_JUDGE_MODEL", "gpt-6.1-sol")
        with pytest.raises(ValueError, match="must be an Anthropic model id"):
            importlib.reload(config)
    finally:
        monkeypatch.delenv("EVAL_JUDGE_MODEL", raising=False)
        importlib.reload(config)


def test_the_reference_call_knows_the_date_and_leaves_extra_detail_to_the_grounding_call(monkeypatch):
    from datetime import datetime, timezone

    prompts: list[str] = []
    real_score = judge._score

    def capture(prompt, dimensions):
        prompts.append(prompt)
        return real_score(prompt, dimensions)

    fake_judge(monkeypatch, REFERENCE_OK, GROUNDING_OK)
    monkeypatch.setattr(judge, "_score", capture)

    run_judge()

    reference, grounding = prompts
    today = datetime.now(timezone.utc).date().isoformat()
    assert f"Today's date is {today}." in reference
    assert "Do not lower a score because a detail is absent from the reference" in reference
    # The grounding call has the evidence and is unchanged.
    assert "Today's date" not in grounding
