"""Tests for Voyage API retry/backoff behavior."""

import logging

import httpx
import pytest

from pipeline.embeddings import voyage_client


def _response(status_code: int, headers: dict | None = None, json_body: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code,
        headers=headers,
        json=json_body,
        request=httpx.Request("POST", voyage_client.API_URL),
    )


def _success_response(vectors: list[list[float]] | None = None) -> httpx.Response:
    vectors = vectors if vectors is not None else [[0.1, 0.2]]
    return _response(200, json_body={"data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)]})


class FakePost:
    """Returns (or raises) the queued outcomes in order."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def __call__(self, url, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class FakeSleeper:
    def __init__(self):
        self.delays: list[float] = []

    def __call__(self, seconds: float):
        self.delays.append(seconds)


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setattr(voyage_client, "VOYAGE_API_KEY", "test-key")


def test_embed_returns_vectors_on_first_success(monkeypatch):
    post = FakePost([_success_response([[1.0], [2.0]])])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    result = voyage_client.embed(["a", "b"], model="voyage-law-2", sleep=sleeper)

    assert result == [[1.0], [2.0]]
    assert post.calls == 1
    assert sleeper.delays == []


def test_embed_retries_429_and_honors_retry_after(monkeypatch):
    post = FakePost([
        _response(429, headers={"Retry-After": "7"}),
        _success_response(),
    ])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    result = voyage_client.embed(["a"], model="voyage-law-2", sleep=sleeper)

    assert result == [[0.1, 0.2]]
    assert post.calls == 2
    assert sleeper.delays == [7.0]


def test_embed_retries_5xx_with_exponential_backoff(monkeypatch):
    post = FakePost([
        _response(503),
        _response(500),
        _success_response(),
    ])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)
    # Pin jitter to the top of the range so delays equal the raw backoff
    monkeypatch.setattr(voyage_client.random, "random", lambda: 1.0)

    result = voyage_client.embed(["a"], model="voyage-law-2", sleep=sleeper)

    assert result == [[0.1, 0.2]]
    assert sleeper.delays == [
        voyage_client.BACKOFF_BASE_SECONDS,
        voyage_client.BACKOFF_BASE_SECONDS * 2,
    ]


def test_embed_retries_timeouts(monkeypatch):
    post = FakePost([
        httpx.ConnectTimeout("connect timed out"),
        httpx.ReadTimeout("read timed out"),
        _success_response(),
    ])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    result = voyage_client.embed(["a"], model="voyage-law-2", sleep=sleeper)

    assert result == [[0.1, 0.2]]
    assert post.calls == 3
    assert len(sleeper.delays) == 2


def test_embed_raises_after_exhausting_attempts(monkeypatch):
    post = FakePost([_response(429) for _ in range(5)])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    with pytest.raises(httpx.HTTPStatusError):
        voyage_client.embed(["a"], model="voyage-law-2", max_attempts=5, sleep=sleeper)

    assert post.calls == 5
    assert len(sleeper.delays) == 4  # no sleep after the final attempt


def test_embed_logs_retry_warning(monkeypatch, caplog):
    post = FakePost([_response(503), _success_response()])
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    with caplog.at_level(logging.WARNING, logger="pipeline.embeddings.voyage_client"):
        voyage_client.embed(["a"], model="voyage-law-2", sleep=FakeSleeper())

    messages = [r.getMessage() for r in caplog.records]
    assert any("voyage embed retry" in m and "attempt 1/5" in m for m in messages)


def test_embed_logs_error_on_exhaustion(monkeypatch, caplog):
    post = FakePost([_response(429) for _ in range(3)])
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    with caplog.at_level(logging.ERROR, logger="pipeline.embeddings.voyage_client"):
        with pytest.raises(httpx.HTTPStatusError):
            voyage_client.embed(["a"], model="voyage-law-2", max_attempts=3, sleep=FakeSleeper())

    messages = [r.getMessage() for r in caplog.records]
    assert any("failed after 3 attempts" in m for m in messages)


def test_embed_logs_non_retryable_status(monkeypatch, caplog):
    post = FakePost([_response(400)])
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    with caplog.at_level(logging.ERROR, logger="pipeline.embeddings.voyage_client"):
        with pytest.raises(httpx.HTTPStatusError):
            voyage_client.embed(["a"], model="voyage-law-2", sleep=FakeSleeper())

    messages = [r.getMessage() for r in caplog.records]
    assert any("non-retryable HTTP 400" in m for m in messages)


def test_embed_does_not_retry_client_errors(monkeypatch):
    post = FakePost([_response(400)])
    sleeper = FakeSleeper()
    monkeypatch.setattr(voyage_client.httpx, "post", post)

    with pytest.raises(httpx.HTTPStatusError):
        voyage_client.embed(["a"], model="voyage-law-2", sleep=sleeper)

    assert post.calls == 1
    assert sleeper.delays == []


def test_embed_requires_api_key(monkeypatch):
    monkeypatch.setattr(voyage_client, "VOYAGE_API_KEY", "")

    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY"):
        voyage_client.embed(["a"], model="voyage-law-2")


def test_retry_delay_falls_back_to_backoff_for_http_date_retry_after(monkeypatch):
    monkeypatch.setattr(voyage_client.random, "random", lambda: 1.0)

    delay = voyage_client._retry_delay(0, "Wed, 21 Oct 2026 07:28:00 GMT")

    assert delay == voyage_client.BACKOFF_BASE_SECONDS


def test_retry_delay_is_capped(monkeypatch):
    monkeypatch.setattr(voyage_client.random, "random", lambda: 1.0)

    assert voyage_client._retry_delay(20, None) == voyage_client.BACKOFF_MAX_SECONDS


def test_client_byte_bound_precedes_http(monkeypatch):
    monkeypatch.setattr(voyage_client.httpx, "post", lambda *a, **k: pytest.fail("HTTP called"))
    for texts in [["é" * 4501], ["x" * 9000] * 7]:
        with pytest.raises(ValueError, match="byte policy"):
            voyage_client.embed(texts, "voyage-4")


def test_response_order_and_truncation_flag(monkeypatch):
    def post(url, **kwargs):
        assert kwargs["json"]["truncation"] is False
        return _response(200, json_body={"data": [
            {"index": 1, "embedding": [2.]}, {"index": 0, "embedding": [1.]}]})
    monkeypatch.setattr(voyage_client.httpx, "post", post)
    assert voyage_client.embed(["a", "b"], "voyage-4") == [[1.], [2.]]


@pytest.mark.parametrize("indexes", [[0, 0], [0], [1, 2], [True, 0], [None, 1]])
def test_invalid_response_indexes_fail_without_retry(monkeypatch, indexes):
    post = FakePost([_response(200, json_body={"data": [
        {"index": i, "embedding": [1.]} for i in indexes]})])
    monkeypatch.setattr(voyage_client.httpx, "post", post)
    with pytest.raises(RuntimeError, match="indexes"):
        voyage_client.embed(["a", "b"], "voyage-4")
    assert post.calls == 1
