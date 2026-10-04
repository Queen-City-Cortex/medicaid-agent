"""Real Neo4j atomic enrichment on an explicitly disposable graph."""
import json
import os

import pytest

from pipeline.graph.connection import get_session
from pipeline.graph.corpus_writer import CorpusGraphWriter
from pipeline.jev.client import canonical, digest, question_spec, MODEL
from pipeline.jev.sections import graph_sections, section_input

pytestmark = pytest.mark.skipif(os.environ.get("RUN_NEO4J_INTEGRATION") != "1", reason="Requires disposable Neo4j")


@pytest.fixture(autouse=True)
def disposable_graph_guard():
    if os.environ.get("JEV_DISPOSABLE_NEO4J") != "true":
        pytest.skip("Requires an explicitly disposable graph")
    from pipeline.config import NEO4J_URI
    approved_uri = os.environ.get("JEV_DISPOSABLE_NEO4J_URI")
    if not approved_uri or approved_uri != NEO4J_URI:
        pytest.fail("JEV_DISPOSABLE_NEO4J_URI must explicitly match the test target")
    with get_session() as session:
        if session.run("MATCH (n) RETURN count(n) AS count").single()['count']:
            pytest.fail("Jev annotation suite requires an empty disposable graph")


def test_enrichment_rollback_input_identity_freeze_and_preservation():
    if os.environ.get("JEV_DISPOSABLE_NEO4J") != "true":
        pytest.skip("Requires an explicitly disposable graph")
    with get_session() as session:
        session.run("""CREATE (d:Document {id:'d', title:'Policy', document_type:'clinical_policy', policy_number:'10A'})
            CREATE (s:Section {id:'s', title:'Criteria', section_number:'3', content_text:'Covered services.', embedding:[1.0,2.0]})
            CREATE (ch:Chunk {id:'ch', content_text:'Covered services.'})
            CREATE (d)-[:HAS_SECTION]->(s)-[:HAS_CHUNK]->(ch)""")
    state = section_input(graph_sections()[0])
    annotation = {"model": MODEL, "inputHash": digest(state), "specHash": digest(question_spec()["roles"]),
                  "probabilities": {k: .95 for k in question_spec()["roles"]}}
    writer = CorpusGraphWriter()
    writer.write_section_roles([{"id": "s", "expected": state, "annotation": canonical(annotation)}], "first")
    from pipeline.release import mark_graph_release
    with pytest.raises(ValueError, match="identity mismatch"):
        mark_graph_release({"releaseId": "release"})
    with get_session() as session:
        row = session.run("MATCH (s:Section {id:'s'})-[:HAS_CHUNK]->(ch) RETURN s.jev_section_roles AS annotation,s.embedding AS embedding,ch.id AS child").single()
        assert json.loads(row["annotation"]) == annotation and row["embedding"] == [1, 2] and row["child"] == "ch"
    with pytest.raises(ValueError, match="input changed"):
        writer.write_section_roles([{"id": "s", "expected": {**state, "content": "stale"}, "annotation": '{}'}], "second")
    with get_session() as session:
        assert session.run("MATCH (m:JevAnnotation) RETURN m.digest AS digest").single()["digest"] == "first"
        assert session.run("MATCH (s:Section {id:'s'}) RETURN s.jev_section_roles AS annotation").single()["annotation"] == canonical(annotation)
        session.run("CREATE (:CorpusRelease {id:'current', release_id:'frozen'})")
    with pytest.raises(ValueError, match="stamped"):
        writer.write_section_roles([], "third")
    with get_session() as session:
        assert session.run("MATCH (s:Section {id:'s'}) RETURN s.jev_section_roles AS annotation").single()["annotation"] == canonical(annotation)
        session.run("MATCH (n) DETACH DELETE n")


def test_loader_invalidates_labels_without_discarding_unchanged_embedding_plans():
    if os.environ.get("JEV_DISPOSABLE_NEO4J") != "true":
        pytest.skip("Requires an explicitly disposable graph")
    from dataclasses import replace
    from pipeline.graph.corpus_types import DocumentBundle, DocumentNode, SectionNode
    from pipeline.embeddings.source_epoch import document_source_epoch
    bundle = DocumentBundle(DocumentNode("jev-loader", "Policy", "dhhs_policy", None, None,
        "current", "https://integration.test/jev-loader", "/fixture.json", "/fixture.pdf", 1, 1, None),
        [SectionNode("jev-loader:s", "jev-loader", "1", "Heading", 1, "body", 4, False, False)])
    writer = CorpusGraphWriter()
    try:
        writer.upsert_document_bundle(bundle)
        with get_session() as session:
            session.run("""MATCH (s:Section {id:'jev-loader:s'})
                SET s.jev_section_roles='old', s.embedding=[0.1,0.2], s.embedding_plan_hash='saved'
                CREATE (s)-[:HAS_CHUNK]->(:Chunk {id:'jev-loader:chunk', embedding:[0.1,0.2]})""").consume()
        writer.upsert_document_bundle(bundle)
        with get_session() as session:
            row = session.run("""MATCH (s:Section {id:'jev-loader:s'})
                RETURN s.jev_section_roles AS label, s.embedding AS vector,
                s.embedding_plan_hash AS plan, s.embedding_source_epoch AS epoch,
                COUNT { (s)-[:HAS_CHUNK]->(:Chunk) } AS chunks""").single()
            assert row['label'] is None and row['vector'] == [.1, .2]
            assert row['plan'] == 'saved' and row['chunks'] == 1
            assert row['epoch'] == document_source_epoch(bundle)
            session.run("MATCH (s:Section {id:'jev-loader:s'}) SET s.jev_section_roles='old'").consume()
        changed = replace(bundle, sections=[replace(bundle.sections[0], content_text='changed', content_length=7)])
        writer.upsert_document_bundle(changed)
        with get_session() as session:
            row = session.run("""MATCH (s:Section {id:'jev-loader:s'})
                RETURN s.jev_section_roles AS label, s.embedding AS vector,
                s.embedding_plan_hash AS plan, s.embedding_source_epoch AS epoch,
                COUNT { (s)-[:HAS_CHUNK]->(:Chunk) } AS chunks""").single()
            assert row['label'] is None and row['vector'] is None and row['plan'] is None
            assert row['chunks'] == 0 and row['epoch'] == document_source_epoch(changed)
    finally:
        writer.delete_document('jev-loader')
