import copy
import hashlib
import json
import sqlite3

import pytest

from pipeline.source_audit import apply_source_audit
from pipeline.source_lifecycle import stable_hash, lifecycle_snapshot


def fixture(tmp_path, codes=(404, 404, 404)):
    (tmp_path / "crawler").mkdir()
    url = "https://policies.ncdhhs.gov/document/old/"
    with sqlite3.connect(tmp_path / "crawler/crawler.db") as db:
        db.execute(
            "CREATE TABLE documents(source_url TEXT PRIMARY KEY,source_type TEXT,status TEXT,local_path TEXT,download_attempts INTEGER,consecutive_not_found INTEGER,last_checked_at TEXT)"
        )
        db.execute(
            "INSERT INTO documents VALUES(?, 'dhhs_policy','removed',NULL,0,0,'2025-01-01')",
            (url,),
        )
    observations = []
    for index, code in enumerate(codes, 1):
        folder = tmp_path / str(index)
        folder.mkdir()
        (folder / "body").write_bytes(b"official response")
        capture = {
            "url": url,
            "status_code": code,
            "checked_at": f"2025-01-0{index + 1}T12:00:00Z",
            "sha256": hashlib.sha256(b"official response").hexdigest(),
            "capture_path": "body",
        }
        audit = folder / "audit.json"
        audit.write_text(json.dumps({"schema_version": 1, "captures": {url: capture}}))
        observations.append(
            {
                "audit": {
                    "capture_path": f"{index}/audit.json",
                    "sha256": hashlib.sha256(audit.read_bytes()).hexdigest(),
                }
            }
        )
    action = {
        "action_id": "availability-1",
        "source_url": url,
        "registry_hash": stable_hash(current(tmp_path)),
        "disposition": "availability",
        "evidence": {"schema_version": 1, "observations": observations},
    }
    return {"schema_version": 1, "actions": [action]}


def current(root):
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        db.row_factory = sqlite3.Row
        return dict(db.execute("SELECT * FROM documents").fetchone())


def test_reviewed_observations_are_atomic_dry_run_and_never_count_twice(tmp_path):
    reviewed = fixture(tmp_path)
    before = current(tmp_path)
    assert apply_source_audit(tmp_path, reviewed)[0]["consecutive_not_found"] == 3
    assert current(tmp_path) == before
    snapshot_before = stable_hash(
        lifecycle_snapshot(tmp_path / "crawler/crawler.db", {})
    )
    first = apply_source_audit(tmp_path, reviewed, apply=True)
    assert (
        stable_hash(lifecycle_snapshot(tmp_path / "crawler/crawler.db", {}))
        != snapshot_before
    )
    assert first[0]["new_observations"] == 3
    assert current(tmp_path)["status"] == "removed"
    assert current(tmp_path)["download_attempts"] == 0
    assert apply_source_audit(tmp_path, reviewed, apply=True) == first
    duplicate = copy.deepcopy(reviewed)
    duplicate["actions"][0].update(
        action_id="different-review", registry_hash=stable_hash(current(tmp_path))
    )
    assert (
        apply_source_audit(tmp_path, duplicate, apply=True)[0]["new_observations"] == 0
    )
    assert current(tmp_path)["consecutive_not_found"] == 3


def test_success_resets_streak_without_reactivating(tmp_path):
    reviewed = fixture(tmp_path, (404, 200, 404))
    assert (
        apply_source_audit(tmp_path, reviewed, apply=True)[0]["consecutive_not_found"]
        == 1
    )
    assert current(tmp_path)["status"] == "removed"


@pytest.mark.parametrize("has_redirect_chain", [False, True])
def test_redirect_destination_404_breaks_original_source_streak(
    tmp_path, has_redirect_chain
):
    reviewed = fixture(tmp_path)
    manifest = tmp_path / "2/audit.json"
    audit = json.loads(manifest.read_text())
    source_url = reviewed["actions"][0]["source_url"]
    destination = "https://policies.ncdhhs.gov/document/other/"
    capture = audit["captures"][source_url]
    capture["final_url"] = destination
    if has_redirect_chain:
        capture["redirects"] = [{"location": destination}]
    manifest.write_text(json.dumps(audit))
    reviewed["actions"][0]["evidence"]["observations"][1]["audit"]["sha256"] = (
        hashlib.sha256(manifest.read_bytes()).hexdigest()
    )

    result = apply_source_audit(tmp_path, reviewed, apply=True)
    assert result[0]["new_observations"] == 3
    assert result[0]["consecutive_not_found"] == 1
    assert current(tmp_path)["consecutive_not_found"] == 1
    assert current(tmp_path)["status"] == "removed"


@pytest.mark.parametrize(
    "mutation", ["capture", "manifest", "duplicate", "stale_registry"]
)
def test_tampering_duplicate_and_stale_registry_fail(tmp_path, mutation):
    reviewed = fixture(tmp_path)
    if mutation == "capture":
        (tmp_path / "1/body").write_bytes(b"tampered")
    if mutation == "manifest":
        (tmp_path / "1/audit.json").write_text("{}")
    if mutation == "duplicate":
        reviewed["actions"][0]["evidence"]["observations"] *= 2
    if mutation == "stale_registry":
        with sqlite3.connect(tmp_path / "crawler/crawler.db") as db:
            db.execute("UPDATE documents SET consecutive_not_found=9")
    with pytest.raises(ValueError):
        apply_source_audit(tmp_path, reviewed, apply=True)
    assert current(tmp_path)["download_attempts"] == 0


def test_late_observations_cannot_overwrite_newer_checks(tmp_path):
    reviewed = fixture(tmp_path)
    with sqlite3.connect(tmp_path / "crawler/crawler.db") as db:
        db.execute("UPDATE documents SET last_checked_at='2025-02-01'")
    reviewed["actions"][0]["registry_hash"] = stable_hash(current(tmp_path))
    with pytest.raises(ValueError, match="predates"):
        apply_source_audit(tmp_path, reviewed, apply=True)


@pytest.mark.parametrize(
    "capture_update",
    [
        {"error": "getaddrinfo ENOTFOUND official.example"},
        {"blocked_by": "host-unavailable"},
        {"final_url": "https://unapproved.example/missing"},
    ],
)
def test_failed_unvisited_or_unapproved_requests_cannot_authorize_retirement(
    tmp_path, capture_update
):
    reviewed = fixture(tmp_path)
    before = current(tmp_path)
    manifest = tmp_path / "3/audit.json"
    audit = json.loads(manifest.read_text())
    audit["captures"][before["source_url"]].update(capture_update)
    manifest.write_text(json.dumps(audit))
    reviewed["actions"][0]["evidence"]["observations"][2]["audit"]["sha256"] = (
        hashlib.sha256(manifest.read_bytes()).hexdigest()
    )
    with pytest.raises(ValueError, match="HTTP observation|unapproved redirect"):
        apply_source_audit(tmp_path, reviewed, apply=True)
    assert current(tmp_path) == before


def test_interruption_before_journal_rolls_back_counter_update(tmp_path, monkeypatch):
    from pipeline import availability

    reviewed = fixture(tmp_path)
    before = current(tmp_path)
    original = availability.apply_availability

    def interrupted(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("interrupted before journal")

    monkeypatch.setattr(availability, "apply_availability", interrupted)
    with pytest.raises(RuntimeError, match="interrupted"):
        apply_source_audit(tmp_path, reviewed, apply=True)
    assert current(tmp_path) == before
    monkeypatch.setattr(availability, "apply_availability", original)
    assert (
        apply_source_audit(tmp_path, reviewed, apply=True)[0]["consecutive_not_found"]
        == 3
    )
