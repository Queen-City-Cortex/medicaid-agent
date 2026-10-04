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
