"""Dates read from policy banners, notice headers and revision rows (DATA-2)."""

from datetime import date

import pytest

from pipeline.policy_dates import (
    banner_date,
    notice_header_date,
    parse_stated_date,
    revision_row_rejection,
)


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("DATE: 03/03/2015", date(2015, 3, 3)),
        ("DATE: 3-3-2015", date(2015, 3, 3)),
        ("DATE: 12/29/99", date(1999, 12, 29)),
        ("DATE: March 3, 2015", date(2015, 3, 3)),
        ("**DATE:** Sept. 1 2021", date(2021, 9, 1)),
        ("| DATE: | 3 March 2015 |", date(2015, 3, 3)),
    ],
)
def test_notice_header_date_reads_each_observed_shape(line, expected):
    assert notice_header_date(f"CHANGE NOTICE FOR MANUAL NO. 04-15\n{line}\nMANUAL: Adult Medicaid") == expected


def test_notice_without_a_date_line_has_no_date():
    assert notice_header_date("CHANGE NOTICE FOR MANUAL NO. 04-15\nEFFECTIVE: Upon receipt") is None
    assert notice_header_date("DATE: Upon receipt") is None
    # "UPDATE: 01/02/2015" is not a DATE line.
    assert notice_header_date("UPDATE: 01/02/2015") is None


def test_banner_prefers_amended_date_then_effective_date_after_policy_no():
    assert banner_date("Clinical Coverage Policy No: 10C\nAmended Date: March 15, 2019") == date(2019, 3, 15)
    assert banner_date("Policy No: 1E-3 Effective Date: 01/01/2020") == date(2020, 1, 1)
    # "Original Effective Date" is the first date, and an effective date
    # ahead of the policy number is body text, not the banner.
    assert banner_date("Policy No: 1A-1 Original Effective Date: July 1, 1988") is None
    assert banner_date("Effective Date: 01/01/2020\nPolicy No: 1A-1") is None


def test_month_zero_is_not_a_date():
    assert parse_stated_date("00/15/2019") is None


def test_revision_row_bound_runs_from_source_changed_at_or_the_load_date():
    changed = "2024-05-02T10:00:00Z"
    assert revision_row_rejection(date(2025, 5, 3), changed) is None
    assert revision_row_rejection(date(2025, 5, 4), changed) is not None
    # 1E-3: a 2028 row in a file last changed in 2024.
    assert revision_row_rejection(date(2028, 1, 1), changed) is not None
    # No source_changed_at: bounded against the day of the load.
    today = date(2026, 10, 6)
    assert revision_row_rejection(date(2027, 10, 7), None, today=today) is None
    assert revision_row_rejection(date(2028, 1, 1), None, today=today) is not None
    assert revision_row_rejection(None, changed) == "not a calendar date"


@pytest.mark.parametrize(
    "text",
    [
        "DATE: DECISION 5, 2021",
        "DATE: \nRE: MARKET 3, 2020",
        "DATE: JUNIOR 1, 2020",
    ],
)
def test_a_word_that_only_starts_like_a_month_is_not_a_month(text):
    assert parse_stated_date(text) is None


def test_a_banner_must_open_with_its_date():
    assert banner_date("Amended Date: see 01/01/2019") is None
    assert banner_date("Amended Date: Sept. 1, 2024") is not None
