import hashlib
import importlib.util
import io
import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "backup_check",
    Path(__file__).resolve().parents[3] / "scripts/ops/verify-corpus-backup.py",
)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def archive(
    tmp_path,
    *,
    tamper=False,
    omit_evidence=False,
    availability=False,
    omit_availability=False,
    relocation=False,
    relocation_change=None,
):
    db_path = tmp_path / "crawler.db"
    evidence = b"Official removal notice and index"
    capture = "pipeline/source-retirement-evidence/notice.html"
    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TABLE documents(id,source_url,local_path,status)")
        db.execute(
            "INSERT INTO documents VALUES(1,'https://policies.ncdhhs.gov/test.pdf','test.pdf','removed')"
        )
        db.execute(
            "CREATE TABLE source_retirements(id INTEGER, source_url TEXT, evidence_json TEXT)"
        )
        db.execute(
            "INSERT INTO source_retirements VALUES(1,'https://policies.ncdhhs.gov/test.pdf',?)",
            (
                json.dumps(
                    {
                        "schema_version": 1,
                        "original_artifact_hash": "sha256:"
                        + hashlib.sha256(b"%PDF-test").hexdigest(),
                        "evidence": [
                            {
                                "capture_path": capture,
                                "sha256": hashlib.sha256(evidence).hexdigest(),
                            }
                        ],
                    }
                ),
            ),
        )
    if availability:
        with sqlite3.connect(db_path) as db:
            db.execute(
                "CREATE TABLE source_audit_actions(action_id TEXT,source_url TEXT,disposition TEXT,result_json TEXT)"
            )
            db.execute(
                "INSERT INTO source_audit_actions VALUES('observation-1','https://policies.ncdhhs.gov/test.pdf','availability',?)",
                (
                    json.dumps(
                        {
                            "observations": [
                                {
                                    "response_path": capture,
                                    "response_hash": hashlib.sha256(
                                        evidence
                                    ).hexdigest(),
                                    "audit": {
                                        "capture_path": "pipeline/source-audit-evidence/audit.json",
                                        "sha256": hashlib.sha256(b"{}").hexdigest(),
                                    },
                                }
                            ]
                        }
                    ),
                ),
            )
    payload = b'{"sections":[]}'
    meta = {
        "parse_status": "parsed",
        "answer_ready": True,
        "artifacts": {
            "json": {"sha256": "sha256:" + hashlib.sha256(payload).hexdigest()}
        },
    }
    files = {
        "crawler/crawler.db": db_path.read_bytes(),
        "crawler/documents/test.pdf": b"%PDF-test",
        "pipeline/parsed/test.json": b"tampered" if tamper else payload,
        "pipeline/parsed/test.meta.json": json.dumps(meta).encode(),
    }
    if not omit_evidence:
        files[capture] = evidence
    if availability and not omit_availability:
        files["pipeline/source-audit-evidence/audit.json"] = b"{}"
    if relocation:
        from pipeline.source_lifecycle import stable_hash

        with sqlite3.connect(db_path) as db:
            db.execute("ALTER TABLE documents ADD COLUMN source_type TEXT")
            db.execute("UPDATE documents SET source_type='dhhs_policy'")
            db.execute("UPDATE documents SET local_path='dhhs-policies/test.pdf'")
        files["crawler/crawler.db"] = db_path.read_bytes()
        files["crawler/documents/dhhs-policies/test.pdf"] = files.pop("crawler/documents/test.pdf")
        capture_bytes = b'<a href="https://policies.ncdhhs.gov/test.pdf">Original</a><a href="https://policies.ncdhhs.gov/new.pdf">Migrated</a>'
        proof = {
            "schema_version": 1,
            "source_url": "https://policies.ncdhhs.gov/test.pdf",
            "payload_url": "https://policies.ncdhhs.gov/new.pdf",
            "expected_payload_sha256": hashlib.sha256(b"%PDF-test").hexdigest(),
            "reviewed_identity_finding": "Exact original and migrated document reviewed.",
            "captures": [{"url": "https://policies.ncdhhs.gov/index/", "final_url": "https://policies.ncdhhs.gov/index/", "status_code": 200, "capture_path": "captures/index.html", "sha256": hashlib.sha256(capture_bytes).hexdigest()}],
        }
        fingerprint = stable_hash(proof)
        proof_path = "crawler/documents/.recovery-evidence/" + fingerprint + "/identity-evidence.json"
        capture_path = "crawler/documents/.recovery-evidence/" + fingerprint + "/captures/index.html"
        files[proof_path] = json.dumps(proof).encode()
        files[capture_path] = capture_bytes
        with sqlite3.connect(db_path) as db:
            db.row_factory = sqlite3.Row
            original = dict(db.execute("SELECT * FROM documents").fetchone())
        journal = {"registryHash": stable_hash(original), "originalHash": proof["expected_payload_sha256"], "identityEvidenceHash": fingerprint, "info": {"local_path": "dhhs-policies/test.pdf", "file_hash": proof["expected_payload_sha256"], "file_size": len(b"%PDF-test"), "mime_type": "application/pdf", "detected_content_type": "application/pdf", "content_disposition_filename": None, "etag": None, "last_modified": None}}
        files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        if relocation_change == "capture_missing":
            del files[capture_path]
        elif relocation_change == "capture_changed":
            files[capture_path] = b"changed capture"
        elif relocation_change == "proof_missing":
            del files[proof_path]
        elif relocation_change == "proof_changed":
            proof["reviewed_identity_finding"] = "Changed finding"
            files[proof_path] = json.dumps(proof).encode()
        elif relocation_change == "journal_missing":
            del files["crawler/recovery-journal/recovery.json"]
        elif relocation_change == "journal_changed":
            journal["identityEvidenceHash"] = "0" * 64
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change == "registry_guard_missing":
            del journal["registryHash"]
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change == "registry_guard_changed":
            journal["registryHash"] = "0" * 64
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change == "path_missing":
            del journal["info"]["local_path"]
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change == "path_invalid":
            journal["info"]["local_path"] = "../../outside.pdf"
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change in {"completed_payload_missing", "completed_payload_changed", "later_revision", "later_revision_unrelated", "later_revision_missing", "later_revision_corrupt"}:
            journal["completed"] = True
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
            original_payload = files.pop("crawler/documents/dhhs-policies/test.pdf")
            # A proof capture or unrelated duplicate must not stand in for the installed file.
            duplicate = "crawler/documents/unrelated.pdf"
            if relocation_change in {"later_revision", "later_revision_missing", "later_revision_corrupt"}:
                duplicate = "crawler/documents/dhhs-policies/.versions/test.2026-10-03.pdf"
            files[duplicate] = original_payload
            if relocation_change != "completed_payload_missing":
                files["crawler/documents/dhhs-policies/test.pdf"] = b"changed payload"
            if relocation_change.startswith("later_revision"):
                with sqlite3.connect(db_path) as db:
                    db.execute("ALTER TABLE documents ADD COLUMN file_hash TEXT")
                    db.execute("UPDATE documents SET status='updated',file_hash=?", (hashlib.sha256(b"changed payload").hexdigest(),))
                    db.execute("DELETE FROM source_retirements")
                files["crawler/crawler.db"] = db_path.read_bytes()
                if relocation_change == "later_revision_missing":
                    del files["crawler/documents/dhhs-policies/test.pdf"]
                elif relocation_change == "later_revision_corrupt":
                    files["crawler/documents/dhhs-policies/test.pdf"] = b"corrupted current artifact"
        elif relocation_change == "later_error":
            with sqlite3.connect(db_path) as db:
                db.execute("UPDATE documents SET status='error'")
                db.execute("DELETE FROM source_retirements")
            files["crawler/crawler.db"] = db_path.read_bytes()
            journal["completed"] = True
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
        elif relocation_change == "commit_before_marker":
            with sqlite3.connect(db_path) as db:
                db.execute("ALTER TABLE documents ADD COLUMN file_hash TEXT")
                db.execute("UPDATE documents SET status='downloaded',file_hash=?", (proof["expected_payload_sha256"],))
                db.execute("DELETE FROM source_retirements")
            files["crawler/crawler.db"] = db_path.read_bytes()
            journal["completed"] = False
            files["crawler/recovery-journal/recovery.json"] = json.dumps(journal).encode()
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as tar:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    data.seek(0)
    return data


def test_restored_archive_checks_database_and_retirement_evidence(tmp_path):
    result = backup.inspect_archive(archive(tmp_path))
    assert result["sqliteIntegrity"] == "ok"
    assert result["retirementRecordsChecked"] == 1
    assert result["artifactHashesChecked"] == 1


@pytest.mark.parametrize("mutation", ["tamper", "omit_evidence"])
def test_archive_tampering_and_missing_retirement_capture_fail(tmp_path, mutation):
    with pytest.raises(ValueError, match="hash mismatch|Retirement evidence"):
        backup.inspect_archive(archive(tmp_path, **{mutation: True}))


@pytest.mark.parametrize("registry_directory", ["crawler", "packages/crawler/data"])
def test_live_and_restored_snapshot_share_source_artifact_namespace(
    tmp_path, monkeypatch, registry_directory
):
    from pipeline import freshness

    source_archive = archive(tmp_path)
    restored = backup.inspect_archive(source_archive)
    source_archive.seek(0)
    live = tmp_path / "live"
    with tarfile.open(fileobj=source_archive, mode="r:gz") as tar:
        for member in tar:
            relative = member.name
            if relative.startswith("crawler/"):
                relative = registry_directory + "/" + relative.removeprefix("crawler/")
            target = live / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())
    monkeypatch.setattr(
        freshness, "CRAWLER_DB_PATH", live / registry_directory / "crawler.db"
    )
    parsed = live / "pipeline/parsed"
    before = freshness.build_answer_ready_snapshot(parsed)
    assert "sha256:" + before["snapshot_hash"] == restored["sourceSnapshotHash"]
    (live / registry_directory / "documents/test.pdf").write_bytes(b"changed source")
    assert (
        freshness.build_answer_ready_snapshot(parsed)["snapshot_hash"]
        != before["snapshot_hash"]
    )


def test_backup_includes_applied_availability_history(tmp_path):
    complete = backup.inspect_archive(archive(tmp_path, availability=True))
    assert complete["sqliteIntegrity"] == "ok"
    assert complete["availabilityObservationsChecked"] == 1


def test_backup_rejects_missing_availability_manifest(tmp_path):
    with pytest.raises(ValueError, match="Availability audit"):
        backup.inspect_archive(
            archive(tmp_path, availability=True, omit_availability=True)
        )


def test_backup_checks_interrupted_relocation_and_replay_dependencies(tmp_path):
    receipt = backup.inspect_archive(archive(tmp_path, relocation=True))
    assert receipt["relocationRecordsChecked"] == 1


@pytest.mark.parametrize("change", ["later_error", "commit_before_marker", "later_revision"])
def test_completed_relocation_backup_survives_later_error_and_completion_marker_crash(tmp_path, change):
    assert backup.inspect_archive(archive(tmp_path, relocation=True, relocation_change=change))["relocationRecordsChecked"] == 1


@pytest.mark.parametrize("change", ["capture_missing", "capture_changed", "proof_missing", "proof_changed", "journal_missing", "journal_changed", "registry_guard_missing", "registry_guard_changed", "path_missing", "path_invalid", "completed_payload_missing", "completed_payload_changed", "later_revision_unrelated", "later_revision_missing", "later_revision_corrupt"])
def test_backup_rejects_broken_relocation_proof_or_journal(tmp_path, change):
    with pytest.raises(ValueError, match="(?i)relocation"):
        backup.inspect_archive(archive(tmp_path, relocation=True, relocation_change=change))
