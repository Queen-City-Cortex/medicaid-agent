"""Policy dates read from excerpts of real parsed documents (DATA-2).

Each fixture under `fixtures/policy_dates/` names its source file and holds
the sections the loader builds from it, cut down to the title block and the
revision rows the test is about.
"""

import json
import logging
from pathlib import Path

import pytest

from pipeline.graph.loader import _extract_effective_date
from pipeline.references.amendments import _parse_revision_rows

_FIXTURES = Path(__file__).parent / "fixtures" / "policy_dates"


def _fixture(name: str) -> dict:
    return json.loads((_FIXTURES / f"{name}.json").read_text())


def _date(name: str, source_type: str) -> str | None:
    fixture = _fixture(name)
    return _extract_effective_date(source_type, fixture["title"], fixture["sections"])


def _revision_content(name: str) -> str:
    return _fixture(name)["sections"][-1]["content_text"]


def test_10c_takes_its_banner_though_its_last_history_row_is_later():
    assert "| 12/15/2023 |" in _revision_content("10c")
    assert _date("10c", "clinical_policy") == "2023-04-01"


def test_1e_3_is_dated_by_its_banner_and_a_year_in_a_description_is_not_a_date():
    content = _revision_content("1e-3")
    assert "07/31/2028" in content
    assert _date("1e-3", "clinical_policy") == "2026-01-01"
    assert [row["effective_date"] for row in _parse_revision_rows(content)] == ["2025-08-15"]


def test_2a_1_banner_with_a_period_after_the_day_is_read():
    assert "Amended Date: January 1. 2026" in _fixture("2a-1")["sections"][1]["content_text"]
    assert _date("2a-1", "clinical_policy") == "2026-01-01"


def test_11a_10_row_dated_2105_is_not_a_revision():
    content = _revision_content("11a-10")
    assert "| 09/01/2105 |" in content
    assert [row["effective_date"] for row in _parse_revision_rows(content)] == [
        "2005-07-01", "2005-12-01",
    ]


def test_11a_10_without_its_banner_falls_back_to_its_latest_valid_row():
    fixture = _fixture("11a-10")
    assert _extract_effective_date(
        "clinical_policy", fixture["title"], fixture["sections"][-1:],
    ) == "2005-12-01"


def test_1c_1_rows_with_month_or_day_zero_are_not_revisions():
    content = _revision_content("1c-1")
    assert "| 0/01/2010 " in content and "| 05/0/07 " in content
    # 12/01/10 is a two-digit year, read with the change-notice pivot.
    assert [row["effective_date"] for row in _parse_revision_rows(content)] == ["2010-12-01"]


def test_rejected_rows_are_logged_with_policy_number_and_row_text(caplog):
    with caplog.at_level(logging.WARNING, logger="pipeline.policy_dates"):
        for name in ("11a-10", "1c-1"):
            fixture = _fixture(name)
            _parse_revision_rows(
                _revision_content(name),
                policy_number=fixture["policy_number"],
                source_changed_at=fixture["source_changed_at"],
            )
    messages = [record.getMessage() for record in caplog.records]
    assert len(messages) == 3
    assert "11A-10" in messages[0] and "| 09/01/2105 " in messages[0]
    assert "after 2026-03-27" in messages[0]
    assert "1C-1" in messages[1] and "| 05/0/07 " in messages[1]
    assert "1C-1" in messages[2] and "| 0/01/2010 " in messages[2]


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("notice-month-day-comma-year", "2004-06-17"),
        ("notice-month-day-year-no-comma", "2018-12-17"),
        ("notice-slash-four-digit-year", "2015-06-19"),
        ("notice-slash-two-digit-year", "2014-03-04"),
        ("notice-hyphen-date", "2010-09-24"),
        ("notice-date-on-next-line", "2002-08-19"),
        ("notice-date-line-as-section-title", "2024-01-02"),
        ("notice-misspelt-month", "2025-01-29"),
    ],
)
def test_change_notice_is_dated_by_its_header_date_line(name, expected):
    assert _date(name, "dhhs_policy") == expected


@pytest.mark.parametrize("name", ["notice-empty-date-line", "notice-no-date-line"])
def test_change_notice_without_a_dated_date_line_has_no_date(name):
    # 07-04 has an empty `DATE:`; 10-18 prints a date with no `DATE:` label.
    # Neither gets January 1 of its year.
    assert _date(name, "dhhs_policy") is None


def test_a_notice_numbered_for_one_year_and_dated_in_another_is_logged(caplog):
    with caplog.at_level(logging.WARNING, logger="pipeline.policy_dates"):
        assert _date("notice-month-day-comma-year", "dhhs_policy") == "2004-06-17"
    assert "numbered for 2005" in caplog.text


def test_revision_headings_are_the_real_titles_not_any_history():
    from pipeline.references.amendments import is_revision_heading

    for title in (
        "Revision Information:",
        "8.0 Policy Implementation/Revision Information",
        "8.0 Policy Implementation and History",
        "History:",
    ):
        assert is_revision_heading(title)
    for title in ("Psychosocial History", "Family History", "3.2.1 Evaluate Beneficiary History", None):
        assert not is_revision_heading(title)
