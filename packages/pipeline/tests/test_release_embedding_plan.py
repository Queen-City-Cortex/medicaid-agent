"""The release manifest selects the exact model for shared coverage checks."""
from contextlib import contextmanager
from pipeline import release
from pipeline.embeddings import plan_graph
from pipeline.graph import connection


def test_release_graph_checks_manifest_embedding_model(monkeypatch):
    calls=[]
    def coverage(**kwargs):
        calls.append(kwargs)
        return {'total':3,'covered':2}
    monkeypatch.setattr(plan_graph,'embedding_coverage',coverage)
    class Result:
        def __init__(self,row):self.row=row
        def single(self):return self.row
    class Session:
        def run(self,query,*_args,**_kwargs):
            if 'source_types' in query:
                return Result({'total':1,'with_id':1,'distinct_ids':1,'source_types':[]})
            return Result({'invalid':0})
    @contextmanager
    def session():yield Session()
    monkeypatch.setattr(connection,'get_session',session)
    result=release.inspect_release_graph(512,'voyage-4-large')
    assert calls==[{'model':'voyage-4-large','dimensions':512}]
    assert result['embeddingCoverage']==2/3
