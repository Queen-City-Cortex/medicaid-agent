"""LLM-as-judge wrapper — calls Claude Sonnet via httpx to score agent answers."""

import json
import time
from datetime import datetime, timezone

import httpx

from pipeline.config import ANTHROPIC_API_KEY, EVAL_JUDGE_MODEL

API_URL = "https://api.anthropic.com/v1/messages"

# One question costs two judge calls (reference, then grounding). Each call
# gets this many HTTP attempts, so a question sends at most 2 x 3 requests.
JUDGE_MAX_ATTEMPTS = 3
JUDGE_BACKOFF_SECS = 2.0
JUDGE_MAX_BACKOFF_SECS = 30.0
# 429 (rate limit) and every 5xx, which includes Anthropic's 529 (overloaded).
# Other 4xx codes are not retried: a rejected credential or request fails the
# same way every time and must surface on the first call.
_RETRYABLE_STATUS = frozenset({429}) | frozenset(range(500, 600))
# Thresholds were set with this model and request shape. Any other model gets
# the successor shape and needs calibrating on stored rows first.
CALIBRATED_JUDGE_MODEL = "claude-sonnet-4-6"

_sleep = time.sleep


class JudgeError(RuntimeError):
    """The judge produced no usable score. The row is an error, never a zero."""

REFERENCE_DIMENSIONS = ("factual_accuracy", "completeness", "overall")
GROUNDING_DIMENSIONS = ("hallucination", "citation_quality")

_JSON_ONLY = """Your response MUST be a single JSON object and NOTHING ELSE — no preamble, no markdown fences, no prose before or after the JSON. The judging harness parses your response as strict JSON."""

# Scores agreement with the reference. It carries no evidence, so the amount
# of text the agent retrieved cannot move these dimensions. For the same
# reason it cannot tell a true detail from an invented one, and it does not
# know the date: on the first full candidate run it called correct 2026
# revision dates fabricated on four answers. The prompt gives it the date and
# leaves unsupported detail to the grounding call, which has the evidence.
REFERENCE_PROMPT = """You are evaluating an AI agent's answer to a Medicaid policy question.

Today's date is {today}. A date on or before today is in the past.

The reference answer states the key facts a correct answer needs. The agent's answer may add detail the reference does not mention, such as revision dates, section numbers or related provisions. The reference neither confirms nor contradicts that detail, and a separate check verifies it against the source documents. Do not lower a score because a detail is absent from the reference or because you cannot confirm it. Lower a score for a key fact that is missing, or for a statement that contradicts the reference.

Question: {question}

Reference Answer:
{golden_answer}

Agent's Answer:
{agent_answer}

Score each dimension 0-3:
- factual_accuracy: Does the agent's answer contain the same key facts as the reference? (0=wrong, 1=partially correct, 2=mostly correct, 3=fully correct)
- completeness: Does the answer address all parts of the question? (0=misses most, 1=partial, 2=mostly complete, 3=fully complete)
- overall: Would a Medicaid policy expert accept this answer? (0=unacceptable, 1=poor, 2=acceptable, 3=good)

""" + _JSON_ONLY + """

Respond with exactly this shape:
{{"factual_accuracy": N, "completeness": N, "overall": N, "explanation": "brief reasoning"}}"""

# Scores grounding. It carries no reference answer, so resemblance to the
# known-correct answer cannot stand in for support in the evidence.
GROUNDING_PROMPT = """You are checking whether an AI agent's answer to a Medicaid policy question is grounded in the evidence it had.

Question: {question}

Agent's Answer:
{agent_answer}

Evidence (curated golden-dataset sections plus structured graph data the
agent actually read via its tools — e.g. getAmendments, getDocument,
followReferences, resolveAnswerFrame). Every block starts with a header
line. `--- Golden section: <section id> ---` blocks are golden-dataset
section text; `--- Evidence: <toolName> → <key> ---` blocks come from tool
output:
{evidence_texts}

Score each dimension 0-3:
- hallucination: Does the answer assert facts not supported by the Evidence above? (0=major hallucination, 1=minor fabrications, 2=slight embellishment, 3=no hallucination).
    - Score strictly against the Evidence above, not your prior knowledge. A claim — including specific dates, quoted section text, amendment effective dates, section numbers, or cross-references — is supported only when a block states it.
    - Work out which policy or document each block belongs to from its header and text. A claim the answer attributes to a particular policy, document or section must be supported by a block from that same policy or document. The same wording found only in a block that belongs to a different policy does NOT support it; score such a claim as unsupported.
    - Claims wrapped in [unverified: ...] markers are explicitly flagged by the agent as unverified — this is honest disclosure, NOT hallucination. Score these as you would "I could not confirm this detail."
- citation_quality: Does the answer cite specific policy sections? (0=no citations, 1=vague references, 2=some specific citations, 3=precise section-level citations)

""" + _JSON_ONLY + """

Respond with exactly this shape:
{{"hallucination": N, "citation_quality": N, "explanation": "brief reasoning"}}"""


def judge_answer(
    question: str,
    golden_answer: str,
    agent_answer: str,
    evidence_texts: list[str],
) -> dict:
    """Score an agent answer with two judge calls and merge the results.

    The reference call sees the question, the golden reference and the answer;
    the grounding call sees the question, the answer and the evidence. Neither
    sees the other's input.

    Both calls must succeed. If either one runs out of attempts, is cut off or
    refused, or returns anything other than integer scores from 0 to 3 for
    its own dimensions, this raises JudgeError and the question has no scores
    at all: a row is never half judged. The grounding call is not sent when
    the reference call fails.

    Returns:
        {
            "factual_accuracy": 0-3,
            "completeness": 0-3,
            "hallucination": 0-3 (3 = no hallucination),
            "citation_quality": 0-3,
            "overall": 0-3,
            "explanation": "brief reasoning"
        }
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    evidence_block = "\n\n".join(evidence_texts) if evidence_texts else "(none available)"

    reference = _score(
        REFERENCE_PROMPT.format(
            question=question,
            golden_answer=golden_answer,
            agent_answer=agent_answer,
            today=datetime.now(timezone.utc).date().isoformat(),
        ),
        REFERENCE_DIMENSIONS,
    )
    grounding = _score(
        GROUNDING_PROMPT.format(
            question=question,
            agent_answer=agent_answer,
            evidence_texts=evidence_block,
        ),
        GROUNDING_DIMENSIONS,
    )

    # Each call contributes only its own dimensions, whatever else it returns.
    return {
        **{dim: reference[dim] for dim in REFERENCE_DIMENSIONS},
        **{dim: grounding[dim] for dim in GROUNDING_DIMENSIONS},
        "explanation": (
            f"Reference: {reference.get('explanation', '')}\n"
            f"Grounding: {grounding.get('explanation', '')}"
        ),
    }


def _request_body(model: str, prompt: str) -> dict:
    """The request for one judge prompt.

    The calibrated model keeps the request its thresholds were measured with.
    Later Claude models reject `temperature` and think before answering, so
    the successor shape drops it, pins the effort and leaves room for both.
    """
    messages = [{"role": "user", "content": prompt}]
    if model == CALIBRATED_JUDGE_MODEL:
        return {
            "model": model,
            "max_tokens": 1024,
            "temperature": 0,
            "messages": messages,
        }
    return {
        "model": model,
        "max_tokens": 16000,
        "output_config": {"effort": "low"},
        "messages": messages,
    }


def _retry_delay(response: httpx.Response | None, attempt: int) -> float:
    """Seconds to wait before the next attempt, honouring `retry-after`."""
    delay = JUDGE_BACKOFF_SECS * 2 ** (attempt - 1)
    if response is not None:
        try:
            delay = float(response.headers.get("retry-after", ""))
        except ValueError:
            pass
    return max(0.0, min(delay, JUDGE_MAX_BACKOFF_SECS))


def _post(prompt: str) -> dict:
    """Send one judge prompt, retrying transient failures within the budget."""
    for attempt in range(1, JUDGE_MAX_ATTEMPTS + 1):
        response = None
        try:
            response = httpx.post(
                API_URL,
                json=_request_body(EVAL_JUDGE_MODEL, prompt),
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                timeout=60,
            )
        except httpx.TransportError as exc:  # timeouts are transport errors
            failure = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code not in _RETRYABLE_STATUS:
                response.raise_for_status()
                return response.json()
            failure = f"HTTP {response.status_code}"
        if attempt == JUDGE_MAX_ATTEMPTS:
            raise JudgeError(
                f"Judge request failed after {JUDGE_MAX_ATTEMPTS} attempts: {failure}"
            )
        _sleep(_retry_delay(response, attempt))
    raise AssertionError("unreachable")


def _score(prompt: str, dimensions: tuple[str, ...]) -> dict:
    """Send one judge prompt and return its validated scores."""
    body = _post(prompt)
    # A reply cut off at max_tokens or refused is not a score, even when the
    # text so far happens to parse.
    stop_reason = body.get("stop_reason")
    if stop_reason != "end_turn":
        raise JudgeError(f"Judge reply did not finish (stop_reason={stop_reason})")
    # Models that think first return a thinking block before the text block.
    content = next(
        (
            block.get("text", "")
            for block in body.get("content") or []
            if isinstance(block, dict) and block.get("type") == "text"
        ),
        "",
    ).strip()

    parsed = _parse_object(content, dimensions)
    if parsed is None:
        raise JudgeError(f"Judge reply is not a JSON object: {content[:300]}")
    invalid = [
        f"{dim}={parsed.get(dim, 'missing')!r}"
        for dim in dimensions
        # `type(...) is int` also rejects booleans and numeric strings.
        if type(parsed.get(dim)) is not int or not 0 <= parsed[dim] <= 3
    ]
    if invalid:
        raise JudgeError(
            f"Judge scores must be integers from 0 to 3: {', '.join(invalid)}"
        )
    return parsed


def _parse_object(content: str, dimensions: tuple[str, ...]) -> dict | None:
    """The JSON object in a judge reply, or None when there is none."""
    # Strip markdown code fences if present
    if content.startswith("```"):
        lines = content.splitlines()
        content = "\n".join(lines[1:-1]) if len(lines) > 2 else content

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Fallback: walk every `{` in the response and try to extract the first
    # balanced object that parses as valid JSON. Handles the common case
    # where the judge emits a markdown preamble followed by a JSON object
    # whose "explanation" field contains braces/quotes.
    for start in (i for i, ch in enumerate(content) if ch == "{"):
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(content)):
            ch = content[i]
            if escape:
                escape = False
                continue
            if in_string:
                if ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = content[start : i + 1]
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict) and dimensions[0] in parsed:
                            return parsed
                    except json.JSONDecodeError:
                        pass
                    break

    return None
