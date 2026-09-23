import sqlite3

import pytest

from pipeline.recovery_inventory import (
    missing_source_payloads,
    require_downloaded_sources,
)


def test_failed_download_without_path_cannot_disappear_from_release(tmp_path):
    path = tmp_path / "crawler.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE documents(source_url,source_type,status,error_message,local_path)"
        )
        db.executemany(
            "INSERT INTO documents VALUES(?,?,?,?,?)",
            [
                (
                    "https://policies.ncdhhs.gov/missing.pdf",
                    "dhhs_policy",
                    "error",
                    "HTTP 403",
                    None,
                ),
                (
                    "https://policies.ncdhhs.gov/retired.pdf",
                    "dhhs_policy",
                    "removed",
                    "HTTP 404",
                    None,
                ),
                (
                    "https://policies.ncdhhs.gov/good.pdf",
                    "dhhs_policy",
                    "downloaded",
                    None,
                    "fee-schedules/good.pdf",
                ),
            ],
        )
    (tmp_path / "documents/fee-schedules").mkdir(parents=True)
    (tmp_path / "documents/fee-schedules/good.pdf").write_bytes(b"original")
    rows = missing_source_payloads(path)
    assert len(rows) == 1 and rows[0]["required_for_answering"] is True
    with pytest.raises(RuntimeError, match="no downloaded payload"):
        require_downloaded_sources(path)
    with sqlite3.connect(path) as db:
        db.execute(
            "UPDATE documents SET local_path='fee-schedules/recovered.pdf' WHERE status='error'"
        )
    (tmp_path / "documents/fee-schedules/recovered.pdf").write_bytes(b"recovered")
    require_downloaded_sources(path)


def test_optional_supporting_sources_remain_visible_without_weakening_required_policy(
    tmp_path,
):
    path = tmp_path / "crawler.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE documents(source_url,source_type,status,error_message,local_path)"
        )
        db.execute(
            "INSERT INTO documents VALUES('https://files.nc.gov/missing.pdf','fee_schedule','error','HTTP 403',NULL)"
        )
    assert missing_source_payloads(path)[0]["required_for_answering"] is False
    require_downloaded_sources(path)


def test_lost_local_payload_is_still_a_required_failure(tmp_path):
    path = tmp_path / "crawler.db"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE documents(source_url,source_type,status,error_message,local_path)")
        db.execute("INSERT INTO documents VALUES('https://policies.ncdhhs.gov/lost.pdf','dhhs_policy','downloaded',NULL,'lost.pdf')")
    assert missing_source_payloads(path)[0]["required_for_answering"] is True
