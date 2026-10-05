"""LLM-as-judge wrapper — calls Claude Sonnet via httpx to score agent answers."""

import json

import httpx

from pipeline.config import ANTHROPIC_API_KEY, EVAL_JUDGE_MODEL

API_URL = "https://api.anthropic.com/v1/messages"

REFERENCE_DIMENSIONS = ("factual_accuracy", "completeness", "overall")
GROUNDING_DIMENSIONS = ("hallucination", "citation_quality")

_JSON_ONLY = """Your response MUST be a single JSON object and NOTHING ELSE — no preamble, no markdown fences, no prose before or after the JSON. The judging harness parses your response as strict JSON."""

# Scores agreement with the reference. It carries no evidence, so the amount
# of text the agent retrieved cannot move these dimensions.
REFERENCE_PROMPT = """You are evaluating an AI agent's answer to a Medicaid policy question.

Question: {question}

Reference Answer (verified correct):
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
    merged = {
        **{dim: reference.get(dim) for dim in REFERENCE_DIMENSIONS},
        **{dim: grounding.get(dim) for dim in GROUNDING_DIMENSIONS},
        "explanation": (
            f"Reference: {reference.get('explanation', '')}\n"
            f"Grounding: {grounding.get('explanation', '')}"
        ),
    }
    if merged.get("overall") is None:
        # Some judge responses omit `overall` despite the prompt. Compute it
        # from the other reference dimensions, so evidence cannot move it.
        dims = [merged.get(k) for k in ("factual_accuracy", "completeness")]
        vals = [v for v in dims if isinstance(v, (int, float))]
        if vals:
            merged["overall"] = round(sum(vals) / len(vals))
    return merged


def _score(prompt: str, dimensions: tuple[str, ...]) -> dict:
    """Send one judge prompt and parse the JSON object it returns."""
    resp = httpx.post(
        API_URL,
        json={
            "model": EVAL_JUDGE_MODEL,
            "max_tokens": 1024,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        },
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    resp.raise_for_status()

    content = resp.json()["content"][0]["text"].strip()

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

    # Last resort: zeroes with raw text as explanation.
    return {
        **{dimension: 0 for dimension in dimensions},
        "explanation": f"JSON parse error. Raw response: {content[:300]}",
    }
