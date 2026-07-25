from contextlib import contextmanager

import pytest

from pipeline.embeddings import generator


class FakeResult:
    def __init__(self, records):
        self.records = records

    def __iter__(self):
        return iter(self.records)

    def single(self):
        return self.records[0] if self.records else None


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def run(self, query, parameters=None):
        self.calls.append((query, parameters))
        return FakeResult(self.results.pop(0))


def session_factory(session):
    @contextmanager
    def get_session():
        yield session

    return get_session


def test_build_embedding_texts_batches_section_reads(monkeypatch):
    session = FakeSession(
        [[
            {
                "sid": "sec:1",
                "doc_title": "Manual",
                "sec_title": "Eligibility",
                "content": "Must qualify.",
                "ancestor_titles": ["Coverage"],
            },
            {
                "sid": "sec:2",
                "doc_title": "Manual",
                "sec_title": "Limits",
                "content": "Two per year.",
                "ancestor_titles": [],
            },
        ]]
    )
    monkeypatch.setattr(generator, "get_session", session_factory(session))

    texts = generator.build_embedding_texts(["sec:1", "sec:2"])

    assert texts == {
        "sec:1": "Manual > Coverage > Eligibility\nMust qualify.",
        "sec:2": "Manual > Limits\nTwo per year.",
    }
    assert len(session.calls) == 1
    assert "UNWIND $section_ids" in session.calls[0][0]
    assert session.calls[0][1] == {"section_ids": ["sec:1", "sec:2"]}


@pytest.mark.parametrize(
    "embeddings",
    [
        [[0.1, 0.2]],
        [[0.1], [0.2]],
        [[0.1, float("nan")], [0.2, 0.3]],
    ],
)
def test_flush_batch_rejects_invalid_provider_output(monkeypatch, embeddings):
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(generator, "voyage_embed", lambda *args, **kwargs: embeddings)
    stats = {"embedded": 0, "errors": 0}

    with pytest.raises(RuntimeError):
        generator._flush_batch(
            "test-model",
            ["sec:1", "sec:2"],
            ["one", "two"],
            ["section", "section"],
            stats,
        )

    assert stats == {"embedded": 0, "errors": 2}


def test_flush_batch_writes_valid_embeddings_in_one_batch(monkeypatch):
    session = FakeSession([[]])
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(
        generator,
        "voyage_embed",
        lambda *args, **kwargs: [[0.1, 0.2], [0.3, 0.4]],
    )
    monkeypatch.setattr(generator, "get_session", session_factory(session))
    stats = {"embedded": 0, "errors": 0}

    generator._flush_batch(
        "test-model",
        ["sec:1", "sec:2"],
        ["one", "two"],
        ["section", "section"],
        stats,
    )

    assert stats == {"embedded": 2, "errors": 0}
    assert session.calls[0][1] == {
        "rows": [
            {"id": "sec:1", "embedding": [0.1, 0.2]},
            {"id": "sec:2", "embedding": [0.3, 0.4]},
        ]
    }


def test_validate_embedding_coverage_is_fatal(monkeypatch):
    session = FakeSession([[{"total": 12, "covered": 11}]])
    monkeypatch.setattr(generator, "get_session", session_factory(session))

    with pytest.raises(
        RuntimeError, match="Embedding coverage incomplete: 11/12"
    ):
        generator.validate_embedding_coverage()


def test_embed_all_requires_voyage_credentials(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "")

    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY not set"):
        generator.embed_all()
