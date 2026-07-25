"""Tests for corpus lifecycle audit classification."""

from pathlib import Path

from pipeline.audit import build_corpus_audit_report
from pipeline.corpus_manifest import get_source_family


def _registry_row(source_type: str, local_path: Path, status: str = "downloaded") -> dict:
    return {
        "id": 1,
        "source_url": f"https://example.test/{local_path.name}",
        "title": local_path.stem,
        "source_type": source_type,
        "local_path": str(local_path),
        "status": status,
    }


def _local_file(source_type: str, local_path: Path) -> dict:
    return {
        "source_type": source_type,
        "local_path": str(local_path),
        "source_format": local_path.suffix.lower(),
        "filename": local_path.name,
    }


def test_audit_marks_supported_download_without_sidecar_as_missing_parsed(tmp_path):
    source_file = tmp_path / "documents" / "manual.pdf"
    source_file.parent.mkdir(parents=True)
    source_file.write_bytes(b"%PDF-1.4 test")

    report = build_corpus_audit_report(
        source_families=(get_source_family("bulletin"),),
        registry_rows=[_registry_row("bulletin", source_file)],
        local_files=[_local_file("bulletin", source_file)],
        parsed_sidecars=[],
        graph_documents=[],
    )

    entry = report["documents"][0]
    assert entry["failure_reasons"] == ["missing_parsed"]
    assert entry["states"] == ["discovered", "downloaded"]


def test_audit_reports_per_family_discovery_freshness():
    report = build_corpus_audit_report(
        source_families=(get_source_family("bulletin"),),
        registry_rows=[],
        local_files=[],
        parsed_sidecars=[],
        graph_documents=[],
        source_freshness=[
            {
                "source_type": "bulletin",
                "last_successful_discovery_at": "2099-01-01T00:00:00+00:00",
                "last_content_change_at": "2098-12-31T00:00:00+00:00",
            }
        ],
    )

    family = report["source_families"][0]
    assert family["freshness_status"] == "fresh"
    assert family["discovery_interval_hours"] == 24
    assert family["freshness_sla_days"] == 1


def test_audit_surfaces_parse_quality_and_missing_graph_load(tmp_path):
    source_file = tmp_path / "documents" / "eligibility.pdf"
    source_file.parent.mkdir(parents=True)
    source_file.write_bytes(b"%PDF-1.4 test")

    parsed_entry = {
        "source_type": "dhhs_policy",
        "meta_path": str(tmp_path / "eligibility.meta.json"),
        "json_path": str(tmp_path / "eligibility.json"),
        "source_file": str(source_file),
        "source_format": "pdf",
        "parse_status": "parsed",
        "quality_flags": ["zero_section_parse", "title_only_or_blank_body"],
        "answer_ready": False,
        "section_count": 0,
        "page_count": 3,
        "content_char_count": 0,
    }

    report = build_corpus_audit_report(
        source_families=(get_source_family("dhhs_policy"),),
        registry_rows=[_registry_row("dhhs_policy", source_file)],
        local_files=[_local_file("dhhs_policy", source_file)],
        parsed_sidecars=[parsed_entry],
        graph_documents=[],
    )

    entry = report["documents"][0]
    assert entry["failure_reasons"] == [
        "title_only_or_blank_body",
        "zero_section_parse",
    ]
    assert entry["states"] == ["discovered", "downloaded", "parsed"]


def test_audit_marks_remaining_legacy_ppt_as_unsupported_format(tmp_path):
    source_file = tmp_path / "documents" / "legacy-slides.ppt"
    source_file.parent.mkdir(parents=True)
    source_file.write_bytes(b"legacy xls")

    report = build_corpus_audit_report(
        source_families=(get_source_family("managed_care_guidance"),),
        registry_rows=[_registry_row("managed_care_guidance", source_file)],
        local_files=[_local_file("managed_care_guidance", source_file)],
        parsed_sidecars=[],
        graph_documents=[],
    )

    entry = report["documents"][0]
    assert entry["failure_reasons"] == ["unsupported_format"]


def test_audit_marks_parse_exception_explicitly(tmp_path):
    source_file = tmp_path / "documents" / "guide.docx"
    source_file.parent.mkdir(parents=True)
    source_file.write_text("not really a docx")

    parsed_entry = {
        "source_type": "billing_guidance",
        "meta_path": str(tmp_path / "guide.meta.json"),
        "json_path": str(tmp_path / "guide.json"),
        "source_file": str(source_file),
        "source_format": "docx",
        "parse_status": "parse_exception",
        "quality_flags": ["parse_exception"],
        "answer_ready": False,
        "section_count": 0,
        "page_count": 0,
        "content_char_count": 0,
    }

    report = build_corpus_audit_report(
        source_families=(get_source_family("billing_guidance"),),
        registry_rows=[_registry_row("billing_guidance", source_file)],
        local_files=[_local_file("billing_guidance", source_file)],
        parsed_sidecars=[parsed_entry],
        graph_documents=[],
    )

    entry = report["documents"][0]
    assert entry["failure_reasons"] == ["parse_exception"]


def test_audit_reports_fee_schedule_retrieval_buckets(tmp_path):
    current_xlsx = tmp_path / "documents" / "ambulance-2022.xlsx"
    current_pdf = tmp_path / "documents" / "ambulance-2022.pdf"
    older_xlsx = tmp_path / "documents" / "ambulance-2021.xlsx"
    current_xlsx.parent.mkdir(parents=True)
    current_xlsx.write_bytes(b"xlsx")
    current_pdf.write_bytes(b"pdf")
    older_xlsx.write_bytes(b"xlsx")

    report = build_corpus_audit_report(
        source_families=(get_source_family("fee_schedule"),),
        registry_rows=[
            {
                **_registry_row("fee_schedule", current_xlsx),
                "title": "Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
                "source_url": "https://example.test/ambulance-2022.xlsx",
            },
            {
                **_registry_row("fee_schedule", current_pdf),
                "title": "Ambulance Fee Schedule - Jan. 1, 2022 - PDF",
                "source_url": "https://example.test/ambulance-2022.pdf",
            },
            {
                **_registry_row("fee_schedule", older_xlsx),
                "title": "Ambulance Fee Schedule - Oct. 22, 2021 - EXCEL",
                "source_url": "https://example.test/ambulance-2021.xlsx",
            },
        ],
        local_files=[
            _local_file("fee_schedule", current_xlsx),
            _local_file("fee_schedule", current_pdf),
            _local_file("fee_schedule", older_xlsx),
        ],
        parsed_sidecars=[],
        graph_documents=[],
    )

    family = report["source_families"][0]
    assert family["counts"]["retrieval_ready"] == 2
    assert family["corpus_buckets"] == {
        "companion": 1,
        "history": 1,
        "primary": 1,
    }


def test_audit_reports_duplicate_graph_document_ids_as_a_release_blocker():
    graph_document = {
        "id": "doc:state_plan_amendment:duplicate",
        "source_type": "state_plan_amendment",
        "source_url": "https://example.test/spa-a.pdf",
        "source_path": "state-plan-amendments/spa-a.pdf",
        "answer_ready": True,
        "source_format": "pdf",
        "authority_tier": "authoritative",
        "answer_role": "governing",
        "corpus_bucket": None,
        "variant_group": None,
        "variant_date": None,
        "retrieval_ready": True,
    }

    report = build_corpus_audit_report(
        source_families=(get_source_family("state_plan_amendment"),),
        registry_rows=[],
        local_files=[],
        parsed_sidecars=[],
        graph_documents=[
            graph_document,
            {
                **graph_document,
                "source_url": "https://example.test/spa-b.pdf",
                "source_path": "state-plan-amendments/spa-b.pdf",
            },
        ],
    )

    assert report["summary"]["duplicate_document_ids"] == 1
    assert report["summary"]["duplicate_document_id_values"] == [
        "doc:state_plan_amendment:duplicate"
    ]


def test_audit_reports_duplicate_registry_identities_as_a_release_blocker(tmp_path):
    first = _registry_row(
        "state_plan_amendment",
        tmp_path / "spa-a.pdf",
    )
    second = {
        **_registry_row(
            "state_plan_amendment",
            tmp_path / "spa-a-copy.pdf",
        ),
        "id": 2,
        "source_url": f"{first['source_url']}#page=4",
    }

    report = build_corpus_audit_report(
        source_families=(get_source_family("state_plan_amendment"),),
        registry_rows=[first, second],
        local_files=[],
        parsed_sidecars=[],
        graph_documents=[],
    )

    assert report["summary"]["duplicate_document_ids"] == 1
    assert len(report["summary"]["duplicate_document_id_values"]) == 1
