"""Dates a policy document states about itself.

One place builds them, on `datetime.date`, so the loader and the revision-row
parser agree on what a date is: month 00 or February 30 is not one.
"""

import logging
import re
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# A revision row describes a change already made, so it cannot postdate the
# file that carries it by more than a publication lead: 11A-10 has a row
# dated 09/01/2105 and 1E-3 one dated 2028.
REVISION_ROW_MAX_LEAD_DAYS = 366

_MONTHS = {
    name: number
    for number, name in enumerate(
        ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"),
        start=1,
    )
}
# Full names, their usual abbreviations, and the one misspelling a change
# notice carries ("JANAURY 29, 2025"). Any other word is not a month:
# "MARKET 3, 2020" and "DECISION 5, 2021" must not read as dates.
_MONTH_NAMES = (
    "january", "janaury", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sept", "sep", "oct", "nov", "dec",
)
_MONTH_WORD = rf"({'|'.join(_MONTH_NAMES)})(?![a-z])"

_NUMERIC_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)")
# The day may be followed by a comma, a period ("January 1. 2026", 2A-1) or
# neither ("December 17 2018").
_MONTH_DAY_YEAR_RE = re.compile(
    rf"\b{_MONTH_WORD}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*[.,]?\s*(\d{{4}})\b",
    re.IGNORECASE,
)
_DAY_MONTH_YEAR_RE = re.compile(
    rf"(?<!\d)(\d{{1,2}})\s+{_MONTH_WORD}\.?,?\s+(\d{{4}})\b",
    re.IGNORECASE,
)

# A clinical policy's title block: "Amended Date: March 15, 2024", or
# "Effective Date: 01/01/2020" on a policy never amended. "Original Effective
# Date:" is the policy's first date, not its current one.
# The colon separates the banner from history prose ("amended date not
# changed"); the date follows it directly, on the same or the next line.
_AMENDED_BANNER_RE = re.compile(r"Amended\s+Date\s*:\s*([^\n|]{0,40})", re.IGNORECASE)
_EFFECTIVE_BANNER_RE = re.compile(
    r"(?<!Original )Effective\s+Date\s*:?\s*([^\n|]{0,40})", re.IGNORECASE
)
_POLICY_NO_RE = re.compile(r"Policy\s+No\s*[.:]", re.IGNORECASE)
# A change notice's header: "DATE: March 3, 2015", "DATE: 03/03/2015",
# markdown-bold or table-cell variants of the same line.
_NOTICE_DATE_LINE_RE = re.compile(
    r"^[\s|*#]*DATE\b[\s*]*:[\s|*]*([^\n|]{0,40})", re.IGNORECASE | re.MULTILINE
)


def build_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def build_numeric_date(month: str, day: str, year: str) -> date | None:
    """Build a date from the digit groups of `MM/DD/YYYY` or `MM/DD/YY`."""
    full_year = int(year)
    if len(year) == 2:
        # The same pivot the loader applies to a change notice's number.
        full_year += 2000 if full_year < 50 else 1900
    return build_date(full_year, int(month), int(day))


def parse_stated_date(text: str) -> date | None:
    """Read the first date in `text`, in any shape the corpus writes one.

    Six shapes: `MM/DD/YYYY`, `MM-DD-YYYY`, `MM/DD/YY`, `Month D, YYYY`,
    `Mon. D YYYY` (abbreviated, comma optional, ordinal allowed) and
    `D Month YYYY`.
    """
    candidates: list[tuple[int, date | None]] = []
    if match := _NUMERIC_DATE_RE.search(text):
        candidates.append((match.start(), build_numeric_date(*match.groups())))
    if match := _MONTH_DAY_YEAR_RE.search(text):
        candidates.append((
            match.start(),
            build_date(int(match.group(3)), _MONTHS[match.group(1)[:3].lower()], int(match.group(2))),
        ))
    if match := _DAY_MONTH_YEAR_RE.search(text):
        candidates.append((
            match.start(),
            build_date(int(match.group(3)), _MONTHS[match.group(2)[:3].lower()], int(match.group(1))),
        ))
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def _leading_date(value: str) -> date | None:
    """The date a banner value opens with; a date further along is prose."""
    found = parse_stated_date(value[:24])
    opens_with_date = re.match(rf"\s*(?:\d|{_MONTH_WORD}\.?\s+\d)", value, re.IGNORECASE)
    return found if found and opens_with_date else None


def banner_date(text: str) -> date | None:
    """A clinical policy's current date from its title block, if it states one."""
    for match in _AMENDED_BANNER_RE.finditer(text):
        if found := _leading_date(match.group(1)):
            return found
    policy_no = _POLICY_NO_RE.search(text)
    if policy_no and (match := _EFFECTIVE_BANNER_RE.search(text, policy_no.end())):
        return _leading_date(match.group(1))
    return None


def notice_header_date(text: str) -> date | None:
    """A change notice's own date from its header `DATE:` line."""
    match = _NOTICE_DATE_LINE_RE.search(text)
    return parse_stated_date(match.group(1)) if match else None


def revision_row_rejection(
    row_date: date | None,
    source_changed_at: str | None,
    *,
    today: date | None = None,
) -> str | None:
    """Why a revision row's date cannot be trusted, or None when it can.

    The bound is the day the source file last changed. A document without
    one is bounded against the load date instead: a row cannot describe a
    change later than a year after the day it is read, whenever the file
    was published.
    """
    if row_date is None:
        return "not a calendar date"
    reference = today or date.today()
    if source_changed_at:
        try:
            reference = date.fromisoformat(str(source_changed_at)[:10])
        except ValueError:
            logger.warning("Unreadable source_changed_at %r; bounding revision rows by the load date", source_changed_at)
    if row_date > reference + timedelta(days=REVISION_ROW_MAX_LEAD_DAYS):
        return f"more than {REVISION_ROW_MAX_LEAD_DAYS} days after {reference.isoformat()}"
    return None
