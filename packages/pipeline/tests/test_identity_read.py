"""Full graph coverage, pagination, race detection and identity equivalence."""

import os

import pytest

from pipeline.eval.identity import EvidenceNormalizer
from pipeline.eval.identity_read import IDS_QUERY, ROWS_QUERY, graph_rows


def row(raw, **changes):
    return dict(section_id=raw, source_family="clinical_policy", source_url="https://example.test/policy.pdf",
                section_number="1.0", content_text="Exact policy content", section_title="Scope", level=1,
                previous_content=None, next_content=None, previous_title=None, previous_level=None,
                next_title=None, next_level=None, parent_number=None, parent_content=None, **changes)


class Session:
    def __init__(self, rows, mutate=None, fail=False):
        self.rows = rows
        self.mutate = mutate
        self.fail = fail
        self.calls = []
        self.scans = 0

    def run(self, query, **params):
        self.calls.append((query, params))
        if query == IDS_QUERY:
            self.scans += 1
            return [{"identity": str(i), "section_id": row["section_id"], "documents": 1, "parents": 0, "previous": 0, "next": 0} for i, row in enumerate(self.rows)]
        assert query == ROWS_QUERY
        ids = params["identities"]
        assert len(ids) <= 50
        if self.fail and "50" in ids:
            raise RuntimeError("Interrupted Bolt connection")
        result = [dict(self.rows[int(i)]) for i in ids]
        if self.mutate and sum(q == ROWS_QUERY for q, _ in self.calls) > (len(self.rows) + 49) // 50:
            result[0][self.mutate] = "Changed during scan"
        return result


def test_all_sections_are_read_before_matching_and_bodies_are_not_retained():
    rows = [row(str(i)) for i in range(101)]
    # A matching reference doesn't hide duplicate numbers outside the first page.
    rows[0]["content_text"] = "unique body"
    ref = {**rows[0], "section_id": "canonical", "parent_content_hash": None}
    session = Session(rows)
    normalizer = EvidenceNormalizer([ref], graph_rows(session))
    assert normalizer.normalized("0") == "canonical"
    assert len(normalizer.mappings) == 101
    assert len([q for q, _ in session.calls if q == ROWS_QUERY]) == 6
    assert normalizer.normalized("100") == "unmapped:100"


def test_duplicate_raw_ids_across_pages_fail():
    rows = [row(str(i)) for i in range(51)]
    rows[-1]["section_id"] = "0"
    with pytest.raises(ValueError, match="duplicate raw section IDs"):
        EvidenceNormalizer([], graph_rows(Session(rows)))


@pytest.mark.parametrize("field", ["content_text", "source_url", "parent_content", "next_content"])
def test_content_and_topology_changes_invalidate_complete_read(field):
    with pytest.raises(ValueError, match="Graph changed"):
        EvidenceNormalizer([], graph_rows(Session([row("one")], mutate=field)))


def test_interrupted_read_never_returns_a_mapping():
    with pytest.raises(RuntimeError, match="Interrupted"):
        EvidenceNormalizer([], graph_rows(Session([row(str(i)) for i in range(51)], fail=True)))


def test_node_addition_during_read_fails():
    session = Session([row("one")])
    original = session.run
    def run(query, **params):
        if query == IDS_QUERY and session.scans:
            session.rows.append(row("new"))
        return original(query, **params)
    session.run = run
    with pytest.raises(ValueError, match="Graph changed"):
        list(graph_rows(session))


def test_multiple_relationship_rows_remain_ambiguous():
    # The row reader must not DISTINCT away extra documents or parents.
    with pytest.raises(ValueError, match="Ambiguous graph evidence"):
        EvidenceNormalizer([], graph_rows(Session([row("same"), row("same")])))


def test_generator_and_list_produce_identical_hashes_and_records():
    rows = [row("one"), row("two")]
    rows[1]["section_number"] = None
    ref = [{**rows[0], "section_id": "canonical"}]
    direct = EvidenceNormalizer(ref, rows)
    streamed = EvidenceNormalizer(ref, (dict(item) for item in rows))
    assert streamed.evidence() == direct.evidence()


def test_frozen_previous_implementation_evidence_is_identical():
    import json
    from pathlib import Path
    fixture = json.loads((Path(__file__).parent / 'fixtures/evidence-identity/normalization-v1.json').read_text())
    assert EvidenceNormalizer(fixture['reference'], iter(fixture['graph'])).evidence() == fixture['evidence']


@pytest.mark.skipif(os.environ.get('RUN_NEO4J_INTEGRATION') != '1', reason='Requires disposable Neo4j')
def test_real_neo4j_pagination_matches_original_whole_graph_query():
    from pipeline.graph.connection import get_driver
    from pipeline.config import NEO4J_DATABASE
    from pipeline.eval.identity_read import _neighbor_hashes
    prefix = 'identity-pagination-test-'
    driver = get_driver()
    with driver.session(database=NEO4J_DATABASE) as session:
        session.run('CREATE (d:Document {id: $doc, source_url: $url, document_type: "clinical_policy"}) '
                    'WITH d UNWIND range(0, 100) AS i CREATE (d)-[:HAS_SECTION]->(:Section '
                    '{id: $prefix + toString(i), section_number: toString(i), title: "Scope", level: 1, content_text: "Full policy content"})',
                    doc=prefix+'doc',url='https://integration.test/pagination.pdf',prefix=prefix).consume()
    try:
        with driver.session(database=NEO4J_DATABASE, default_access_mode='READ', fetch_size=10) as session:
            ids = [r['identity'] for r in session.run(IDS_QUERY)]
            # This bounded fixture permits the prior single-query oracle.
            direct = [_neighbor_hashes(dict(r)) for r in session.run(ROWS_QUERY, identities=ids)]
            reference = [dict(direct[0], section_id='canonical')]
            expected = EvidenceNormalizer(reference, direct).evidence()
            assert EvidenceNormalizer(reference, graph_rows(session, page_size=7)).evidence() == expected
    finally:
        with driver.session(database=NEO4J_DATABASE) as session:
            session.run('MATCH (s:Section) WHERE s.id STARTS WITH $prefix DETACH DELETE s', prefix=prefix).consume()
            session.run('MATCH (d:Document {id: $doc}) DETACH DELETE d', doc=prefix+'doc').consume()
