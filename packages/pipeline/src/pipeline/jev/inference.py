"""Paid offline calls always pass through the campaign ledger."""
import os
import time

from pipeline.jev.budget import Ledger
from pipeline.jev.client import MODEL, JevError, canonical, classify, digest, request_body

# Verified public rate; explicit confirmation prevents silently using stale rates.
INPUT_USD_PER_MILLION = .042


def budgeted_classify(state: str, questions: dict, ledger: Ledger, *, attempts: int = 3) -> dict:
    key = os.environ.get("TYPESAFE_API_KEY", "")
    if not key:
        raise JevError("credentials")
    if os.environ.get("JEV_CONFIRMED_INPUT_USD_PER_MILLION") != "0.042":
        raise ValueError("Confirm current pinned-model pricing with JEV_CONFIRMED_INPUT_USD_PER_MILLION=0.042")
    body = request_body(state, questions)
    # Reserve the published context ceiling with extra per-question/framing margin.
    max_tokens = 64_000 * (len(questions) + 1) + 4096
    for attempt in range(attempts):
        reservation = ledger.reserve("typesafe", MODEL, digest(body), max_tokens * INPUT_USD_PER_MILLION / 1_000_000)
        try:
            result = classify(state, questions, api_key=key)
            usage = result["response"]["usage"]
            ledger.settle(reservation, usage["input_tokens"] * INPUT_USD_PER_MILLION / 1_000_000, canonical(usage))
            result["reservationId"] = reservation
            return result
        except JevError as error:
            if attempt + 1 == attempts or error.code != "http" or error.status not in {429, 500, 502, 503, 504, 529}:
                raise
            # Failed attempts retain their entire reservation, even if provider may not charge.
            time.sleep(min(2 ** attempt, 4))
    raise AssertionError("unreachable")
