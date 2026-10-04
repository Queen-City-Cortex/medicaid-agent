from contextlib import contextmanager
import pytest
from pipeline.embeddings import generator, plan_graph
from pipeline.embeddings.chunker import plan_inputs


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def single(self):
        return self.rows[0] if self.rows else None

    def consume(self):
        return None


class FakeSession:
    def __init__(self, counts=()):
        self.counts, self.calls = list(counts), []

    def run(self, query, parameters=None, **kwargs):
        self.calls.append((query, parameters or kwargs))
        return FakeResult([self.counts.pop(0)] if self.counts else [])

    def execute_write(self, action):
        return action(self)


def session_factory(session):
    @contextmanager
    def get_session():
        yield session

    return get_session


def test_requires_credentials(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "")
    with pytest.raises(RuntimeError, match="VOYAGE_API_KEY"):
        generator.embed_all()


def test_legacy_vectors_refused_before_provider_or_mutation(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "test")
    session = FakeSession([{"total": 1}])
    monkeypatch.setattr(generator, "get_session", session_factory(session))
    monkeypatch.setattr(
        generator, "voyage_embed", lambda *a, **k: pytest.fail("provider")
    )
    with pytest.raises(RuntimeError, match="Unversioned"):
        generator.embed_all()
    assert len(session.calls) == 1


@pytest.mark.parametrize("vectors", [[[0.1]], [[0.1, float("nan")]], [[True, 0.1]], []])
def test_invalid_vectors_never_written(monkeypatch, vectors):
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(generator, "voyage_embed", lambda *a, **k: vectors)
    monkeypatch.setattr(generator, "get_session", lambda: pytest.fail("write"))
    with pytest.raises(RuntimeError, match="invalid embedding"):
        generator._flush_batch("model", [{"text": "x"}], {"embedded": 0})


def test_guarded_write_mismatch_fails(monkeypatch):
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(generator, "voyage_embed", lambda *a, **k: [[0.0, 1.0]])
    session = FakeSession([{"written": 0}])
    monkeypatch.setattr(generator, "get_session", session_factory(session))
    with pytest.raises(RuntimeError, match="plan changed"):
        generator._flush_batch(
            "model",
            [{"id": "s", "kind": "section", "text": "x", "fingerprint": "abc"}],
            {"embedded": 0},
        )
    assert "n.embedding_fingerprint = row.fingerprint" in session.calls[0][0]


def test_coverage_is_fatal(monkeypatch):
    monkeypatch.setattr(
        generator, "embedding_coverage", lambda **kw: {"covered": 11, "total": 12}
    )
    with pytest.raises(RuntimeError, match="11/12"):
        generator.validate_embedding_coverage()


def test_batch_bounds_and_context_routing(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "test")
    monkeypatch.setattr(generator, "get_session", session_factory(FakeSession()))
    rows = [
        {"section_id": f"s{i}", "body": "x" * 8999, "context": "Heading\n"}
        for i in range(9)
    ]
    monkeypatch.setattr(generator, "iter_sections", lambda: iter(rows))
    monkeypatch.setattr(generator, "stored_inputs", lambda sid: [])
    persisted = []
    monkeypatch.setattr(
        generator, "_persist_plan", lambda sid, parts, *a: persisted.append(parts)
    )
    monkeypatch.setattr(generator, "validate_embedding_coverage", lambda *a: (9, 9))
    batches = []

    def flush(model, items, stats):
        if items:
            assert sum(len(i["text"].encode()) for i in items) <= 60000
            batches.append(list(items))
            stats["embedded"] += len(items)

    monkeypatch.setattr(generator, "_flush_batch", flush)
    assert generator.embed_all()["embedded"] == 18
    assert len(batches) >= 2
    assert all(part.kind == "chunk" for parts in persisted for part in parts)


def stored_plan(parts):
    return [
        {
            "id": plan_graph.input_id("s", p),
            "kind": p.kind,
            "text": p.text if p.kind == "chunk" else None,
            "fingerprint": p.fingerprint("model", 2),
            "vector": [0.0, 1.0],
        }
        for p in parts
    ]


def test_coverage_requires_every_index_even_for_identical_chunks():
    parts = list(plan_inputs("A" * 20000))
    stored = stored_plan(parts)
    check = lambda rows: plan_graph.plan_matches(
        "s", parts, rows, "model", 2, require_vectors=True
    )
    assert check(stored)
    assert not check(stored[:-1])
    assert not check(stored + [stored[0]])
    assert not check(
        stored
        + [{"id": "s", "kind": "section", "fingerprint": "old", "vector": [0.0, 1.0]}]
    )
    stored[0]["text"] = "changed"
    assert not check(stored)


def test_changed_context_or_model_invalidates_completed_plan():
    parts = list(plan_inputs("body", "old\n"))
    stored = stored_plan(parts)
    assert not plan_graph.plan_matches(
        "s",
        list(plan_inputs("body", "new\n")),
        stored,
        "model",
        2,
        require_vectors=False,
    )
    assert not plan_graph.plan_matches(
        "s", parts, stored, "other-model", 2, require_vectors=False
    )


def test_release_gate_uses_shared_coverage(monkeypatch):
    from pipeline import release
    from pipeline.graph import connection

    session = FakeSession(
        [
            {"total": 1, "with_id": 1, "distinct_ids": 1, "source_types": []},
            {"invalid": 0},
        ]
    )
    monkeypatch.setattr(connection, "get_session", session_factory(session))
    calls = []

    def coverage(**kw):
        calls.append(kw)
        return {"total": 12, "covered": 11}

    monkeypatch.setattr(plan_graph, "embedding_coverage", coverage)
    result = release.inspect_release_graph(2)
    assert result["embeddedSections"] == 11 and result["embeddingCoverage"] == 11 / 12
    assert calls == [{"dimensions": 2}]
