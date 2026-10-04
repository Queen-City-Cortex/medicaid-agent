"""Real Neo4j plan persistence, guarded writes and release coverage. Mocked Voyage."""

import os
import pytest
from pipeline.embeddings import generator, plan_graph
from pipeline.embeddings.chunker import plan_inputs
from pipeline.graph.connection import get_session, close_driver

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_EMBEDDING_INTEGRATION") != "1",
    reason="Requires a dedicated empty embedding test graph",
)
PREFIX = "embedding-repair-integration:"


@pytest.fixture(autouse=True)
def fixture_graph():
    with get_session() as session:
        count = session.run("MATCH (n) RETURN count(n) AS n").single()["n"]
        assert count == 0, "Embedding integration requires an empty dedicated graph"
        session.run(
            """CREATE (d:Document {id:$d, title:'Manual', document_type:'bulletin'})
        CREATE (a:Section {id:$a, title:'Repeated', content_text:''})
        CREATE (b:Section {id:$b, title:'Repeated', content_text:''})
        CREATE (s:Section {id:$s, title:'Leaf', content_text:$body})
        CREATE (d)-[:HAS_SECTION]->(a), (d)-[:HAS_SECTION]->(b), (d)-[:HAS_SECTION]->(s)
        CREATE (a)-[:PARENT_OF]->(b), (b)-[:PARENT_OF]->(s)""",
            d=PREFIX + "d",
            a=PREFIX + "a",
            b=PREFIX + "b",
            s=PREFIX + "s",
            body="x " * 12000,
        ).consume()
    yield
    with get_session() as session:
        session.run(
            "MATCH (n) WHERE n.id STARTS WITH $prefix DETACH DELETE n", prefix=PREFIX
        ).consume()
    close_driver()


def test_end_to_end_resume_replacement_and_missing_tail(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "mock-only")
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    rows = list(plan_graph.iter_sections())
    leaf = next(r for r in rows if r["section_id"].endswith(":s"))
    assert leaf["context"] == "Manual > Repeated > Repeated > Leaf\n"
    calls = []

    def provider(texts, **kw):
        calls.append(texts)
        return [[0.0, 1.0] for _ in texts]

    monkeypatch.setattr(generator, "voyage_embed", provider)
    # generator validation uses config dimensions; make its shared validator explicit.
    monkeypatch.setattr(
        generator,
        "validate_embedding_coverage",
        lambda model: plan_graph.embedding_coverage(model, 2),
    )
    first = generator.embed_all("mock-model")
    assert first["embedded"] > 1
    assert plan_graph.embedding_coverage("mock-model", 2)["covered"] == 1
    assert generator.embed_all("mock-model")["embedded"] == 0
    assert len(calls) == 1
    with get_session() as session:
        session.run(
            'MATCH (s:Section {id:$id}) SET s.title="New", s.content_text="short"',
            id=PREFIX + "s",
        ).consume()
    generator.embed_all("mock-model")
    with get_session() as session:
        assert session.run("MATCH (ch:Chunk) RETURN count(ch) AS n").single()["n"] == 0
        session.run(
            "MATCH (s:Section {id:$id}) SET s.content_text=$body",
            id=PREFIX + "s",
            body="A" * 20000,
        ).consume()
    generator.embed_all("mock-model")
    with get_session() as session:
        session.run(
            "MATCH (ch:Chunk {id:$id}) DETACH DELETE ch", id=PREFIX + "s:chunk:2"
        ).consume()
    assert plan_graph.embedding_coverage("mock-model", 2)["covered"] == 0
    # Replanning replaces the incomplete chunk set and resumes only the new plan.
    assert generator.embed_all("mock-model")["embedded"] == 3
    assert plan_graph.embedding_coverage("mock-model", 2)["covered"] == 1


def test_ambiguous_ancestors_rejected():
    with get_session() as session:
        session.run(
            "MATCH (a:Section {id:$a}), (s:Section {id:$s}) CREATE (a)-[:PARENT_OF]->(s)",
            a=PREFIX + "a",
            s=PREFIX + "s",
        ).consume()
    with pytest.raises(ValueError, match="Ambiguous"):
        list(plan_graph.iter_sections())


def test_stale_and_extra_paths_fail_coverage(monkeypatch):
    row = next(r for r in plan_graph.iter_sections() if r["body"])
    parts = list(plan_inputs(row["body"], row["context"]))
    generator._persist_plan(row["section_id"], parts, "mock", 2)
    with get_session() as session:
        session.run("MATCH (ch:Chunk) SET ch.embedding=[0.0,1.0]").consume()
    assert plan_graph.embedding_coverage("mock", 2)["covered"] == 1
    with get_session() as session:
        session.run(
            'MATCH (s:Section {id:$id}) SET s.embedding=[0.0,1.0], s.embedding_fingerprint="extra"',
            id=row["section_id"],
        ).consume()
    assert plan_graph.embedding_coverage("mock", 2)["covered"] == 0


def test_partial_provider_failure_resumes_only_remaining_inputs(monkeypatch):
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "mock-only")
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(
        generator,
        "validate_embedding_coverage",
        lambda model: plan_graph.embedding_coverage(model, 2),
    )
    with get_session() as session:
        session.run(
            "MATCH (s:Section {id:$id}) SET s.content_text=$body",
            id=PREFIX + "s",
            body="A" * 130000,
        ).consume()
    attempts = []

    def fail_second(texts, **kwargs):
        attempts.append(len(texts))
        if len(attempts) == 2:
            raise RuntimeError("simulated second-batch failure")
        return [[0.0, 1.0] for _ in texts]

    monkeypatch.setattr(generator, "voyage_embed", fail_second)
    with pytest.raises(RuntimeError, match="second-batch"):
        generator.embed_all("mock")
    with get_session() as session:
        completed = session.run(
            "MATCH (ch:Chunk) WHERE ch.embedding IS NOT NULL RETURN count(ch) AS n"
        ).single()["n"]
        total = session.run("MATCH (ch:Chunk) RETURN count(ch) AS n").single()["n"]
    assert completed == 6 and total == 15
    resumed = []

    def complete(texts, **kwargs):
        resumed.extend(texts)
        return [[0.0, 1.0] for _ in texts]

    monkeypatch.setattr(generator, "voyage_embed", complete)
    assert generator.embed_all("mock")["embedded"] == 9
    assert len(resumed) == 9
    assert plan_graph.embedding_coverage("mock", 2)["covered"] == 1


@pytest.mark.parametrize(
    "fault", ["cycle", "no_document", "two_documents", "missing_id"]
)
def test_bad_context_topology_is_rejected(fault):
    with get_session() as session:
        if fault == "cycle":
            session.run(
                "MATCH (a:Section {id:$a}), (b:Section {id:$b}) CREATE (b)-[:PARENT_OF]->(a)",
                a=PREFIX + "a",
                b=PREFIX + "b",
            ).consume()
        elif fault == "no_document":
            session.run(
                "MATCH (:Document)-[r:HAS_SECTION]->(s:Section {id:$id}) DELETE r",
                id=PREFIX + "s",
            ).consume()
        elif fault == "two_documents":
            session.run(
                "MATCH (s:Section {id:$id}) CREATE (d:Document {id:$d})-[:HAS_SECTION]->(s)",
                id=PREFIX + "s",
                d=PREFIX + "extra",
            ).consume()
        else:
            session.run(
                'MATCH (s:Section {id:$id}) SET s.id=""', id=PREFIX + "s"
            ).consume()
    try:
        with pytest.raises(ValueError):
            list(plan_graph.iter_sections())
    finally:
        if fault == "missing_id":
            with get_session() as session:
                session.run(
                    'MATCH (s:Section {id:""}) SET s.id=$id', id=PREFIX + "s"
                ).consume()


@pytest.mark.parametrize("fault", ["orphan", "shared"])
def test_invalid_chunk_ownership_cannot_pass_or_embed(monkeypatch, fault):
    row = next(r for r in plan_graph.iter_sections() if r["body"])
    parts = list(plan_inputs(row["body"], row["context"]))
    generator._persist_plan(row["section_id"], parts, "mock", 2)
    with get_session() as session:
        session.run("MATCH (ch:Chunk) SET ch.embedding=[0.0,1.0]").consume()
        if fault == "orphan":
            session.run("CREATE (:Chunk {id:$id})", id=PREFIX + "orphan").consume()
        else:
            session.run(
                "MATCH (s:Section {id:$s}), (ch:Chunk {id:$ch}) CREATE (s)-[:HAS_CHUNK]->(ch)",
                s=PREFIX + "a",
                ch=PREFIX + "s:chunk:0",
            ).consume()
    coverage = plan_graph.embedding_coverage("mock", 2)
    assert coverage["covered"] < coverage["total"]
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "mock-only")
    monkeypatch.setattr(
        generator, "voyage_embed", lambda *a, **k: pytest.fail("provider called")
    )
    with pytest.raises(RuntimeError, match="ownership"):
        generator.embed_all("mock")


def test_legacy_vector_refused_by_real_query(monkeypatch):
    with get_session() as session:
        session.run(
            "MATCH (s:Section {id:$id}) SET s.embedding=[0.0,1.0]", id=PREFIX + "s"
        ).consume()
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "mock-only")
    monkeypatch.setattr(
        generator, "voyage_embed", lambda *a, **k: pytest.fail("provider called")
    )
    with pytest.raises(RuntimeError, match="Unversioned"):
        generator.embed_all("mock")
    with get_session() as session:
        assert session.run(
            "MATCH (s:Section {id:$id}) RETURN s.embedding AS v", id=PREFIX + "s"
        ).single()["v"] == [0.0, 1.0]


def test_empty_section_stale_plan_is_cleared(monkeypatch):
    with get_session() as session:
        session.run(
            'MATCH (s:Section {id:$id}) SET s.embedding=[0.0,1.0], s.embedding_fingerprint="stale"',
            id=PREFIX + "a",
        ).consume()
    coverage = plan_graph.embedding_coverage("mock", 2)
    assert coverage["covered"] < coverage["total"]
    monkeypatch.setattr(generator, "VOYAGE_API_KEY", "mock-only")
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(
        generator, "voyage_embed", lambda texts, **k: [[0.0, 1.0] for _ in texts]
    )
    monkeypatch.setattr(
        generator,
        "validate_embedding_coverage",
        lambda model: plan_graph.embedding_coverage(model, 2),
    )
    generator.embed_all("mock")
    with get_session() as session:
        row = session.run(
            "MATCH (s:Section {id:$id}) RETURN s.embedding AS v,s.embedding_fingerprint AS fp",
            id=PREFIX + "a",
        ).single()
        assert row["v"] is None and row["fp"] is None
    assert plan_graph.embedding_coverage("mock", 2)["total"] == 1


def test_guard_mismatch_rolls_back_other_vector_writes(monkeypatch):
    row = next(r for r in plan_graph.iter_sections() if r["body"])
    parts = list(plan_inputs(row["body"], row["context"]))
    generator._persist_plan(row["section_id"], parts, "mock", 2)
    items = [
        {
            "id": plan_graph.input_id(row["section_id"], p),
            "kind": "chunk",
            "text": p.text,
            "fingerprint": p.fingerprint("mock", 2),
        }
        for p in parts[:2]
    ]
    items[1]["fingerprint"] = "mismatch"
    monkeypatch.setattr(generator, "EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr(
        generator, "voyage_embed", lambda texts, **kw: [[0.0, 1.0] for _ in texts]
    )
    with pytest.raises(RuntimeError, match="guarded"):
        generator._flush_batch("mock", items, {"embedded": 0})
    with get_session() as session:
        assert (
            session.run(
                "MATCH (ch:Chunk) WHERE ch.embedding IS NOT NULL RETURN count(ch) AS n"
            ).single()["n"]
            == 0
        )
