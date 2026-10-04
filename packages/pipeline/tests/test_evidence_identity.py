import pytest

from pipeline.eval.identity import EvidenceNormalizer


def section(raw, number="1.0", text="Exact policy content", **changes):
    return {
        "section_id": raw,
        "source_family": "clinical_policy",
        "source_url": "https://medicaid.ncdhhs.gov/a.pdf",
        "section_number": number,
        "content_text": text,
        "level": 1,
        "parent_number": None,
        "parent_content_hash": None,
        **changes,
    }


def entry():
    return [
        {"id": "q", "evidence": {"primary_sections": [{"section_id": "canonical"}]}}
    ]


def test_normalizes_by_source_and_section_preserving_both_ids():
    normalizer = EvidenceNormalizer([section("canonical")], [section("legacy")])
    assert normalizer.normalized("legacy") == "canonical"
    mapped = normalizer.graph_entries(entry())[0]["evidence"]["primary_sections"][0]
    assert mapped == {"section_id": "legacy", "canonical_section_id": "canonical"}
    assert normalizer.evidence()["mappings"][0]["source_url"].endswith("a.pdf")


def test_missing_evidence_is_a_miss_not_a_title_or_policy_match():
    normalizer = EvidenceNormalizer(
        [section("canonical")],
        [section("sibling", source_url="https://medicaid.ncdhhs.gov/b.pdf")],
    )
    assert (
        normalizer.graph_entries(entry())[0]["evidence"]["primary_sections"][0][
            "section_id"
        ]
        == "missing:canonical"
    )
    assert normalizer.normalized("sibling") == "unmapped:sibling"


def test_duplicate_numbers_require_content_and_structure():
    reference = [section("canonical", parent_number="2.0")]
    graph = [
        section("wrong", parent_number="1.0"),
        section("right", parent_number="2.0"),
    ]
    normalizer = EvidenceNormalizer(reference, graph)
    assert normalizer.normalized("right") == "canonical"
    assert normalizer.normalized("wrong") == "unmapped:wrong"


def test_ambiguous_duplicates_invalidate_comparison():
    with pytest.raises(ValueError, match="Multiple"):
        EvidenceNormalizer([section("canonical")], [section("a"), section("b")])
    with pytest.raises(ValueError, match="Ambiguous"):
        EvidenceNormalizer([section("canonical"), section("duplicate")], [section("a")])


def test_unnumbered_sections_need_exact_content_not_title_or_ordinal():
    normalizer = EvidenceNormalizer(
        [section("canonical", None)], [section("legacy_s0", None, "different")]
    )
    assert normalizer.normalized("legacy_s0") == "unmapped:legacy_s0"


def test_mapping_hash_is_graph_specific_and_catalog_hash_is_common():
    one = EvidenceNormalizer([section("canonical")], [section("legacy")])
    two = EvidenceNormalizer([section("canonical")], [section("blue")])
    assert one.catalog_hash == two.catalog_hash
    assert one.mapping_hash != two.mapping_hash


def test_empty_headings_require_exact_neighbor_content_and_structure():
    reference = section(
        "canonical", None, "", section_title="Revision", next_content_hash="known"
    )
    same = section(
        "legacy", None, "", section_title="Revision", next_content_hash="known"
    )
    sibling = section(
        "sibling", None, "", section_title="Revision", next_content_hash="other"
    )
    normalizer = EvidenceNormalizer([reference], [same, sibling])
    assert normalizer.normalized("legacy") == "canonical"
    assert normalizer.normalized("sibling") == "unmapped:sibling"


def test_multiple_graph_parents_invalidate_identity():
    with pytest.raises(ValueError, match="Ambiguous graph evidence"):
        EvidenceNormalizer(
            [section("canonical")],
            [section("legacy"), section("legacy", parent_number="2")],
        )


def test_empty_heading_matches_unique_exact_sibling_sequence_not_title_alone():
    reference = section(
        "canonical",
        None,
        "",
        section_title="Revision",
        previous_title="Manual",
        previous_level=1,
        next_title="Scope",
        next_level=1,
    )
    same = {**reference, "section_id": "legacy"}
    other = {**same, "section_id": "other", "previous_title": "Other manual"}
    assert (
        EvidenceNormalizer([reference], [same, other]).normalized("legacy")
        == "canonical"
    )
    assert (
        EvidenceNormalizer([reference], [other]).normalized("other") == "unmapped:other"
    )


def test_existing_canonical_identity_preserves_an_empty_leaf():
    row = section("canonical", None, "", section_title="Revision")
    assert EvidenceNormalizer([row], [row]).normalized("canonical") == "canonical"


def test_unnumbered_revision_section_uses_exact_parent_evidence_when_body_changed():
    row = section(
        "canonical",
        None,
        "Current revision table",
        section_title="Revision Information",
        parent_number="8.0",
        parent_content_hash="exact-parent-content",
    )
    legacy = {**row, "section_id": "legacy", "content_text": "Earlier revision table"}
    normalizer = EvidenceNormalizer([row], [legacy])
    assert normalizer.normalized("legacy") == "canonical"
    legacy["parent_content_hash"] = "another-parent"
    assert EvidenceNormalizer([row], [legacy]).normalized("legacy") == "unmapped:legacy"


def test_normalizer_preserves_bounded_read_only_loader(tmp_path, monkeypatch):
    import json
    from contextlib import contextmanager
    import pipeline.graph.connection as connection
    import pipeline.eval.identity_read as reader
    from pipeline.eval.identity import load_normalizer
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"schema_version": 1, "sections": [section("canonical")]}))
    monkeypatch.setenv("EVAL_IDENTITY_CATALOG", str(path))
    session = object()
    class Driver:
        @contextmanager
        def session(self, **options):
            assert options["default_access_mode"] == "READ"
            assert options["fetch_size"] == 10
            yield session
    monkeypatch.setattr(connection, "get_driver", lambda: Driver())
    def rows(actual):
        assert actual is session
        return [section("legacy")]
    monkeypatch.setattr(reader, "graph_rows", rows)
    assert load_normalizer().normalized("legacy") == "canonical"
