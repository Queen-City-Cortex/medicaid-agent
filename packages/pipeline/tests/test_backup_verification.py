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
