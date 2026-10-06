"""Tests for the graph write boundary."""

import logging
import re
from dataclasses import replace
from contextlib import contextmanager

import pytest

from pipeline.graph import queries
from pipeline.graph.corpus_types import (
    AmendmentEdge,
    ConceptLink,
    DocumentBundle,
    DocumentNode,
    PolicyRevisionNode,
    ReferenceEdge,
    SectionNode,
)
from pipeline.graph.corpus_writer import CorpusGraphWriter


class FakeSession:
    def __init__(
        self,
        existing_sections: dict[str, str] | None = None,
        fail_on: str | None = None,
        transient_retries: int = 0,
    ):
        self.calls: list[tuple[str, dict]] = []
        # id → content_text of sections already in the graph
        self.existing_sections = existing_sections or {}
        # query string to raise on, to simulate a mid-write failure
        self.fail_on = fail_on
        # number of transient failures to simulate before the work commits
        self._pending_retries = transient_retries
        self.attempts = 0
        self.commits = 0
        self.rollbacks = 0

    def run(self, query: str, params: dict | None = None):
        self.calls.append((query, params or {}))
        if self.fail_on is not None and query == self.fail_on:
            raise RuntimeError(f"simulated failure on {query}")
        if query == queries.GET_SECTION_CONTENT_BATCH:
            return [
                {"id": sec_id, "content_text": self.existing_sections[sec_id]}
                for sec_id in (params or {})["section_ids"]
                if sec_id in self.existing_sections
            ]
        return []

    # --- transaction surface -------------------------------------------------
    # The real neo4j Session.execute_write(fn) runs fn in a managed write
    # transaction, retrying it on transient errors and committing on success.
    # The fake makes the transaction be the session (so .run keeps recording to
    # .calls), commits on success, and rolls back + re-raises on failure. When
    # transient_retries is set, it re-runs the unit of work — discarding the
    # rolled-back attempt's recorded statements — to prove the work function is
    # safe to retry.
    def execute_write(self, fn, *args, **kwargs):
        while True:
            self.attempts += 1
            try:
                result = fn(self, *args, **kwargs)
            except Exception:
                self.rollbacks += 1
                raise
            if self._pending_retries > 0:
                self._pending_retries -= 1
                self.rollbacks += 1
                self.calls.clear()
                continue
            self.commits += 1
            return result


def _make_bundle() -> DocumentBundle:
    return DocumentBundle(
        document=DocumentNode(
            id="doc:test",
            title="Policy 8C",
            document_type="dhhs_policy",
            policy_number="8C",
            category="eligibility",
            status="current",
            source_url="https://example.com/8C",
            local_path="/tmp/doc.json",
            pdf_path="/tmp/doc.pdf",
            page_count=5,
            section_count=2,
            effective_date="2025-01-01",
        ),
        sections=[
            SectionNode(
                id="sec:1",
                document_id="doc:test",
                section_number="1",
                title="Intro",
                level=1,
                content_text="Intro text",
                content_length=10,
                has_tables=False,
                has_definitions=False,
            ),
            SectionNode(
                id="sec:2",
                document_id="doc:test",
                section_number="1.1",
                title="Child",
                level=2,
                content_text="Child text",
                content_length=10,
                has_tables=False,
                has_definitions=False,
                parent_id="sec:1",
                prev_sibling_id="sec:1",
            ),
        ],
    )


def _writer_for(session: FakeSession) -> CorpusGraphWriter:
    @contextmanager
    def fake_session_factory():
        yield session

    return CorpusGraphWriter(fake_session_factory)


def test_write_failure_is_logged_and_reraised(caplog):
    # A write that fails (here, mid-transaction) must not vanish silently — the
    # affected document's sections never land, so the failure has to be
    # attributable to its operation in the logs.
    session = FakeSession(fail_on=queries.MERGE_DOCUMENT)
    writer = _writer_for(session)

    with caplog.at_level(logging.ERROR, logger="pipeline.graph.corpus_writer"):
        with pytest.raises(RuntimeError):
            writer.upsert_document_bundle(_make_bundle())

    messages = [r.getMessage() for r in caplog.records]
    assert any("neo4j write failed" in m and "upsert_document_bundle" in m for m in messages)


def test_upsert_document_bundle_writes_document_and_section_structure():
    session = FakeSession()
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    assert [query for query, _ in session.calls[:3]] == [queries.LOCK_CORPUS_MUTATION, queries.CHECK_ANNOTATED_RELEASE, queries.INVALIDATE_JEV_ANNOTATION]
    session.calls = session.calls[3:]
    assert [query for query, _ in session.calls] == [
        queries.MERGE_DOCUMENT,
        queries.GET_SECTION_CONTENT_BATCH,
        queries.DELETE_STALE_DOCUMENT_SECTIONS,
        queries.CLEAR_DOCUMENT_SECTION_STRUCTURE,
        queries.MERGE_SECTIONS_BATCH,
        queries.MERGE_HAS_SECTION_BATCH,
        queries.MERGE_PARENT_OF_BATCH,
        queries.MERGE_NEXT_SIBLING_BATCH,
    ]
    assert session.calls[0][1]["id"] == "doc:test"
    assert session.calls[1][1] == {"section_ids": ["sec:1", "sec:2"]}
    assert session.calls[2][1] == {"doc_id": "doc:test", "section_ids": ["sec:1", "sec:2"]}
    assert session.calls[3][1] == {"doc_id": "doc:test"}
    assert session.calls[4][1]["sections"][0]["id"] == "sec:1"
    assert session.calls[5][1] == {"doc_id": "doc:test", "section_ids": ["sec:1", "sec:2"]}


@pytest.mark.parametrize("value, expected", [
    ("2026-09-22 20:43:27", "2026-09-22T20:43:27+00:00"),
    ("2026-09-22T20:43:27Z", "2026-09-22T20:43:27Z"),
    (None, None),
])
def test_registry_timestamps_use_neo4j_utc_format_without_changing_retrieval(value, expected):
    bundle = _make_bundle()
    document = replace(bundle.document, source_checked_at=value, source_changed_at=value, retrieved_at=value)
    session = FakeSession()
    _writer_for(session).upsert_document_bundle(replace(bundle, document=document))
    parameters = next(parameters for query, parameters in session.calls if query == queries.MERGE_DOCUMENT)
    assert parameters["source_checked_at"] == expected
    assert parameters["source_changed_at"] == expected
    assert parameters["retrieved_at"] == value


def test_document_merge_writes_a_change_notice_number_without_a_date():
    bundle = _make_bundle()
    session = FakeSession()
    _writer_for(session).upsert_document_bundle(
        replace(bundle, document=replace(bundle.document, effective_date=None, change_year=2026, change_sequence=4))
    )
    parameters = next(parameters for query, parameters in session.calls if query == queries.MERGE_DOCUMENT)
    assert "d.change_year = $change_year" in queries.MERGE_DOCUMENT
    assert "d.change_sequence = $change_sequence" in queries.MERGE_DOCUMENT
    assert (parameters["effective_date"], parameters["change_year"], parameters["change_sequence"]) == (None, 2026, 4)


def test_document_merge_writes_the_archived_flag():
    bundle = _make_bundle()
    session = FakeSession()
    _writer_for(session).upsert_document_bundle(
        replace(bundle, document=replace(bundle.document, archived=True, status="archived"))
    )
    parameters = next(parameters for query, parameters in session.calls if query == queries.MERGE_DOCUMENT)
    assert "d.archived = $archived" in queries.MERGE_DOCUMENT
    assert parameters["archived"] is True
    assert parameters["status"] == "archived"


def test_invalid_sqlite_calendar_date_fails_before_commit():
    bundle = _make_bundle()
    session = FakeSession()
    with pytest.raises(ValueError):
        _writer_for(session).upsert_document_bundle(replace(
            bundle, document=replace(bundle.document, source_checked_at="2026-02-30 12:00:00"),
        ))
    assert session.commits == 0


def test_delete_document_removes_the_document_through_one_transaction():
    session = FakeSession()
    writer = _writer_for(session)

    writer.delete_document("doc:test")

    assert [query for query, _ in session.calls[:3]] == [queries.LOCK_CORPUS_MUTATION, queries.CHECK_ANNOTATED_RELEASE, queries.INVALIDATE_JEV_ANNOTATION]
    assert session.calls[3:] == [(queries.DELETE_DOCUMENT, {"doc_id": "doc:test"})]
    assert session.commits == 1


def test_upsert_document_bundle_does_not_delete_chunks_for_unchanged_bodies():
    # Identical bodies need no chunk deletion; source-version preservation is tested with real Neo4j.
    session = FakeSession(existing_sections={
        "sec:1": "Intro text",
        "sec:2": "Child text",
    })
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    queries_run = [query for query, _ in session.calls]
    assert queries.CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH not in queries_run
    assert queries.MERGE_SECTIONS_BATCH in queries_run


def test_upsert_document_bundle_deletes_obsolete_chunks_for_changed_bodies():
    # Body change removes obsolete chunks; document-wide context versions also invalidate plans.
    session = FakeSession(existing_sections={
        "sec:1": "Old intro text",
        "sec:2": "Child text",
    })
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    clear_calls = [
        params for query, params in session.calls
        if query == queries.CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH
    ]
    assert clear_calls == [{"section_ids": ["sec:1"]}]


def test_upsert_document_bundle_does_not_clear_brand_new_sections():
    # Sections not yet in the graph have no embeddings or chunks to clear.
    session = FakeSession(existing_sections={})
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    queries_run = [query for query, _ in session.calls]
    assert queries.CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH not in queries_run


def test_upsert_document_bundle_deletes_all_existing_sections_when_parse_has_no_sections():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)
    bundle = DocumentBundle(
        document=DocumentNode(
            id="doc:empty",
            title="Empty legacy parse",
            document_type="dhhs_policy",
            policy_number="8C",
            category="eligibility",
            status="current",
            source_url="https://example.com/empty",
            local_path="/tmp/empty.json",
            pdf_path="/tmp/empty.pdf",
            page_count=1,
            section_count=0,
            effective_date=None,
        ),
        sections=[],
    )

    writer.upsert_document_bundle(bundle)

    assert [query for query, _ in session.calls[:3]] == [queries.LOCK_CORPUS_MUTATION, queries.CHECK_ANNOTATED_RELEASE, queries.INVALIDATE_JEV_ANNOTATION]
    session.calls = session.calls[3:]
    assert [query for query, _ in session.calls] == [
        queries.MERGE_DOCUMENT,
        queries.DELETE_STALE_DOCUMENT_SECTIONS,
        queries.CLEAR_DOCUMENT_SECTION_STRUCTURE,
    ]
    assert session.calls[1][1] == {"doc_id": "doc:empty", "section_ids": []}


def test_rebuild_reference_edges_clears_regex_edges_before_merging_by_edge_type():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)

    count = writer.rebuild_reference_edges([
        ReferenceEdge(
            source_id="sec:1",
            target_id="sec:2",
            edge_type="REFERENCES",
            reference_text="see section 2",
            reference_type="section",
            extraction_method="regex",
        ),
        ReferenceEdge(
            source_id="sec:1",
            target_id="doc:8c",
            edge_type="REFERENCES_DOCUMENT",
            reference_text="see policy 8C",
            reference_type=None,
            extraction_method="regex",
        ),
    ])

    assert count == 2
    assert [query for query, _ in session.calls] == [
        queries.DELETE_REGEX_REFERENCE_EDGES,
        queries.MERGE_REFERENCES_BATCH,
        queries.MERGE_REFERENCES_DOCUMENT_BATCH,
    ]
    assert session.commits == 1
    assert "extraction_method: 'regex'" in queries.DELETE_REGEX_REFERENCE_EDGES


def test_rebuild_reference_edges_clears_stale_regex_edges_when_nothing_resolves():
    session = FakeSession()
    writer = _writer_for(session)

    assert writer.rebuild_reference_edges([]) == 0
    assert [query for query, _ in session.calls] == [queries.DELETE_REGEX_REFERENCE_EDGES]


def test_upsert_document_bundle_commits_once_on_success():
    session = FakeSession()
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    assert session.commits == 1
    assert session.rollbacks == 0


def test_upsert_document_bundle_rolls_back_when_a_write_fails():
    # Fail after the destructive cleanup has run but before the re-merge —
    # exactly the window that previously left a half-wiped document.
    session = FakeSession(fail_on=queries.MERGE_SECTIONS_BATCH)
    writer = _writer_for(session)

    with pytest.raises(RuntimeError):
        writer.upsert_document_bundle(_make_bundle())

    # No commit reached → the transaction context manager rolls back, so the
    # delete/clear statements never become durable.
    assert session.commits == 0
    assert session.rollbacks == 1


def test_upsert_document_bundle_retries_unit_of_work_then_commits():
    # Simulate one transient failure: execute_write re-runs the work function.
    # The rolled-back attempt's statements are discarded, and the retry must
    # produce the same correct, complete sequence and commit exactly once.
    session = FakeSession(transient_retries=1)
    writer = _writer_for(session)

    writer.upsert_document_bundle(_make_bundle())

    assert session.attempts == 2
    assert session.rollbacks == 1
    assert session.commits == 1
    assert [query for query, _ in session.calls[:3]] == [queries.LOCK_CORPUS_MUTATION, queries.CHECK_ANNOTATED_RELEASE, queries.INVALIDATE_JEV_ANNOTATION]
    session.calls = session.calls[3:]
    assert [query for query, _ in session.calls] == [
        queries.MERGE_DOCUMENT,
        queries.GET_SECTION_CONTENT_BATCH,
        queries.DELETE_STALE_DOCUMENT_SECTIONS,
        queries.CLEAR_DOCUMENT_SECTION_STRUCTURE,
        queries.MERGE_SECTIONS_BATCH,
        queries.MERGE_HAS_SECTION_BATCH,
        queries.MERGE_PARENT_OF_BATCH,
        queries.MERGE_NEXT_SIBLING_BATCH,
    ]


def test_merge_amendments_and_concept_links_write_through_boundary():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)

    amendment_count = writer.merge_amendments(
        [AmendmentEdge(source_id="doc:cn", target_id="doc:8c", change_description="Updated limits")],
        ["doc:cn"],
    )
    concept_count = writer.merge_concept_links(
        [ConceptLink(section_id="sec:1", concept_id="concept:epsdt", relationship_type="DEFINES")]
    )

    assert amendment_count == 1
    assert concept_count == 1
    assert session.calls[0][0] == queries.MERGE_AMENDS_BATCH
    assert session.calls[1][0] == queries.SET_DOCUMENT_STATUS_BATCH
    assert "MERGE (s)-[:DEFINES]->(c)" in session.calls[2][0]


def _revision(revision_id: str) -> PolicyRevisionNode:
    return PolicyRevisionNode(
        id=revision_id, title="Policy 8C Revision", policy_number="8C",
        source_url="https://example.org/8C.pdf", effective_date="2007-06-01",
        base_document_id="doc:clinical_policy:8c", change_description="Section 6.0: Updated.",
    )


def test_replace_policy_revisions_deletes_old_forms_before_merging_in_one_transaction():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)
    count = writer.replace_policy_revisions([_revision("doc:change_notice:8C:2007-06-01")])

    assert count == 1
    assert session.commits == 1
    assert [query for query, _ in session.calls] == [
        queries.DELETE_DERIVED_REVISION_DOCUMENTS,
        queries.DELETE_STALE_POLICY_REVISIONS,
        queries.MERGE_POLICY_REVISIONS_BATCH,
    ]
    assert session.calls[1][1] == {"ids": ["doc:change_notice:8C:2007-06-01"]}
    row = session.calls[2][1]["revisions"][0]
    fields = set(re.findall(r"revision\.(\w+)", queries.MERGE_POLICY_REVISIONS_BATCH))
    assert fields == row.keys()


def test_replace_policy_revisions_with_none_still_deletes_stale_rows():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    CorpusGraphWriter(fake_session_factory).replace_policy_revisions([])

    assert [query for query, _ in session.calls] == [
        queries.DELETE_DERIVED_REVISION_DOCUMENTS,
        queries.DELETE_STALE_POLICY_REVISIONS,
    ]
    assert session.calls[1][1] == {"ids": []}


def test_revision_deletes_cannot_match_a_real_document():
    stale = queries.DELETE_STALE_POLICY_REVISIONS
    assert "MATCH (r:PolicyRevision)" in stale
    assert "NOT r:Document" in stale
    assert ":Document)" not in stale.split("WHERE")[0]

    old_form = queries.DELETE_DERIVED_REVISION_DOCUMENTS
    for guard in (
        "d.id STARTS WITH 'doc:change_notice:'",
        "d.document_type = 'change_notice'",
        "d.source_format = 'derived'",
        "NOT EXISTS { (d)-[:HAS_SECTION]->() }",
    ):
        assert guard in old_form
    assert " OR " not in old_form


def test_policy_revisions_are_written_under_their_own_label():
    merge = queries.MERGE_POLICY_REVISIONS_BATCH
    assert "MERGE (r:PolicyRevision {id: revision.id})" in merge
    assert "MERGE (r:Document" not in merge
    assert "MATCH (base:Document {id: revision.base_document_id})" in merge
    assert "MERGE (r)-[a:AMENDS]->(base)" in merge


def test_document_merge_writes_the_archive_cutoff_and_clears_it_for_a_live_family():
    bundle = _make_bundle()
    for cutoff in ("2022-11-02", None):
        session = FakeSession()
        _writer_for(session).upsert_document_bundle(
            replace(bundle, document=replace(bundle.document, as_of_cutoff=cutoff))
        )
        parameters = next(parameters for query, parameters in session.calls if query == queries.MERGE_DOCUMENT)
        assert parameters["as_of_cutoff"] == cutoff
    assert "d.as_of_cutoff = $as_of_cutoff" in queries.MERGE_DOCUMENT
