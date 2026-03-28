"""Thin Voyage AI API client using httpx.

Replaces the voyageai SDK which crashes on Python 3.14
due to pydantic v1/v2 incompatibility.
"""

import httpx

from pipeline.config import VOYAGE_API_KEY

API_URL = "https://api.voyageai.com/v1/embeddings"


def embed(
    texts: list[str],
    model: str,
    input_type: str = "document",
) -> list[list[float]]:
    """Embed texts via the Voyage API. Returns list of embedding vectors."""
    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")

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
