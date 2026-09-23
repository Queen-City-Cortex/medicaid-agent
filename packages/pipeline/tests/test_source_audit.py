import hashlib
import sqlite3

import pytest

from pipeline.source_audit import apply_source_audit, validate_classifications
from pipeline.source_lifecycle import stable_hash, lifecycle_snapshot


@pytest.fixture
def source(tmp_path):
    (tmp_path / "crawler").mkdir()
    with sqlite3.connect(tmp_path / "crawler/crawler.db") as db:
        db.execute(
            "CREATE TABLE documents(id INTEGER PRIMARY KEY,source_url TEXT UNIQUE,source_type TEXT,discovered_from TEXT,title TEXT,status TEXT DEFAULT 'discovered',local_path TEXT)"
        )
        db.execute(
            "INSERT INTO documents(source_url,source_type,discovered_from,status) VALUES('https://policies.ncdhhs.gov/document/index/','dhhs_policy','https://policies.ncdhhs.gov/','error')"
        )
        db.row_factory = sqlite3.Row
        row = dict(db.execute("SELECT * FROM documents").fetchone())
    capture = tmp_path / "index.html"
    capture.write_text(
        '<a href="https://policies.ncdhhs.gov/document/child/">Actual document</a>'
    )
    evidence = {
        "schema_version": 1,
        "resource_role": "index",
        "finding": "This official page is an index whose complete document links were investigated.",
        "children": ["https://policies.ncdhhs.gov/document/child/"],
        "capture": {
            "url": row["source_url"],
            "status_code": 200,
            "capture_path": "index.html",
            "sha256": hashlib.sha256(capture.read_bytes()).hexdigest(),
        },
    }
    action = {
        "action_id": "index-v1",
        "source_url": row["source_url"],
        "registry_hash": stable_hash(row),
        "disposition": "classify",
        "evidence": evidence,
    }
    return tmp_path, {"schema_version": 1, "actions": [action]}


def test_classification_is_dry_run_then_atomic_and_idempotent(source):
    root, reviewed = source
    assert apply_source_audit(root, reviewed)[0]["status"] == "validated"
    first = apply_source_audit(root, reviewed, apply=True)
    assert apply_source_audit(root, reviewed, apply=True) == first
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        assert db.execute("SELECT count(*) FROM documents").fetchone()[0] == 2
        assert (
            db.execute("SELECT count(*) FROM source_audit_actions").fetchone()[0] == 1
        )
    validate_classifications(root / "crawler/crawler.db")


def test_classification_requires_all_children_and_unmodified_capture(source):
    root, reviewed = source
    action = reviewed["actions"][0]
    action["evidence"]["children"] = []
    with pytest.raises(ValueError, match="Every actual"):
        apply_source_audit(root, reviewed, apply=True)
    action["evidence"]["children"] = ["https://policies.ncdhhs.gov/document/child/"]
    (root / "index.html").write_text("tampered")
    with pytest.raises(ValueError, match="hash mismatch"):
        apply_source_audit(root, reviewed, apply=True)


def test_changed_registry_and_reused_action_are_rejected(source):
    root, reviewed = source
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        db.execute("UPDATE documents SET title='changed'")
    with pytest.raises(ValueError, match="Registry changed"):
        apply_source_audit(root, reviewed, apply=True)


def test_snapshot_includes_missing_downloads_and_classifications(source):
    root, reviewed = source
    before = lifecycle_snapshot(root / "crawler/crawler.db", {})
    assert before["sources"][0]["artifact_hash"] is None
    apply_source_audit(root, reviewed, apply=True)
    after = lifecycle_snapshot(root / "crawler/crawler.db", {})
    assert stable_hash(before) != stable_hash(after)
    assert len(after["sources"]) == 2
    assert after["classifications"][0]["resource_role"] == "index"
