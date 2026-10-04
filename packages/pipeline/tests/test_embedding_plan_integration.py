"""Real Neo4j stale-plan, resume and atomic provider-write regression."""
import os
import uuid
import pytest
from pipeline.embeddings import generator
from pipeline.embeddings.planner import plan_inputs, plan_hash
from pipeline.graph.connection import get_session

pytestmark = pytest.mark.skipif(os.environ.get('RUN_EMBEDDING_INTEGRATION') != '1', reason='Disposable Neo4j required')


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


@pytest.fixture(autouse=True)
def require_owned_empty_graph():
    with get_session() as session:
        assert session.run('MATCH (n) RETURN count(n) AS n').single()['n'] == 0, 'Dedicated empty embedding graph required'
    yield


@pytest.fixture
def token_graph(monkeypatch):
    from pipeline.embeddings import plan_graph
    from pipeline.embeddings import planner
    from pipeline.graph.corpus_types import DocumentBundle, DocumentNode, SectionNode
    from pipeline.graph.corpus_writer import CorpusGraphWriter
    key = 'embedding-integration:' + str(uuid.uuid4())
    bundle = DocumentBundle(DocumentNode(key,'Manual','dhhs_policy',None,None,'current',
        'https://integration.test/'+key,'/fixture.json','/fixture.xlsx',3,1,None),[
        SectionNode(key+':a',key,'1','Repeated',1,'',0,False,False),
        SectionNode(key+':b',key,'2','Repeated',2,'',0,False,False,parent_id=key+':a'),
        SectionNode(key+':s',key,'3','Leaf',3,'x '*12000,24000,False,False,parent_id=key+':b')])
    writer = CorpusGraphWriter()
    writer.upsert_document_bundle(bundle)
    def planned(heading,body,model):
        return planner.plan_inputs(heading,body,model,counter=lambda *_:1)
    monkeypatch.setattr(generator,'plan_inputs',planned)
    monkeypatch.setattr(plan_graph,'plan_inputs',planned)
    monkeypatch.setattr(generator,'VOYAGE_API_KEY','mock-only')
    monkeypatch.setattr(generator,'EMBEDDING_DIMENSIONS',2)
    calls=[]
    def provider(texts,**_kw):
        calls.append(texts)
        return [[.1,.2] for _ in texts]
    monkeypatch.setattr(generator,'voyage_embed',provider)
    yield key,calls
    with get_session() as session:
        session.run('MATCH (n) WHERE n.id STARTS WITH $key DETACH DELETE n',key=key).consume()


def test_repeated_titles_resume_and_recomputed_release_coverage(token_graph):
    from pipeline.embeddings import plan_graph
    key,calls=token_graph
    row=next(r for r in plan_graph.iter_sections() if r['section_id']==key+':s')
    assert row['heading']=='Manual > Repeated > Repeated > Leaf'
    first=generator.embed_all('voyage-4')
    assert first['embedded']>1
    assert generator.embed_all('voyage-4')['embedded']==0
    assert len(calls)==1
    assert plan_graph.embedding_coverage('voyage-4',2)['covered']==1
    assert plan_graph.embedding_coverage('voyage-4-large',2)['covered']==0
    assert plan_graph.embedding_coverage('voyage-4',3)['covered']==0
    with get_session() as session:
        session.run('MATCH (ch:Chunk {id:$id}) SET ch.content_text="tampered"',id=key+':s:chunk:0').consume()
    assert plan_graph.embedding_coverage('voyage-4',2)['covered']==0
    assert generator.embed_all('voyage-4')['embedded']==first['embedded']
    assert plan_graph.embedding_coverage('voyage-4',2)['covered']==1


@pytest.mark.parametrize('corruption',['missing-tail','wrong-index','wrong-ordinal','wrong-offset','zero-vector','boolean-vector','extra-direct','empty-vector'])
def test_stored_plan_corruption_cannot_pass_coverage(token_graph,corruption):
    from pipeline.embeddings import plan_graph
    key,_calls=token_graph
    generator.embed_all('voyage-4')
    with get_session() as session:
        if corruption=='missing-tail':
            session.run('MATCH (ch:Chunk {id:$id}) DETACH DELETE ch',id=key+':s:chunk:2').consume()
        elif corruption=='wrong-index':
            session.run('MATCH (ch:Chunk {id:$id}) SET ch.id=$bad',id=key+':s:chunk:0',bad=key+':s:chunk:99').consume()
        elif corruption=='wrong-ordinal':
            session.run('MATCH (ch:Chunk {id:$id}) SET ch.chunk_index=99',id=key+':s:chunk:0').consume()
        elif corruption=='wrong-offset':
            session.run('MATCH (ch:Chunk {id:$id}) SET ch.body_start=99',id=key+':s:chunk:0').consume()
        elif corruption in ('zero-vector','boolean-vector'):
            session.run('MATCH (ch:Chunk {id:$id}) SET ch.embedding=$v',id=key+':s:chunk:0',v=[0,0] if corruption=='zero-vector' else [True,False]).consume()
        else:
            session.run('MATCH (s:Section {id:$id}) SET s.embedding=[0.1,0.2]',id=key+(':a' if corruption=='empty-vector' else ':s')).consume()
    counts=plan_graph.embedding_coverage('voyage-4',2)
    assert counts['covered']<counts['total']
    generator.embed_all('voyage-4')
    assert plan_graph.embedding_coverage('voyage-4',2)['covered']==1


@pytest.mark.parametrize('problem',['cycle','no-document','two-documents','two-parents','orphan-chunk','shared-chunk','blank-novel'])
def test_preflight_failure_precedes_provider_and_plan_writes(token_graph,monkeypatch,problem):
    key,calls=token_graph
    with get_session() as session:
        if problem=='cycle':
            session.run('MATCH (s:Section {id:$s}),(a:Section {id:$a}) CREATE (s)-[:PARENT_OF]->(a)',s=key+':s',a=key+':a').consume()
        elif problem=='no-document':
            session.run('MATCH ()-[r:HAS_SECTION]->(s:Section {id:$s}) DELETE r',s=key+':s').consume()
        elif problem=='two-documents':
            session.run('MATCH (s:Section {id:$s}) CREATE (:Document {id:$d,title:"Other"})-[:HAS_SECTION]->(s)',s=key+':s',d=key+':other').consume()
        elif problem=='two-parents':
            session.run('MATCH (s:Section {id:$s}),(a:Section {id:$a}) CREATE (a)-[:PARENT_OF]->(s)',s=key+':s',a=key+':a').consume()
        elif problem=='blank-novel':
            session.run('MATCH (s:Section {id:$s}) SET s.content_text=$body',s=key+':s',body='x'*10000+' '*10000).consume()
        else:
            session.run('CREATE (:Chunk {id:$id})',id=key+':badchunk').consume()
            if problem=='shared-chunk':
                session.run('MATCH (ch:Chunk {id:$id}),(a:Section {id:$a}),(b:Section {id:$b}) CREATE (a)-[:HAS_CHUNK]->(ch),(b)-[:HAS_CHUNK]->(ch)',id=key+':badchunk',a=key+':a',b=key+':b').consume()
    monkeypatch.setattr(generator,'persist_plan',lambda *_:pytest.fail('Plan write before full preflight'))
    with pytest.raises(ValueError):
        generator.embed_all('voyage-4')
    assert not calls


def test_guard_mismatch_rolls_back_other_batch_writes(token_graph,monkeypatch):
    key,_calls=token_graph
    generator.embed_all('voyage-4')
    with get_session() as session:
        rows=list(session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN ch.id AS id,ch.content_text AS text,ch.embedding_plan_hash AS plan ORDER BY ch.chunk_index',sid=key+':s'))
        session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) SET ch.embedding=null',sid=key+':s').consume()
    monkeypatch.setattr(generator,'voyage_embed',lambda texts,**_kw:[[.1,.2] for _ in texts])
    stats={'embedded':0,'errors':0}
    with pytest.raises(RuntimeError,match='plan changed'):
        generator._flush_batch('voyage-4',[r['id'] for r in rows],[r['text'] for r in rows],['chunk']*len(rows),stats,[rows[0]['plan']]+['invalid']*(len(rows)-1))
    with get_session() as session:
        assert session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch.embedding) AS n',sid=key+':s').single()['n']==0


def test_partial_provider_failure_resumes_matching_vectors(token_graph,monkeypatch):
    key,calls=token_graph
    monkeypatch.setattr(generator,'EMBED_BATCH_SIZE',1)
    attempts=[]
    def provider(texts,**_kw):
        attempts.append(texts)
        if len(attempts)==2:
            raise RuntimeError('mock provider failure')
        return [[.1,.2] for _ in texts]
    monkeypatch.setattr(generator,'voyage_embed',provider)
    with pytest.raises(RuntimeError,match='mock provider failure'):
        generator.embed_all('voyage-4')
    with get_session() as session:
        assert session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch.embedding) AS n',sid=key+':s').single()['n']==1
    monkeypatch.setattr(generator,'voyage_embed',lambda texts,**_kw:[[.1,.2] for _ in texts])
    result=generator.embed_all('voyage-4')
    assert result['embedded']==2
