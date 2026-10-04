from contextlib import contextmanager

import pytest

from pipeline.embeddings import generator


class FakeResult:
    def __init__(self, records):
        self.records = records

    def __iter__(self):
        return iter(self.records)

    def consume(self):
        return None

    def single(self):
        return self.records[0] if self.records else None


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def execute_write(self, fn):
        return fn(self)

    def run(self, query, parameters=None, **kwargs):
        self.calls.append((query, parameters or kwargs))
        return FakeResult(self.results.pop(0))


def session_factory(session):
    @contextmanager
    def get_session(**_options):
        yield session

    return get_session


def test_build_embedding_texts_batches_section_reads(monkeypatch):
    session = FakeSession(
        [[
            {
                "section_id": "sec:1",
                "documents": [{"id":"doc", "title":"Manual", "family":"dhhs_policy"}],
                "source_epoch": "rev",
                "section_title": "Eligibility",
                "body": "Must qualify.",
                "ancestors": [{"id":"parent", "title":"Coverage"}],
            },
            {
                "section_id": "sec:2",
                "documents": [{"id":"doc", "title":"Manual", "family":"dhhs_policy"}],
                "source_epoch": "rev",
                "section_title": "Limits",
                "body": "Two per year.",
                "ancestors": [],
            },
        ]]
    )
    monkeypatch.setattr(generator, "get_session", session_factory(session))

    texts = {sid: heading + "\n" + body for sid,heading,body,_epoch in generator.iter_section_contexts(["sec:1", "sec:2"])}

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
        [[True,False],[0.1,0.2]],
        [[0,0],[0.1,0.2]],
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
            ["plan", "plan"],
        )

    assert stats == {"embedded": 0, "errors": 2}


def test_flush_batch_writes_valid_embeddings_in_one_batch(monkeypatch):
    session = FakeSession([[{"written": 2}]])
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
        ["plan", "plan"],
    )

    assert stats == {"embedded": 2, "errors": 0}
    assert session.calls[0][1] == {
        "rows": [
            {"id": "sec:1", "embedding": [0.1, 0.2], "plan": "plan"},
            {"id": "sec:2", "embedding": [0.3, 0.4], "plan": "plan"},
        ]
    }


def test_validate_embedding_coverage_is_fatal(monkeypatch):
    monkeypatch.setattr(generator, "embedding_coverage", lambda *_: {"total":12,"covered":11})

    with pytest.raises(
        RuntimeError, match="Embedding coverage incomplete: 11/12"
    ):
        generator.validate_embedding_coverage()


def test_embed_all_requires_voyage_credentials(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "")

    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY not set"):
        generator.embed_all()


def test_flush_batch_rejects_changed_plan_or_missing_target(monkeypatch):
    session = FakeSession([[{"written":0}]])
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(generator, "voyage_embed", lambda *_args, **_kwargs: [[0.1,0.2]])
    monkeypatch.setattr(generator, "get_session", session_factory(session))
    stats = {"embedded":0, "errors":0}
    with pytest.raises(RuntimeError, match="plan changed"):
        generator._flush_batch("voyage-4", ["s"], ["body"], ["section"], stats, ["old-plan"])
    assert stats == {"embedded":0, "errors":1}
    assert "n.embedding_plan_hash=row.plan" in session.calls[0][0]


def test_full_preflight_rejects_later_invalid_heading_before_writes_or_provider(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "fake")
    monkeypatch.setattr(generator, "validate_plan_topology", lambda: None)
    monkeypatch.setattr(generator, "iter_section_contexts", lambda: iter([("ok","h","body","revision-1"),("bad","x"*9000,"body","revision-1")]))
    original = generator.plan_inputs
    monkeypatch.setattr(generator, "plan_inputs", lambda heading,body,model: original(heading,body,model,counter=lambda *_: 1))
    monkeypatch.setattr(generator, "persist_plan", lambda *_: pytest.fail("Graph mutated"))
    monkeypatch.setattr(generator, "voyage_embed", lambda *_args,**_kwargs: pytest.fail("Provider called"))
    with pytest.raises(ValueError, match="heading"):
        generator.embed_all("voyage-4")
