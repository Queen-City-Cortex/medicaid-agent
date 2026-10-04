"""Pinned, validated HTTP adapter; offline retries belong to the budgeted caller."""
from __future__ import annotations

import hashlib
import json
import math
import time
from pathlib import Path

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import httpx

MODEL = "jev-1.13.0"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"
SPEC_PATH = Path(__file__).resolve().parents[4] / "policy-corpus/src/jev/questions.json"


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def question_spec() -> dict:
    return json.loads(SPEC_PATH.read_text())


class JevError(ValueError):
    def __init__(self, code: str, status: int | None = None):
        super().__init__(f"jev_{code}")
        self.code = code
        self.status = status


def probability(value) -> bool:
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1


def validate_response(value, questions: dict) -> dict:
    try:
        if value["model"] != MODEL or set(value["answers"]) != set(questions):
            raise ValueError()
        for key, question in questions.items():
            answer = value["answers"][key]
            if answer["type"] != question["type"]:
                raise ValueError()
            if question["type"] == "noul":
                if not probability(answer["noul"]):
                    raise ValueError()
            else:
                ps = answer["probabilities"]
                if set(ps) != set(question["criteria"]) or not all(map(probability, ps.values())):
                    raise ValueError()
                selected = ps[answer["choice"]]
                if (abs(sum(ps.values()) - 1) > .001 or not probability(answer["confidence"])
                        or selected < max(ps.values()) - .001):
                    raise ValueError()
        if any(type(value["usage"][key]) is not int or value["usage"][key] < 0
               for key in ("input_tokens", "output_tokens")):
            raise ValueError()
        return value
    except (KeyError, TypeError, ValueError, AttributeError):
        raise JevError("response") from None


def request_body(state: str, questions: dict) -> dict:
    body = {"model": MODEL, "state": state, "questions": questions}
    if not state.strip() or len(canonical(body).encode()) > 30_000:
        raise JevError("input")
    return body


def classify(state: str, questions: dict, *, api_key: str, timeout: float = 15,
             client: httpx.Client | None = None) -> dict:
    import httpx
    if not api_key.strip():
        raise JevError("credentials")
    body = request_body(state, questions)
    started = time.monotonic()
    owns_client = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=False)
    try:
        response = client.post(ENDPOINT, json=body, headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout)
        if response.status_code != 200:
            raise JevError("http", response.status_code)
        result = validate_response(response.json(), questions)
        return {"response": result, "inputHash": digest(state), "specHash": digest(questions),
                "latencyMs": (time.monotonic() - started) * 1000}
    except httpx.TimeoutException:
        raise JevError("deadline") from None
    except (httpx.HTTPError, json.JSONDecodeError):
        raise JevError("network") from None
    finally:
        if owns_client:
            client.close()
