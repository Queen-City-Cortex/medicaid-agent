"""Real Neo4j stale-plan, resume and atomic provider-write regression."""
import os
import uuid
import pytest
from pipeline.embeddings import generator
from pipeline.embeddings.planner import plan_inputs, plan_hash
from pipeline.graph.connection import get_session

pytestmark = pytest.mark.skipif(os.environ.get('RUN_NEO4J_INTEGRATION') != '1', reason='Disposable Neo4j required')


def test_plan_replacement_resume_and_stale_provider_result(monkeypatch):
    sid = 'embedding-integration:' + str(uuid.uuid4())
    monkeypatch.setattr(generator, 'EMBEDDING_DIMENSIONS', 2)
    def planned(body):
        items = list(plan_inputs('Heading', body, 'voyage-4', counter=lambda *_: 1))
        return items, plan_hash(items, 'voyage-4', 2)
    with get_session() as session:
        session.run('CREATE (:Section {id:$sid, content_length:20000, embedding_source_epoch:$epoch})', sid=sid, epoch='revision-1').consume()
    try:
        items, old = planned('a' * 20000)
        pending, created = generator.persist_plan(sid, items, old, "revision-1")
        assert len(pending) == created == len(items)
        monkeypatch.setattr(generator, 'voyage_embed', lambda *_args, **_kwargs: [[.1,.2]])
        stats = {'embedded':0,'errors':0}
        first = sid + ':chunk:0'
        generator._flush_batch('voyage-4',[first],[items[0].text],['chunk'],stats,[old])
        remaining, created = generator.persist_plan(sid, items, old, "revision-1")
        assert first not in remaining and len(remaining) == len(items)-1 and created == 0
        with get_session() as session:
            session.run('MATCH (ch:Chunk {id:$id}) DETACH DELETE ch', id=sid+':chunk:1').consume()
        repaired, created = generator.persist_plan(sid,items,old,"revision-1")
        assert first in repaired and created == len(items)
        replacement, new = planned('b' * 19000)
        pending, created = generator.persist_plan(sid, replacement, new, "revision-1")
        assert first in pending and created == len(replacement)
        with pytest.raises(RuntimeError, match='plan changed'):
            generator._flush_batch('voyage-4',[first],[items[0].text],['chunk'],stats,[old])
        with get_session() as session:
            row=session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch.embedding) AS vectors, count(ch.embedding_write_lock) AS locks',sid=sid).single()
            assert row['vectors'] == row['locks'] == 0
        direct, digest = planned('short')
        assert generator.persist_plan(sid,direct,digest,"revision-1") == ({sid},0)
        with get_session() as session:
            assert session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch) AS n',sid=sid).single()['n']==0
        generator._flush_batch('voyage-4',[sid],[direct[0].text],['section'],stats,[digest])
        assert generator.persist_plan(sid,direct,digest,"revision-1") == (set(),0)
    finally:
        with get_session() as session:
            session.run('MATCH (s:Section {id:$sid}) OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk) DETACH DELETE ch,s',sid=sid).consume()


def test_loader_update_rejects_inflight_vector_and_stale_planning(monkeypatch):
    from dataclasses import replace
    from pipeline.graph.corpus_types import DocumentBundle,DocumentNode,SectionNode
    from pipeline.graph.corpus_writer import CorpusGraphWriter
    from pipeline.embeddings.source_epoch import document_source_epoch
    key="embedding-integration:"+str(uuid.uuid4())
    bundle=DocumentBundle(DocumentNode(key,"Policy","dhhs_policy",None,None,"current",
        "https://integration.test/"+key,"/fixture.json","/fixture.pdf",1,1,None),[
        SectionNode(key+":s",key,"1","Heading",1,"body",4,False,False)])
    writer=CorpusGraphWriter()
    monkeypatch.setattr(generator,"EMBEDDING_DIMENSIONS",2)
    try:
        writer.upsert_document_bundle(bundle)
        sid,heading,body,epoch=next(generator.iter_section_contexts([key+":s"]))
        assert epoch==document_source_epoch(bundle)
        inputs=list(plan_inputs(heading,body,"voyage-4",counter=lambda *_: 1))
        digest=plan_hash(inputs,"voyage-4",2)
        generator.persist_plan(sid,inputs,digest,epoch)
        monkeypatch.setattr(generator,"voyage_embed",lambda *_args,**_kwargs:[[.1,.2]])
        stats={"embedded":0,"errors":0}
        generator._flush_batch("voyage-4",[sid],[inputs[0].text],["section"],stats,[digest])
        writer.upsert_document_bundle(replace(bundle,document=replace(bundle.document,retrieved_at="2030-01-01")))
        assert generator.persist_plan(sid,inputs,digest,epoch)==(set(),0)
        updated=replace(bundle,document=replace(bundle.document,title="Renamed policy"),
            sections=[replace(bundle.sections[0],content_text="changed body",content_length=12)])
        def response_after_load(*_args,**_kwargs):
            writer.upsert_document_bundle(updated)
            return [[.1,.2]]
        monkeypatch.setattr(generator,"voyage_embed",response_after_load)
        with pytest.raises(RuntimeError,match="plan changed"):
            generator._flush_batch("voyage-4",[sid],[inputs[0].text],["section"],stats,[digest])
        with pytest.raises(ValueError,match="source changed"):
            generator.persist_plan(sid,inputs,digest,epoch)
        with get_session() as session:
            row=session.run("MATCH (s:Section {id:$sid}) RETURN s.embedding AS vector,s.embedding_plan_hash AS plan",sid=sid).single()
            assert row["vector"] is None and row["plan"] is None
    finally:
        writer.delete_document(key)


def test_heading_only_reload_removes_chunk_vectors(monkeypatch):
    from dataclasses import replace
    from pipeline.graph.corpus_types import DocumentBundle,DocumentNode,SectionNode
    from pipeline.graph.corpus_writer import CorpusGraphWriter
    key="embedding-integration:"+str(uuid.uuid4())
    bundle=DocumentBundle(DocumentNode(key,"Policy","dhhs_policy",None,None,"current",
        "https://integration.test/"+key,"/fixture.json","/fixture.pdf",1,1,None),[
        SectionNode(key+":s",key,"1","Heading",1,"a"*20000,20000,False,False)])
    writer=CorpusGraphWriter()
    monkeypatch.setattr(generator,"EMBEDDING_DIMENSIONS",2)
    try:
        writer.upsert_document_bundle(bundle)
        sid,heading,body,epoch=next(generator.iter_section_contexts([key+":s"]))
        inputs=list(plan_inputs(heading,body,"voyage-4",counter=lambda *_:1))
        digest=plan_hash(inputs,"voyage-4",2)
        generator.persist_plan(sid,inputs,digest,epoch)
        first=sid+":chunk:0"
        monkeypatch.setattr(generator,"voyage_embed",lambda *_args,**_kwargs:[[.1,.2]])
        stats={"embedded":0,"errors":0}
        generator._flush_batch("voyage-4",[first],[inputs[0].text],["chunk"],stats,[digest])
        writer.upsert_document_bundle(replace(bundle,document=replace(bundle.document,title="New title")))
        with get_session() as session:
            row=session.run("MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch) AS n",sid=sid).single()
            assert row["n"]==0
        with pytest.raises(RuntimeError,match="plan changed"):
            generator._flush_batch("voyage-4",[first],[inputs[0].text],["chunk"],stats,[digest])
    finally:
        writer.delete_document(key)
