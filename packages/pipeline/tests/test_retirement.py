import hashlib
import json
import sqlite3
from datetime import UTC, datetime

import pytest

from pipeline.retirement import corpus_writer_lock, read_retirements, retire_source


@pytest.fixture
def retirement(tmp_path):
    source = tmp_path / "crawler/documents/dhhs-policies/missing.pdf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"<html>old invalid source</html>")
    url = "https://policies.ncdhhs.gov/document/missing/"
    with sqlite3.connect(tmp_path / "crawler/crawler.db") as db:
        db.execute(
            "CREATE TABLE documents(source_url TEXT PRIMARY KEY,source_type TEXT,local_path TEXT,status TEXT,removed_at TEXT,consecutive_not_found INTEGER)"
        )
        db.execute(
            "INSERT INTO documents VALUES(?,?,?,'error',NULL,3)",
            (url, "dhhs_policy", "dhhs-policies/missing.pdf"),
        )
    capture = tmp_path / "pipeline/source-retirement-evidence/index.html"
    capture.parent.mkdir(parents=True)
    capture.write_bytes(b"official index response")
    evidence = {
        "schema_version": 1,
        "source_url": url,
        "basis": "not_found",
        "reason": "Three confirmed 404 responses; official index no longer lists this document.",
        "original_artifact_hash": "sha256:"
        + hashlib.sha256(source.read_bytes()).hexdigest(),
        "evidence": [
            {
                "kind": "index_investigation",
                "url": "https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/",
                "checked_at": datetime.now(UTC).isoformat(),
                "sha256": hashlib.sha256(capture.read_bytes()).hexdigest(),
                "capture_path": "pipeline/source-retirement-evidence/index.html",
                "finding": "The current official index contains no matching form or replacement.",
            }
        ],
    }
    return tmp_path, source, evidence


def test_retirement_dry_run_then_idempotent_apply_and_restore(retirement, tmp_path):
    root, source, evidence = retirement
    assert retire_source(root, evidence)["status"] == "validated"
    assert read_retirements(root / "crawler/crawler.db") == []
    assert retire_source(root, evidence, apply=True)["status"] == "retired"
    assert retire_source(root, evidence, apply=True)["status"] == "already_retired"
    assert source.exists()
    restored = tmp_path / "restored.db"
    with (
        sqlite3.connect(root / "crawler/crawler.db") as db,
        sqlite3.connect(restored) as backup,
    ):
        db.backup(backup)
        assert db.execute("SELECT status FROM documents").fetchone()[0] == "removed"
        assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert read_retirements(restored) == read_retirements(root / "crawler/crawler.db")


@pytest.mark.parametrize(
    "change",
    [
        {"basis": "missing_attachment"},
        {"schema_version": 2},
        {"original_artifact_hash": "sha256:" + "0" * 64},
        {"evidence": []},
        {"basis": "withdrawn"},
    ],
)
def test_rejects_insufficient_or_incompatible_evidence(retirement, change):
    root, _, evidence = retirement
    with pytest.raises(ValueError):
        retire_source(root, {**evidence, **change}, apply=True)
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        assert db.execute("SELECT status FROM documents").fetchone()[0] == "error"


def test_requires_three_real_404s_and_exclusive_writer(retirement):
    root, _, evidence = retirement
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        db.execute("UPDATE documents SET consecutive_not_found=2")
    with pytest.raises(ValueError, match="Three"):
        retire_source(root, evidence, apply=True)
    with corpus_writer_lock(root), pytest.raises(BlockingIOError):
        retire_source(root, evidence, apply=True)


def test_recorded_evidence_cannot_be_replaced(retirement):
    root, _, evidence = retirement
    retire_source(root, evidence, apply=True)
    evidence["reason"] = (
        "A different claim must not replace previously recorded evidence."
    )
    with pytest.raises(ValueError, match="overwritten"):
        retire_source(root, evidence, apply=True)
    stored = json.loads(
        read_retirements(root / "crawler/crawler.db")[0]["evidence_json"]
    )
    assert stored["reason"] != evidence["reason"]


def test_old_removed_status_cannot_bypass_retirement_evidence(retirement):
    from pipeline.retirement import undocumented_removals, require_documented_removals

    root, _, evidence = retirement
    db_path = root / "crawler/crawler.db"
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE documents SET status='removed'")
    assert len(undocumented_removals(db_path)) == 1
    with pytest.raises(RuntimeError, match="lack retirement evidence"):
        require_documented_removals(db_path)
    retire_source(root, evidence, apply=True)
    require_documented_removals(db_path)
    assert undocumented_removals(db_path) == []


def test_tampered_official_capture_is_rejected(retirement):
    root, _, evidence = retirement
    (root / evidence["evidence"][0]["capture_path"]).write_text("different response")
    with pytest.raises(ValueError, match="response hash mismatch"):
        retire_source(root, evidence, apply=True)


def test_release_rechecks_captured_evidence_after_retirement(retirement):
    from pipeline.retirement import require_documented_removals

    root, _, evidence = retirement
    retire_source(root, evidence, apply=True)
    (root / evidence["evidence"][0]["capture_path"]).unlink()
    with pytest.raises(RuntimeError, match="changed after investigation"):
        require_documented_removals(root / "crawler/crawler.db")
