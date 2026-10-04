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
        session.run('CREATE (:Section {id:$sid, content_length:20000})', sid=sid).consume()
    try:
        items, old = planned('a' * 20000)
        pending, created = generator.persist_plan(sid, items, old)
        assert len(pending) == created == len(items)
        monkeypatch.setattr(generator, 'voyage_embed', lambda *_args, **_kwargs: [[.1,.2]])
        stats = {'embedded':0,'errors':0}
        first = sid + ':chunk:0'
        generator._flush_batch('voyage-4',[first],[items[0].text],['chunk'],stats,[old])
        remaining, created = generator.persist_plan(sid, items, old)
        assert first not in remaining and len(remaining) == len(items)-1 and created == 0
        with get_session() as session:
            session.run('MATCH (ch:Chunk {id:$id}) DETACH DELETE ch', id=sid+':chunk:1').consume()
        repaired, created = generator.persist_plan(sid,items,old)
        assert first in repaired and created == len(items)
        replacement, new = planned('b' * 19000)
        pending, created = generator.persist_plan(sid, replacement, new)
        assert first in pending and created == len(replacement)
        with pytest.raises(RuntimeError, match='plan changed'):
            generator._flush_batch('voyage-4',[first],[items[0].text],['chunk'],stats,[old])
        with get_session() as session:
            row=session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch.embedding) AS vectors, count(ch.embedding_write_lock) AS locks',sid=sid).single()
            assert row['vectors'] == row['locks'] == 0
        direct, digest = planned('short')
        assert generator.persist_plan(sid,direct,digest) == ({sid},0)
        with get_session() as session:
            assert session.run('MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk) RETURN count(ch) AS n',sid=sid).single()['n']==0
        generator._flush_batch('voyage-4',[sid],[direct[0].text],['section'],stats,[digest])
        assert generator.persist_plan(sid,direct,digest) == (set(),0)
    finally:
        with get_session() as session:
            session.run('MATCH (s:Section {id:$sid}) OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk) DETACH DELETE ch,s',sid=sid).consume()
