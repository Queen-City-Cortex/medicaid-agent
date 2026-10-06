"""Neo4j-backed coverage for replacing clinical-policy revisions."""

import os

import pytest

from pipeline.graph.connection import close_driver, get_session
from pipeline.graph.corpus_types import PolicyRevisionNode
from pipeline.graph.corpus_writer import CorpusGraphWriter
from pipeline.graph.schema import ensure_schema

integration = pytest.mark.skipif(
    os.environ.get("RUN_NEO4J_INTEGRATION") != "1",
    reason="Set RUN_NEO4J_INTEGRATION=1 to run real Neo4j smoke tests.",
)

POLICY = "TEST-REVISION-8C"
BASE_ID = "doc:clinical_policy:test-revision-base"
OTHER_BASE_ID = "doc:clinical_policy:test-revision-other"
NOTICE_ID = "doc:dhhs_policy:test-revision-notice"
LOOKALIKE_ID = f"doc:change_notice:{POLICY}:real-document"
FIXTURE_IDS = [BASE_ID, OTHER_BASE_ID, NOTICE_ID, LOOKALIKE_ID]


def _cleanup():
    with get_session() as session:
        session.run(
            "MATCH (n) WHERE n.id IN $ids OR n.id STARTS WITH $prefix DETACH DELETE n",
            {"ids": FIXTURE_IDS + ["sec:test-revision-lookalike"], "prefix": f"doc:change_notice:{POLICY}:"},
        )


@pytest.fixture(autouse=True)
def cleanup_graph():
    if os.environ.get("RUN_NEO4J_INTEGRATION") != "1":
        yield
        return
    _cleanup()
    yield
    _cleanup()
    close_driver()


def _revision(iso: str, description: str, base_id: str = BASE_ID) -> PolicyRevisionNode:
    return PolicyRevisionNode(
        id=f"doc:change_notice:{POLICY}:{iso}",
        title=f"Policy {POLICY} Revision — {iso} (Section 6.0)",
        policy_number=POLICY,
        source_url="https://integration.test/policy-revision/8C.pdf",
        effective_date=iso,
        base_document_id=base_id,
        change_description=description,
    )


@integration
def test_replace_policy_revisions_relabels_old_rows_and_deletes_only_revisions():
    ensure_schema()
    with get_session() as session:
        # The replace is graph-wide: it would delete a real graph's revisions.
        existing = session.run(
            "MATCH (n) WHERE n:PolicyRevision OR (n:Document AND n.source_format = 'derived') RETURN count(n) AS count"
        ).single()["count"]
        if existing:
            raise RuntimeError("Policy revision fixture requires a dedicated test graph")
        session.run(
            """
            CREATE (base:Document {id: $base, document_type: 'clinical_policy', policy_number: $policy})
            CREATE (:Document {id: $other, document_type: 'clinical_policy', policy_number: $policy})
            CREATE (notice:Document {id: $notice, document_type: 'dhhs_policy', status: 'amendment'})
            CREATE (notice)-[:AMENDS {change_description: 'A real notice'}]->(base)
            // The form written before the relabel: two same-date siblings.
            CREATE (old:Document {id: $old, document_type: 'change_notice', source_format: 'derived', policy_number: $policy})
            CREATE (sibling:Document {id: $old + ':2', document_type: 'change_notice', source_format: 'derived', policy_number: $policy})
            CREATE (old)-[:AMENDS]->(base)
            CREATE (sibling)-[:AMENDS]->(base)
            // A document that only resembles a revision row keeps its sections.
            CREATE (lookalike:Document {id: $lookalike, document_type: 'change_notice', source_format: 'derived'})
            CREATE (lookalike)-[:HAS_SECTION]->(:Section {id: 'sec:test-revision-lookalike'})
            // A revision whose table row has since disappeared.
            CREATE (stale:PolicyRevision {id: $stale})
            CREATE (stale)-[:AMENDS]->(base)
            """,
            {
                "base": BASE_ID,
                "other": OTHER_BASE_ID,
                "notice": NOTICE_ID,
                "lookalike": LOOKALIKE_ID,
                "policy": POLICY,
                "old": f"doc:change_notice:{POLICY}:2007-06-01",
                "stale": f"doc:change_notice:{POLICY}:1999-01-01",
            },
        )

    writer = CorpusGraphWriter()
    count = writer.replace_policy_revisions(
        [_revision("2007-06-01", "Section 6.0: Updated."), _revision("2005-05-01", "Section 2.0: Added.")]
    )
    assert count == 2
    # A second run moves one revision to another base and must not leave both edges.
    writer.replace_policy_revisions(
        [_revision("2007-06-01", "Section 6.0: Updated again.", OTHER_BASE_ID), _revision("2005-05-01", "Section 2.0: Added.")]
    )

    with get_session() as session:
        rows = session.run(
            """
            MATCH (n)
            WHERE n.id IN $ids OR n.id STARTS WITH $prefix
            OPTIONAL MATCH (n)-[a:AMENDS]->(base)
            RETURN elementId(n) AS node, n.id AS id, labels(n) AS labels,
                   n.document_type AS type, n.status AS status,
                   collect(base.id) AS bases, collect(a.change_description) AS descriptions
            """,
            {"ids": FIXTURE_IDS, "prefix": f"doc:change_notice:{POLICY}:"},
        ).data()
        found = {row["id"]: row for row in rows}

    # One node per id: the old :Document form is gone, not kept beside the new one.
    assert len(rows) == len(found)

    assert set(found) == set(FIXTURE_IDS) | {
        f"doc:change_notice:{POLICY}:2005-05-01",
        f"doc:change_notice:{POLICY}:2007-06-01",
    }
    for iso in ("2005-05-01", "2007-06-01"):
        revision = found[f"doc:change_notice:{POLICY}:{iso}"]
        assert revision["labels"] == ["PolicyRevision"]
        assert revision["type"] == "change_notice"
        assert revision["status"] == "amendment"
    assert found[f"doc:change_notice:{POLICY}:2005-05-01"]["bases"] == [BASE_ID]
    assert found[f"doc:change_notice:{POLICY}:2007-06-01"]["bases"] == [OTHER_BASE_ID]
    assert found[f"doc:change_notice:{POLICY}:2007-06-01"]["descriptions"] == ["Section 6.0: Updated again."]
    # Real documents, their edges and a sectioned look-alike are untouched.
    assert found[NOTICE_ID]["bases"] == [BASE_ID]
    assert found[LOOKALIKE_ID]["labels"] == ["Document"]
    assert found[BASE_ID]["labels"] == ["Document"]
