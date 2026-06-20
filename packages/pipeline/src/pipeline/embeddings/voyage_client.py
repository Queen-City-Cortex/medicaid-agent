"""Thin Voyage AI API client using httpx.

Replaces the voyageai SDK which crashes on Python 3.14
due to pydantic v1/v2 incompatibility.
"""

import logging
import random
import time
from typing import Callable

import httpx

from pipeline.config import VOYAGE_API_KEY

logger = logging.getLogger(__name__)

API_URL = "https://api.voyageai.com/v1/embeddings"

MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 30.0


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


def _retry_delay(attempt: int, retry_after: str | None) -> float:
    """Seconds to wait before the next attempt.

    Honors a numeric Retry-After header when present; otherwise uses
    exponential backoff with jitter (50-100% of the capped backoff).
    """
    if retry_after is not None:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass  # HTTP-date Retry-After — fall back to backoff

    capped = min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ** attempt))
    return capped * (0.5 + random.random() / 2)


def embed(
    texts: list[str],
    model: str,
    input_type: str = "document",
    *,
    max_attempts: int = MAX_ATTEMPTS,
    sleep: Callable[[float], None] = time.sleep,
) -> list[list[float]]:
    """Embed texts via the Voyage API. Returns list of embedding vectors.

    Retries 429/5xx responses and timeouts with bounded exponential backoff,
    honoring Retry-After when present. Non-retryable HTTP errors raise
    immediately; the last error is raised once attempts are exhausted.
    """
    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")
    if max_attempts < 1:
        raise ValueError("max_attempts must be >= 1")

    last_error: Exception = RuntimeError("unreachable")
    for attempt in range(max_attempts):
        retry_after: str | None = None
        try:
            resp = httpx.post(
                API_URL,
                json={"input": texts, "model": model, "input_type": input_type},
                headers={
                    "Authorization": f"Bearer {VOYAGE_API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=120,
            )
            resp.raise_for_status()
            return [d["embedding"] for d in resp.json()["data"]]
        except httpx.TimeoutException as exc:
            last_error = exc
        except httpx.HTTPStatusError as exc:
            if not _is_retryable_status(exc.response.status_code):
                # 4xx (other than 429) won't get better on retry — surface the
                # status so a bad key / model name is debuggable, then re-raise.
                logger.error("voyage embed: non-retryable HTTP %d", exc.response.status_code)
                raise
            last_error = exc
            retry_after = exc.response.headers.get("Retry-After")

        if attempt + 1 < max_attempts:
            delay = _retry_delay(attempt, retry_after)
            logger.warning(
                "voyage embed retry: attempt %d/%d failed (%s), waiting %.1fs",
                attempt + 1,
                max_attempts,
                type(last_error).__name__,
                delay,
            )
            sleep(delay)

    logger.error("voyage embed failed after %d attempts: %s", max_attempts, last_error)
    raise last_error
