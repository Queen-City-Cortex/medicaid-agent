"""Neo4j-backed mixed-corpus smoke coverage for reference resolution."""

import os

import pytest

from pipeline.graph.connection import close_driver, get_session
from pipeline.references.citations import federal_regulation_doc_id, federal_statute_doc_id
from pipeline.references.extractor import ReferenceMatch
from pipeline.references.resolver import resolve_reference

integration = pytest.mark.skipif(
    os.environ.get("RUN_NEO4J_INTEGRATION") != "1",
    reason="Set RUN_NEO4J_INTEGRATION=1 to run real Neo4j smoke tests.",
)

SOURCE_URL_PREFIX = "https://integration.test/mixed-resolver/"
SOURCE_DOC_ID = "test:pipeline-resolver:doc:dhhs"
SOURCE_SECTION_ID = "test:pipeline-resolver:sec:dhhs:source"
CLINICAL_DOC_ID = "test:pipeline-resolver:doc:clinical:3K-2"
CLINICAL_SECTION_ID = "test:pipeline-resolver:sec:clinical:3K-2:5.1"
SPA_DOC_ID = "test:pipeline-resolver:doc:spa:24-0001"
FEDERAL_REG_DOC_ID = federal_regulation_doc_id(42, 431)
FEDERAL_REG_SECTION_ID = "test:pipeline-resolver:sec:42-cfr-431:431.301"
SSA_DOC_ID = federal_statute_doc_id(19)
SSA_SECTION_ID = "test:pipeline-resolver:sec:ssa-title-19:1902"

RESERVED_IDS = [FEDERAL_REG_DOC_ID, SSA_DOC_ID]


def _cleanup_integration_documents():
    with get_session() as session:
        session.run(
            """
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)-[:HAS_CHUNK]->(ch:Chunk)
            WHERE d.source_url STARTS WITH $prefix
            DETACH DELETE ch
            """,
            {"prefix": SOURCE_URL_PREFIX},
        )
        session.run(
            """
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
            WHERE d.source_url STARTS WITH $prefix
            DETACH DELETE s
            """,
            {"prefix": SOURCE_URL_PREFIX},
        )
        session.run(
            """
            MATCH (d:Document)
            WHERE d.source_url STARTS WITH $prefix
            DETACH DELETE d
            """,
            {"prefix": SOURCE_URL_PREFIX},
        )


def _skip_if_reserved_ids_are_in_use():
    with get_session() as session:
        conflicts = list(
            session.run(
                """
                MATCH (d:Document)
                WHERE d.id IN $ids
                  AND NOT coalesce(d.source_url, '') STARTS WITH $prefix
                RETURN d.id AS id, d.source_url AS source_url
                """,
                {"ids": RESERVED_IDS, "prefix": SOURCE_URL_PREFIX},
            )
        )

    if conflicts:
        conflict_list = ", ".join(f"{row['id']} ({row['source_url']})" for row in conflicts)
        pytest.skip(f"Resolver integration fixtures would collide with existing graph data: {conflict_list}")


def _seed_mixed_corpus_graph():
    with get_session() as session:
        session.run(
            """
            CREATE (sourceDoc:Document {
              id: $source_doc_id,
              title: 'DHHS Source Policy',
              document_type: 'dhhs_policy',
              policy_number: 'MA-TEST',
              source_url: $source_doc_url,
              status: 'current'
            })
            CREATE (sourceSec:Section {
              id: $source_section_id,
              document_id: $source_doc_id,
              section_number: '1.0',
              title: 'Source section',
              content_text: 'See Clinical Coverage Policy 3K-2, Section 5.1. Federal requirements in 42 CFR 431.301 and Section 1902 apply. See SPA 24-0001.',
              content_length: 131
            })
            CREATE (sourceDoc)-[:HAS_SECTION]->(sourceSec)

            CREATE (clinicalDoc:Document {
              id: $clinical_doc_id,
              title: 'Clinical Coverage Policy 3K-2',
              document_type: 'clinical_policy',
              policy_number: '3K-2',
              source_url: $clinical_doc_url,
              status: 'current'
            })
            CREATE (clinicalSec:Section {
              id: $clinical_section_id,
              document_id: $clinical_doc_id,
              section_number: '5.1',
              title: 'Eligibility',
              content_text: 'Clinical section body.',
              content_length: 22
            })
            CREATE (clinicalDoc)-[:HAS_SECTION]->(clinicalSec)

            CREATE (spaDoc:Document {
              id: $spa_doc_id,
              title: 'SPA 24-0001 Hospital Readmission Review',
              document_type: 'state_plan_amendment',
              policy_number: 'SPA 24-0001',
              source_url: $spa_doc_url,
              status: 'current'
            })

            CREATE (federalDoc:Document {
              id: $federal_doc_id,
              title: '42 CFR Part 431',
              document_type: 'federal_regulation',
              policy_number: '42-CFR-431',
              source_url: $federal_doc_url,
              status: 'current'
            })
            CREATE (federalSec:Section {
              id: $federal_section_id,
              document_id: $federal_doc_id,
              section_number: '431.301',
              title: 'Federal section',
              content_text: 'Federal regulation section body.',
              content_length: 31
            })
            CREATE (federalDoc)-[:HAS_SECTION]->(federalSec)

            CREATE (ssaDoc:Document {
              id: $ssa_doc_id,
              title: 'Social Security Act — Title XIX (Medicaid)',
              document_type: 'federal_statute',
              policy_number: 'SSA-Title-19',
              source_url: $ssa_doc_url,
              status: 'current'
            })
            CREATE (ssaSec:Section {
              id: $ssa_section_id,
              document_id: $ssa_doc_id,
              section_number: '1902',
              title: 'Section 1902',
              content_text: 'SSA section body.',
              content_length: 17
            })
            CREATE (ssaDoc)-[:HAS_SECTION]->(ssaSec)
            """,
            {
                "source_doc_id": SOURCE_DOC_ID,
                "source_section_id": SOURCE_SECTION_ID,
                "source_doc_url": f"{SOURCE_URL_PREFIX}source.pdf",
                "clinical_doc_id": CLINICAL_DOC_ID,
                "clinical_section_id": CLINICAL_SECTION_ID,
                "clinical_doc_url": f"{SOURCE_URL_PREFIX}clinical-3k-2.pdf",
                "spa_doc_id": SPA_DOC_ID,
                "spa_doc_url": f"{SOURCE_URL_PREFIX}spa-24-0001.pdf",
                "federal_doc_id": FEDERAL_REG_DOC_ID,
                "federal_section_id": FEDERAL_REG_SECTION_ID,
                "federal_doc_url": f"{SOURCE_URL_PREFIX}42-cfr-431.xml",
                "ssa_doc_id": SSA_DOC_ID,
                "ssa_section_id": SSA_SECTION_ID,
                "ssa_doc_url": f"{SOURCE_URL_PREFIX}ssa-title-19.html",
            },
        )


@pytest.fixture(autouse=True)
def cleanup_graph():
    _cleanup_integration_documents()
    yield
    _cleanup_integration_documents()
    close_driver()


@integration
def test_resolve_reference_across_mixed_corpora():
    _skip_if_reserved_ids_are_in_use()
    _seed_mixed_corpus_graph()

    cross_document = resolve_reference(
        ReferenceMatch(
            ref_type="cross_document",
            target_id="3K-2",
            matched_text="Clinical Coverage Policy 3K-2",
            start=4,
            end=32,
        ),
        source_document_id=SOURCE_DOC_ID,
    )
    contextual_section = resolve_reference(
        ReferenceMatch(
            ref_type="section",
            target_id="5.1",
            matched_text="Section 5.1",
            start=34,
            end=45,
        ),
        source_document_id=SOURCE_DOC_ID,
        bound_document_id=CLINICAL_DOC_ID,
    )
    federal_regulation = resolve_reference(
        ReferenceMatch(
            ref_type="federal_regulation",
            target_id="42 CFR 431.301",
            matched_text="42 CFR 431.301",
            start=71,
            end=85,
        ),
        source_document_id=SOURCE_DOC_ID,
    )
    ssa_section = resolve_reference(
        ReferenceMatch(
            ref_type="ssa_section",
            target_id="1902",
            matched_text="Section 1902",
            start=90,
            end=102,
        ),
        source_document_id=SOURCE_DOC_ID,
    )
    spa = resolve_reference(
        ReferenceMatch(
            ref_type="spa",
            target_id="24-0001",
            matched_text="SPA 24-0001",
            start=114,
            end=125,
        ),
        source_document_id=SOURCE_DOC_ID,
    )

    assert cross_document == {
        "resolved": True,
        "target_node_id": CLINICAL_DOC_ID,
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }
    assert contextual_section == {
        "resolved": True,
        "target_node_id": CLINICAL_SECTION_ID,
        "target_type": "section",
        "edge_type": "REFERENCES",
    }
    assert federal_regulation == {
        "resolved": True,
        "target_node_id": FEDERAL_REG_SECTION_ID,
        "target_type": "section",
        "edge_type": "REFERENCES",
    }
    assert ssa_section == {
        "resolved": True,
        "target_node_id": SSA_SECTION_ID,
        "target_type": "section",
        "edge_type": "REFERENCES",
    }
    assert spa == {
        "resolved": True,
        "target_node_id": SPA_DOC_ID,
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }
