"""Neo4j-backed smoke coverage for DHHS document and section identity."""

import json
import os

import pytest
from docling_core.types.doc import DocItemLabel

from pipeline.graph.connection import close_driver, get_session
from pipeline.graph.loader import load_all
from pipeline.identity import build_document_id

integration = pytest.mark.skipif(
    os.environ.get("RUN_NEO4J_INTEGRATION") != "1",
    reason="Set RUN_NEO4J_INTEGRATION=1 to run real Neo4j smoke tests.",
)

SOURCE_URL_PREFIX = "https://integration.test/dhhs-identity/"


class FakeItem:
    def __init__(self, label, text):
        self.label = label
        self.text = text


class FakeDoc:
    def __init__(self, items):
        self._items = items

    def iterate_items(self):
        for label, text, level in self._items:
            yield FakeItem(label, text), level


def _fake_doc_for_fixture(kind: str) -> FakeDoc:
    if kind == "base":
        return FakeDoc([
            (DocItemLabel.SECTION_HEADER, "1.0 Overview", 1),
            (DocItemLabel.PARAGRAPH, "Base manual content.", 1),
        ])
    if kind == "translation":
        return FakeDoc([
            (DocItemLabel.SECTION_HEADER, "1.0 Resumen", 1),
            (DocItemLabel.PARAGRAPH, "Translated manual content.", 1),
        ])
    if kind == "change_notice":
        return FakeDoc([
            (DocItemLabel.SECTION_HEADER, "1.0 Update", 1),
            (DocItemLabel.PARAGRAPH, "This notice updates the base manual.", 1),
        ])
    if kind == "attachments":
        return FakeDoc([
            (DocItemLabel.SECTION_HEADER, "Attachment B", 1),
            (DocItemLabel.PARAGRAPH, "First attachment body.", 1),
            (DocItemLabel.SECTION_HEADER, "Attachment B", 1),
            (DocItemLabel.PARAGRAPH, "Second attachment body.", 1),
        ])
    raise AssertionError(f"Unknown fixture kind: {kind}")


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


@pytest.fixture(autouse=True)
def cleanup_graph():
    _cleanup_integration_documents()
    yield
    _cleanup_integration_documents()
    close_driver()


@integration
def test_dhhs_load_identity_smoke(monkeypatch, tmp_path):
    parsed_root = tmp_path / "parsed"
    dhhs_dir = parsed_root / "dhhs-policies"
    dhhs_dir.mkdir(parents=True)

    fixtures = {
        "ma-3200-application": "base",
        "ma-3200-application-spanish": "translation",
        "change-notice-for-manual-no-01-24-ma-3200-application": "change_notice",
        "dhb-attachment-repeat": "attachments",
    }

    for stem, kind in fixtures.items():
        (dhhs_dir / f"{stem}.json").write_text(json.dumps({"fixture": kind}))
        (dhhs_dir / f"{stem}.meta.json").write_text(
            json.dumps({"source_pdf": f"{stem}.pdf", "page_count": 1})
        )

    metadata_by_stem = {
        "ma-3200-application": {
            "title": "MA-3200 Application",
            "policy_number": "MA-3200",
            "category": "manual",
            "source_url": f"{SOURCE_URL_PREFIX}ma-3200.pdf",
            "status": "unchanged",
        },
        "ma-3200-application-spanish": {
            "title": "MA-3200 Application (Spanish)",
            "policy_number": "MA-3200",
            "category": "manual",
            "source_url": f"{SOURCE_URL_PREFIX}ma-3200-es.pdf",
            "status": "unchanged",
        },
        "change-notice-for-manual-no-01-24-ma-3200-application": {
            "title": "CHANGE NOTICE FOR MANUAL NO. 01-24, MA-3200, Application",
            "policy_number": None,
            "category": "manual",
            "source_url": f"{SOURCE_URL_PREFIX}cn-01-24.pdf",
            "status": "unchanged",
        },
        "dhb-attachment-repeat": {
            "title": "DHB Attachment Repeat",
            "policy_number": None,
            "category": "notice",
            "source_url": f"{SOURCE_URL_PREFIX}attachments.pdf",
            "status": "unchanged",
        },
    }

    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", parsed_root)
    monkeypatch.setattr("pipeline.graph.loader.SOURCE_TYPE_DIRS", {"dhhs_policy": "dhhs-policies"})
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: metadata_by_stem[filename_stem],
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.DoclingDocument.model_validate",
        lambda doc_dict: _fake_doc_for_fixture(doc_dict["fixture"]),
    )

    stats = load_all(source_type="dhhs_policy", reset=False)
    attachment_doc_id = build_document_id(
        "dhhs_policy",
        f"{SOURCE_URL_PREFIX}attachments.pdf",
    )

    with get_session() as session:
        doc_count = session.run(
            """
            MATCH (d:Document)
            WHERE d.source_url STARTS WITH $prefix
            RETURN count(d) AS count
            """,
            {"prefix": SOURCE_URL_PREFIX},
        ).single()["count"]
        section_count = session.run(
            """
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
            WHERE d.source_url STARTS WITH $prefix
            RETURN count(s) AS count
            """,
            {"prefix": SOURCE_URL_PREFIX},
        ).single()["count"]
        ma3200_docs = list(
            session.run(
                """
                MATCH (d:Document)
                WHERE d.source_url STARTS WITH $prefix
                  AND d.policy_number = 'MA-3200'
                RETURN d.id AS id, d.source_url AS source_url
                ORDER BY d.source_url
                """,
                {"prefix": SOURCE_URL_PREFIX},
            )
        )
        change_notice = session.run(
            """
            MATCH (d:Document {source_url: $source_url})
            RETURN d.id AS id, d.policy_number AS policy_number
            """,
            {"source_url": f"{SOURCE_URL_PREFIX}cn-01-24.pdf"},
        ).single()
        attachment_sections = list(
            session.run(
                """
                MATCH (d:Document {source_url: $source_url})-[:HAS_SECTION]->(s:Section)
                RETURN s.id AS id, s.section_number AS section_number
                ORDER BY s.id
                """,
                {"source_url": f"{SOURCE_URL_PREFIX}attachments.pdf"},
            )
        )

    assert stats == {"loaded": 4, "sections_total": 5, "skipped": 0, "errors": 0}
    assert doc_count == stats["loaded"]
    assert section_count == stats["sections_total"]
    assert len(ma3200_docs) == 2
    assert ma3200_docs[0]["id"] != ma3200_docs[1]["id"]
    assert change_notice["policy_number"] is None
    assert [(row["id"], row["section_number"]) for row in attachment_sections] == [
        (
            f"sec:{attachment_doc_id}:Attachment B",
            "Attachment B",
        ),
        (
            f"sec:{attachment_doc_id}:Attachment B:dup1",
            "Attachment B",
        ),
    ]


@integration
def test_spa_attachments_with_one_policy_number_load_one_to_one(
    monkeypatch,
    tmp_path,
):
    parsed_root = tmp_path / "parsed"
    spa_dir = parsed_root / "state-plan-amendments"
    spa_dir.mkdir(parents=True)
    stems = ("spa-26-0001-cover", "spa-26-0001-main", "spa-26-0001-attachment")

    for stem in stems:
        (spa_dir / f"{stem}.json").write_text(json.dumps({"fixture": "base"}))
        (spa_dir / f"{stem}.meta.json").write_text(
            json.dumps(
                {
                    "source_file": f"{stem}.pdf",
                    "parse_status": "parsed",
                    "answer_ready": True,
                    "section_count": 1,
                }
            )
        )

    metadata_by_stem = {
        stem: {
            "title": stem,
            "policy_number": "26-0001",
            "category": "state plan",
            "source_url": f"{SOURCE_URL_PREFIX}{stem}.pdf",
            "status": "unchanged",
        }
        for stem in stems
    }
    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", parsed_root)
    monkeypatch.setattr(
        "pipeline.graph.loader.SOURCE_TYPE_DIRS",
        {"state_plan_amendment": "state-plan-amendments"},
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: metadata_by_stem[filename_stem],
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.DoclingDocument.model_validate",
        lambda doc_dict: _fake_doc_for_fixture(doc_dict["fixture"]),
    )

    stats = load_all(source_type="state_plan_amendment", reset=False)

    with get_session() as session:
        rows = list(
            session.run(
                """
                MATCH (d:Document)
                WHERE d.source_url STARTS WITH $prefix
                  AND d.document_type = 'state_plan_amendment'
                RETURN d.id AS id, d.source_url AS source_url
                ORDER BY d.source_url
                """,
                {"prefix": SOURCE_URL_PREFIX},
            )
        )

    assert stats == {"loaded": 3, "sections_total": 3, "skipped": 0, "errors": 0}
    assert len(rows) == len(stems)
    assert len({row["id"] for row in rows}) == len(stems)
    assert len({row["source_url"] for row in rows}) == len(stems)
