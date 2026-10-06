"""The statute Document points at its GovInfo package and the stage result
records what was ingested."""

from pathlib import Path

from pipeline.federal import loader, ssa_client
from pipeline.references.citations import federal_statute_doc_id
from tests.fakes import RecordingGraphWriter

FIXTURES = Path(__file__).parent / "fixtures" / "uslm"


def test_load_ssa_records_package_provenance_on_the_document_and_the_stage_result(tmp_path, monkeypatch):
    monkeypatch.setattr(ssa_client, "ECFR_CACHE_DIR", tmp_path)
    for title_num, name in ((19, "COMPS-8765"), (21, "COMPS-8770")):
        ssa_client.statute_cache_path(title_num).write_text((FIXTURES / f"{name}.trimmed.xml").read_text())
    monkeypatch.setattr(
        ssa_client, "fetch_statute_xml", lambda title_num, refresh=False: ssa_client.statute_cache_path(title_num).read_text()
    )
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    writer = RecordingGraphWriter()
    monkeypatch.setattr(loader, "graph_writer", writer)

    stats = loader.load_ssa()

    assert stats["titles_loaded"] == 2 and stats["errors"] == 0
    bundles = writer.received("upsert_document_bundle")
    xix = bundles[0].document
    assert xix.id == federal_statute_doc_id(19)
    assert xix.source_url == "https://www.govinfo.gov/app/details/COMPS-8765"
    assert xix.title == "Social Security Act — Title XIX (Medicaid), as amended through P.L. 119–75"
    assert xix.source_modified_date == "2026-09-11"
    assert xix.retrieved_at.endswith("+00:00")
    assert stats["packages"]["19"]["current_through_public_law"] == "119–75"
    assert stats["packages"]["21"]["processed_date"] == "2026-02-20"
    assert len(stats["packages"]["21"]["source_sha256"]) == 64
    assert stats["sections_total"] == sum(len(bundle.sections) for bundle in bundles)
    numbers = {section.section_number for bundle in bundles for section in bundle.sections}
    assert {"1902", "1902(a)", "1905", "1915", "2101", "2103", "2110"} <= numbers
    assert not numbers & {"1917(i)", "2105(i)", "1903(cc)", "1903(dd)"}
