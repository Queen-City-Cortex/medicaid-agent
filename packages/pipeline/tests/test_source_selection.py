"""Tests for corpus selection metadata and fee-schedule canonicalization."""

from pipeline.source_selection import (
    build_fee_schedule_backlog_report,
    build_source_selection_index,
    render_fee_schedule_backlog_markdown,
    resolve_source_selection_metadata,
)


def _entry(
    *,
    title: str,
    source_url: str,
    local_path: str,
    source_format: str,
    status: str = "downloaded",
) -> dict:
    return {
        "source_type": "fee_schedule",
        "title": title,
        "source_url": source_url,
        "local_path": local_path,
        "source_format": source_format,
        "status": status,
    }


def test_fee_schedule_selection_prefers_spreadsheet_current_and_bounded_history():
    entries = [
        _entry(
            title="Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
            source_url="https://example.test/ambulance-2022.xlsx",
            local_path="fee-schedules/ambulance-2022.xlsx",
            source_format=".xlsx",
        ),
        _entry(
            title="Ambulance Fee Schedule - Jan. 1, 2022 - PDF",
            source_url="https://example.test/ambulance-2022.pdf",
            local_path="fee-schedules/ambulance-2022.pdf",
            source_format=".pdf",
        ),
        _entry(
            title="Ambulance Fee Schedule - Oct. 22, 2021 - EXCEL",
            source_url="https://example.test/ambulance-2021.xlsx",
            local_path="fee-schedules/ambulance-2021.xlsx",
            source_format=".xlsx",
        ),
        _entry(
            title="Ambulance Fee Schedule - July 28, 2020 - EXCEL",
            source_url="https://example.test/ambulance-2020.xlsx",
            local_path="fee-schedules/ambulance-2020.xlsx",
            source_format=".xlsx",
        ),
        _entry(
            title="Ambulance Fee Schedule - June 2019 - EXCEL",
            source_url="https://example.test/ambulance-2019.xlsx",
            local_path="fee-schedules/ambulance-2019.xlsx",
            source_format=".xlsx",
        ),
        _entry(
            title="DHB Fee Schedule - External User Guide",
            source_url="https://example.test/guide.pdf",
            local_path="fee-schedules/guide.pdf",
            source_format=".pdf",
        ),
    ]

    index = build_source_selection_index(entries)

    current = resolve_source_selection_metadata(entries[0], index)
    companion = resolve_source_selection_metadata(entries[1], index)
    prior = resolve_source_selection_metadata(entries[2], index)
    older = resolve_source_selection_metadata(entries[3], index)
    archive = resolve_source_selection_metadata(entries[4], index)
    guide = resolve_source_selection_metadata(entries[5], index)

    assert current.variant_group == "ambulance fee schedule"
    assert current.variant_date == "2022-01-01"
    assert current.corpus_bucket == "primary"
    assert current.retrieval_ready is True

    assert companion.corpus_bucket == "companion"
    assert companion.retrieval_ready is False

    assert prior.corpus_bucket == "history"
    assert prior.retrieval_ready is True

    assert older.corpus_bucket == "history"
    assert older.retrieval_ready is True

    assert archive.corpus_bucket == "archive"
    assert archive.retrieval_ready is False

    assert guide.corpus_bucket == "reference"
    assert guide.retrieval_ready is False


def test_fee_schedule_selection_infers_format_from_registry_paths():
    entries = [
        {
            "source_type": "fee_schedule",
            "title": "Ambulance Fee Schedule - July 28, 2020 - EXCEL",
            "source_url": "https://example.test/ambulance-2020.xlsx",
            "local_path": "fee-schedules/ambulance-2020.xlsx",
            "status": "downloaded",
        },
        {
            "source_type": "fee_schedule",
            "title": "Ambulance Fee Schedule - July 28, 2020 - PDF",
            "source_url": "https://example.test/ambulance-2020.pdf",
            "local_path": "fee-schedules/ambulance-2020.pdf",
            "status": "downloaded",
        },
    ]

    index = build_source_selection_index(entries)

    assert resolve_source_selection_metadata(entries[0], index).corpus_bucket == "primary"
    assert resolve_source_selection_metadata(entries[1], index).corpus_bucket == "companion"


def test_fee_schedule_selection_normalizes_month_comma_year_titles():
    entries = [
        _entry(
            title="Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
            source_url="https://example.test/ambulance-2022.xlsx",
            local_path="fee-schedules/ambulance-2022.xlsx",
            source_format=".xlsx",
        ),
        _entry(
            title="Ambulance Fee Schedule - May, 2020- EXCEL",
            source_url="https://example.test/ambulance-2020.xlsx",
            local_path="fee-schedules/ambulance-2020.xlsx",
            source_format=".xlsx",
        ),
    ]

    index = build_source_selection_index(entries)

    current = resolve_source_selection_metadata(entries[0], index)
    prior = resolve_source_selection_metadata(entries[1], index)

    assert current.variant_group == "ambulance fee schedule"
    assert prior.variant_group == "ambulance fee schedule"
    assert current.corpus_bucket == "primary"
    assert prior.corpus_bucket == "history"


def test_fee_schedule_selection_normalizes_cap_aliases_and_missing_suffixes():
    entries = [
        _entry(
            title="CAP/CH Fee Schedule - Jan. 22, 2022 - Excel",
            source_url="https://example.test/capch-2022.xlsx",
            local_path="fee-schedules/capch-2022.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
        _entry(
            title="CAPCH Fee Schedule - July 27, 2021 - Excel",
            source_url="https://example.test/capch-2021.xlsx",
            local_path="fee-schedules/capch-2021.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
        _entry(
            title="Federally Qualified Health Centers - Jan. 22, 2022 - EXCEL",
            source_url="https://example.test/fqhc-2022.xlsx",
            local_path="fee-schedules/fqhc-2022.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
    ]

    index = build_source_selection_index(entries)

    assert resolve_source_selection_metadata(entries[0], index).variant_group == "cap ch fee schedule"
    assert resolve_source_selection_metadata(entries[1], index).variant_group == "cap ch fee schedule"
    assert resolve_source_selection_metadata(entries[2], index).variant_group == "federally qualified health center fee schedule"


def test_fee_schedule_backlog_report_prioritizes_missing_primary_groups():
    entries = [
        _entry(
            title="Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
            source_url="https://example.test/ambulance-2022.xlsx",
            local_path="fee-schedules/ambulance-2022.xlsx",
            source_format=".xlsx",
            status="downloaded",
        ),
        _entry(
            title="Ambulance Fee Schedule - July 28, 2020 - EXCEL",
            source_url="https://example.test/ambulance-2020.xlsx",
            local_path="fee-schedules/ambulance-2020.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
        _entry(
            title="CAP/CH Fee Schedule - Jan. 22, 2022 - Excel",
            source_url="https://example.test/capch-2022.xlsx",
            local_path="fee-schedules/capch-2022.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
        _entry(
            title="CAP/CH Fee Schedule - Dec. 22, 2021 - Excel",
            source_url="https://example.test/capch-2021.xlsx",
            local_path="fee-schedules/capch-2021.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
    ]

    report = build_fee_schedule_backlog_report(entries, group_limit=10, candidate_limit=10)

    assert report["summary"]["discovered_retrieval_ready"] == 3
    assert report["summary"]["groups_missing_downloaded_retrieval_ready"] == 1
    assert report["summary"]["groups_with_history_candidates_only"] == 1
    assert report["groups"][0]["variant_group"] == "cap ch fee schedule"
    assert report["groups"][0]["priority"] == "critical"

    markdown = render_fee_schedule_backlog_markdown(report)
    assert "cap ch fee schedule" in markdown
    assert "critical" in markdown


def test_fee_schedule_selection_prefers_dated_variants_over_undated_ones():
    entries = [
        _entry(
            title="Anesthesiology Base Units - 2018 - EXCEL",
            source_url="https://example.test/anesth-undated.xlsx",
            local_path="fee-schedules/anesth-undated.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
        _entry(
            title="Anesthesiology Base Units -Jan. 22, 2022 - EXCEL",
            source_url="https://example.test/anesth-2022.xlsx",
            local_path="fee-schedules/anesth-2022.xlsx",
            source_format=".xlsx",
            status="discovered",
        ),
    ]

    index = build_source_selection_index(entries)

    current = resolve_source_selection_metadata(entries[1], index)
    older = resolve_source_selection_metadata(entries[0], index)

    assert current.corpus_bucket == "primary"
    assert older.corpus_bucket == "history"
