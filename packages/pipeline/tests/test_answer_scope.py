import copy
import importlib.util
import hashlib
import io
import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

from pipeline import answer_scope as scope, config, freshness
from pipeline.source_lifecycle import stable_hash


@pytest.fixture
def corpus(tmp_path, monkeypatch):
    root = tmp_path
    db_path = root / "crawler/crawler.db"
    db_path.parent.mkdir()
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE documents(id INTEGER,source_url TEXT,source_type TEXT,title TEXT,local_path TEXT,file_hash TEXT,status TEXT,last_checked_at TEXT,download_attempts INTEGER)"
    )
    policy = copy.deepcopy(scope.scope_policy())
    original_url = policy["limitations"][0]["source_url"]
    missing_url = policy["limitations"][2]["source_url"]
    original = b"<html>Retained invalid original</html>"
    original_hash = hashlib.sha256(original).hexdigest()
    (root / "crawler/documents/bulletins").mkdir(parents=True)
    (root / "crawler/documents/bulletins/original.pdf").write_bytes(original)
    db.execute(
        "INSERT INTO documents VALUES(1,?,'bulletin','Missing original','bulletins/original.pdf',?,'error','old',1)",
        (original_url, original_hash),
    )
    db.execute(
        "INSERT INTO documents VALUES(2,?,'dhhs_policy','Missing archive',NULL,NULL,'error','old',0)",
        (missing_url,),
    )
    obligations = []
    for index, (url, text) in enumerate(
        [
            (
                "https://policies.ncdhhs.gov/coverage.pdf",
                "Effective: APRIL 1, 2026\nTable body",
            ),
            (
                policy["required_bulletin"]["source_url"],
                "Over-the-Counter Tests for Home Use Coverage for COVID-19\nCoverage ends Sept. 30, 2024.",
            ),
        ]
    ):
        path = f"bulletins/coverage-{index}.html"
        payload = text.encode()
        digest = hashlib.sha256(payload).hexdigest()
        (root / "crawler/documents" / path).write_bytes(payload)
        db.execute(
            "INSERT INTO documents VALUES(?,?, 'bulletin','Coverage',?,?,'downloaded','old',1)",
            (index + 3, url, path, digest),
        )
        stem = root / "pipeline/parsed/bulletins" / f"coverage-{index}"
        stem.parent.mkdir(parents=True, exist_ok=True)
        stem.with_suffix(".json").write_text(json.dumps({"body": text}))
        stem.with_suffix(".md").write_text(text)
        meta = {
            "source_file_hash": "sha256:" + digest,
            "parse_status": "parsed",
            "answer_ready": True,
            "quality_flags": [],
            "artifacts": {
                kind: {
                    "sha256": "sha256:"
                    + hashlib.sha256(stem.with_suffix(suffix).read_bytes()).hexdigest()
                }
                for kind, suffix in [("json", ".json"), ("markdown", ".md")]
            },
        }
        stem.with_suffix(".meta.json").write_text(json.dumps(meta))
        obligations.append({"source_url": url, "payload_sha256": digest})
    db.commit()
    rows = {
        row["source_url"]: dict(row) for row in db.execute("SELECT * FROM documents")
    }
    db.close()
    policy["limitations"] = [
        item
        for item in policy["limitations"]
        if item["source_url"] in {original_url, missing_url}
    ]
    for item in policy["limitations"]:
        item["registry_sha256"] = scope.scope_registry_hash(rows[item["source_url"]])
        item["retained_payload_sha256"] = (
            original_hash if item["source_url"] == original_url else None
        )
    policy["required_coverage"] = obligations[:1]
    monkeypatch.setattr(scope, "scope_policy", lambda: policy)
    monkeypatch.setattr(config, "CRAWLER_DB_PATH", db_path)
    monkeypatch.setattr(freshness, "CRAWLER_DB_PATH", db_path)
    snapshot = freshness.build_answer_ready_snapshot(root / "pipeline/parsed")
    bundle = {
        "action_id": "reviewed-scope-1",
        "policy_hash": stable_hash(policy),
        "qualification": {
            "policy_hash": stable_hash(policy),
            "implementation_revision": "a" * 40,
            "implementation_hash": scope.implementation_hash(),
            "source_snapshot_hash": snapshot["snapshot_hash"],
            "cases": {case: True for case in policy["qualification_cases"]},
        },
    }
    bundle["qualification"]["baseline_backup_receipt"] = {
        "decryptionVerified": True,
        "sqliteIntegrity": "ok",
        "archiveSha256": "c" * 64,
        "archiveObject": "backups/corpus/test-baseline.tar.gz.age",
        "sourceSnapshotHash": "sha256:" + snapshot["snapshot_hash"],
    }
    return root, db_path, policy, bundle, original_url, missing_url


def test_validate_apply_replay_preserves_sources_and_freezes_scope(corpus):
    root, db_path, policy, bundle, original_url, missing_url = corpus
    with sqlite3.connect(db_path) as db:
        original_rows = db.execute("SELECT * FROM documents").fetchall()
    assert scope.apply_answer_scope(root, bundle)["status"] == "validated"
    assert scope.scope_records(db_path) == []
    before = freshness.build_answer_ready_snapshot(root / "pipeline/parsed")[
        "snapshot_hash"
    ]
    assert scope.apply_answer_scope(root, bundle, apply=True)["status"] == "applied"
    assert (
        scope.apply_answer_scope(root, bundle, apply=True)["status"]
        == "already_applied"
    )
    assert set(scope.approved_scope_map(db_path)) == {original_url, missing_url}
    assert (
        before
        != freshness.build_answer_ready_snapshot(root / "pipeline/parsed")[
            "snapshot_hash"
        ]
    )
    with sqlite3.connect(db_path) as db:
        assert original_rows == db.execute("SELECT * FROM documents").fetchall()
    assert (
        scope.scoped_failure_count(
            [
                {
                    "source_file": "bulletins/original.pdf",
                    "required_for_answering": True,
                },
                {"source_url": missing_url, "required_for_answering": True},
                {
                    "source_url": "https://policies.ncdhhs.gov/new-failure",
                    "required_for_answering": True,
                },
            ],
            db_path,
        )
        == 2
    )


@pytest.mark.parametrize(
    "mutation", ["source", "original", "coverage", "policy", "implementation"]
)
def test_changes_invalidate_scope_approval(corpus, mutation, monkeypatch):
    root, db_path, policy, bundle, original_url, _ = corpus
    scope.apply_answer_scope(root, bundle, apply=True)
    if mutation == "source":
        with sqlite3.connect(db_path) as db:
            db.execute(
                "UPDATE documents SET status='removed' WHERE source_url=?",
                (original_url,),
            )
    elif mutation == "original":
        (root / "crawler/documents/bulletins/original.pdf").unlink()
    elif mutation == "coverage":
        (root / "pipeline/parsed/bulletins/coverage-1.md").write_text(
            "Changed coverage"
        )
    elif mutation == "policy":
        policy["id"] += "-changed"
    else:
        monkeypatch.setattr(scope, "implementation_hash", lambda: "f" * 64)
    with pytest.raises(ValueError):
        scope.approved_scope_map(db_path)


def test_observation_retries_do_not_change_content_identity(corpus):
    root, db_path, _, bundle, _, _ = corpus
    scope.apply_answer_scope(root, bundle, apply=True)
    with sqlite3.connect(db_path) as db:
        db.execute(
            "UPDATE documents SET last_checked_at='later',download_attempts=download_attempts+1 WHERE status='error'"
        )
    assert len(scope.approved_scope_map(db_path)) == 2


@pytest.mark.parametrize(
    "failure",
    [
        "unqualified",
        "stale_snapshot",
        "lost_coverage",
        "missing_body",
        "missing_backup",
        "untested_backup",
    ],
)
def test_application_fails_before_writing_scope_records(corpus, failure):
    root, db_path, _, bundle, _, _ = corpus
    if failure == "unqualified":
        bundle["qualification"]["cases"]["magi-2026"] = False
    elif failure == "stale_snapshot":
        bundle["qualification"]["source_snapshot_hash"] = "b" * 64
    elif failure == "lost_coverage":
        (root / "pipeline/parsed/bulletins/coverage-1.json").unlink()
    elif failure == "missing_backup":
        del bundle["qualification"]["baseline_backup_receipt"]
    elif failure == "untested_backup":
        bundle["qualification"]["baseline_backup_receipt"]["decryptionVerified"] = False
    else:
        (root / "pipeline/parsed/bulletins/coverage-1.md").write_text(
            "Digest title only"
        )
    with pytest.raises((ValueError, FileNotFoundError)):
        scope.apply_answer_scope(root, bundle, apply=True)
    assert scope.scope_records(db_path) == []


def test_backup_restoration_verifies_durable_scope_and_dependencies(corpus):
    spec = importlib.util.spec_from_file_location(
        "scoped_backup_check",
        Path(__file__).resolve().parents[3] / "scripts/ops/verify-corpus-backup.py",
    )
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    root, db_path, _, bundle, _, _ = corpus
    scope.apply_answer_scope(root, bundle, apply=True)
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as tar:
        for path in root.rglob("*"):
            if path.is_file() and not path.is_relative_to(root / ".locks"):
                tar.add(path, arcname=path.relative_to(root).as_posix())
    data.seek(0)
    result = backup.inspect_archive(data)
    assert result["answerScopesChecked"] == 2
    assert (
        result["sourceSnapshotHash"]
        == "sha256:"
        + freshness.build_answer_ready_snapshot(root / "pipeline/parsed")[
            "snapshot_hash"
        ]
    )
