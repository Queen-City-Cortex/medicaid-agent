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


def apply_scope(root, bundle, *, apply=False, supersede=None):
    return scope.apply_answer_scope(root, bundle, apply=apply, supersede=supersede)


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
        stem = root / "pipeline/parsed/bulletins" / f"coverage-{index}__html"
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
    return root, db_path, policy, bundle, original_url, missing_url


def test_validate_apply_replay_preserves_sources_and_freezes_scope(corpus):
    root, db_path, policy, bundle, original_url, missing_url = corpus
    with sqlite3.connect(db_path) as db:
        original_rows = db.execute("SELECT * FROM documents").fetchall()
    assert apply_scope(root, bundle)["status"] == "validated"
    assert scope.scope_records(db_path) == []
    before = freshness.build_answer_ready_snapshot(root / "pipeline/parsed")[
        "snapshot_hash"
    ]
    assert apply_scope(root, bundle, apply=True)["status"] == "applied"
    assert apply_scope(root, bundle, apply=True)["status"] == "already_applied"
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


def test_scope_accepts_full_bulletin_from_actual_html_parser(corpus, monkeypatch):
    from pipeline.parse import converter

    root, db_path, policy, bundle, _, _ = corpus
    source = root / "crawler/documents/bulletins/coverage-1.html"
    source.write_text(
        "<article><h1>Coverage update</h1>"
        "<h2>Over-the-Counter Tests for Home Use Coverage for COVID-19</h2>"
        "<p>Pharmacy point-of-sale coverage for OTC home tests ends Sept. 30, 2024. "
        "The payment change takes effect Oct. 1, 2024.</p></article>"
    )
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with sqlite3.connect(db_path) as db:
        db.execute(
            "UPDATE documents SET file_hash=? WHERE source_url=?",
            (digest, policy["required_bulletin"]["source_url"]),
        )
    monkeypatch.setattr(converter, "PARSED_DATA_DIR", root / "pipeline/parsed")
    converter.parse_and_save_supported_file(source, "bulletin", None)
    assert (root / "pipeline/parsed/bulletins/coverage-1__html.meta.json").is_file()
    snapshot = freshness.build_answer_ready_snapshot(root / "pipeline/parsed")
    qualification = bundle["qualification"]
    qualification["source_snapshot_hash"] = snapshot["snapshot_hash"]
    assert apply_scope(root, bundle, apply=True)["status"] == "applied"
    assert len(scope.approved_scope_map(db_path)) == 2


def test_bare_html_artifact_names_cannot_authorize_scope(corpus):
    root, db_path, _, bundle, _, _ = corpus
    for suffix in [".json", ".md", ".meta.json"]:
        path = root / ("pipeline/parsed/bulletins/coverage-1__html" + suffix)
        path.rename(root / ("pipeline/parsed/bulletins/coverage-1" + suffix))
    with pytest.raises(FileNotFoundError):
        apply_scope(root, bundle, apply=True)
    assert scope.scope_records(db_path) == []


@pytest.mark.parametrize("mutation", ["source", "original", "coverage", "policy"])
def test_changes_invalidate_scope_approval(corpus, mutation, monkeypatch):
    root, db_path, policy, bundle, original_url, _ = corpus
    apply_scope(root, bundle, apply=True)
    if mutation == "source":
        with sqlite3.connect(db_path) as db:
            db.execute(
                "UPDATE documents SET status='removed' WHERE source_url=?",
                (original_url,),
            )
    elif mutation == "original":
        (root / "crawler/documents/bulletins/original.pdf").unlink()
    elif mutation == "coverage":
        (root / "pipeline/parsed/bulletins/coverage-1__html.md").write_text(
            "Changed coverage"
        )
    else:
        policy["id"] += "-changed"
    with pytest.raises(ValueError):
        scope.approved_scope_map(db_path)
    # Callers that only count or report keep running; the approval excludes nothing.
    approved, reason = scope.usable_scope_map(db_path)
    assert approved == {} and reason.startswith("ValueError: ")
    assert (
        scope.scoped_failure_count(
            [{"source_url": original_url, "required_for_answering": True}], db_path
        )
        == 0
    )


def test_observation_retries_do_not_change_content_identity(corpus):
    root, db_path, _, bundle, _, _ = corpus
    apply_scope(root, bundle, apply=True)
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
    ],
)
def test_application_fails_before_writing_scope_records(corpus, failure):
    root, db_path, _, bundle, _, _ = corpus
    if failure == "unqualified":
        bundle["qualification"]["cases"]["magi-2026"] = False
    elif failure == "stale_snapshot":
        bundle["qualification"]["source_snapshot_hash"] = "b" * 64
    elif failure == "lost_coverage":
        (root / "pipeline/parsed/bulletins/coverage-1__html.json").unlink()
    else:
        (root / "pipeline/parsed/bulletins/coverage-1__html.md").write_text(
            "Digest title only"
        )
    with pytest.raises((ValueError, FileNotFoundError)):
        apply_scope(root, bundle, apply=True)
    assert scope.scope_records(db_path) == []


def test_backup_restoration_verifies_durable_scope_and_dependencies(corpus):
    spec = importlib.util.spec_from_file_location(
        "scoped_backup_check",
        Path(__file__).resolve().parents[3] / "scripts/ops/verify-corpus-backup.py",
    )
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    root, db_path, _, bundle, _, _ = corpus
    apply_scope(root, bundle, apply=True)
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


def test_unrelated_changes_leave_the_approval_valid(corpus, monkeypatch):
    root, db_path, _, bundle, original_url, missing_url = corpus
    apply_scope(root, bundle, apply=True)
    # A new answer-ready document, as any crawl produces.
    stem = root / "pipeline/parsed/bulletins/another"
    stem.with_suffix(".json").write_text('{"body":"Another policy"}')
    stem.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "parse_status": "parsed",
                "answer_ready": True,
                "source_file_hash": "sha256:" + "e" * 64,
            }
        )
    )
    # A new registry row, and a change to code the approval once hashed.
    with sqlite3.connect(db_path) as db:
        db.execute(
            "INSERT INTO documents(source_url,source_type,status) VALUES('https://medicaid.ncdhhs.gov/new','bulletin','error')"
        )
    monkeypatch.setattr(scope, "implementation_hash", lambda: "f" * 64)
    assert set(scope.approved_scope_map(db_path)) == {original_url, missing_url}
    assert scope.usable_scope_map(db_path)[1] is None
    assert apply_scope(root, bundle, apply=True)["status"] == "already_applied"


def _archive_of(root):
    spec = importlib.util.spec_from_file_location(
        "scoped_backup_check",
        Path(__file__).resolve().parents[3] / "scripts/ops/verify-corpus-backup.py",
    )
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as tar:
        for path in root.rglob("*"):
            if path.is_file() and not path.is_relative_to(root / ".locks"):
                tar.add(path, arcname=path.relative_to(root).as_posix())
    data.seek(0)
    return backup, data


def test_an_approval_lapses_when_its_required_coverage_leaves_the_graph(corpus):
    root, db_path, policy, bundle, _, _ = corpus
    apply_scope(root, bundle, apply=True)
    with sqlite3.connect(db_path) as db:
        db.execute(
            "UPDATE documents SET status='removed' WHERE source_url=?",
            (policy["required_coverage"][0]["source_url"],),
        )
    with pytest.raises(ValueError, match="Required answer scope source is missing"):
        scope.approved_scope_map(db_path)
    assert scope.usable_scope_map(db_path)[0] == {}


def test_an_approval_lapses_when_its_required_coverage_is_delisted(corpus, monkeypatch):
    root, db_path, policy, bundle, _, _ = corpus
    apply_scope(root, bundle, apply=True)
    assert len(scope.approved_scope_map(db_path)) == 2
    required = policy["required_coverage"][0]["source_url"]
    raw = scope._effective_registry(db_path)
    # The loader's view: the row keeps its status and file but is off the index.
    monkeypatch.setattr(
        scope,
        "_effective_registry",
        lambda _path: [
            {**row, "delisted_from_index": row["source_url"] == required} for row in raw
        ],
    )
    with pytest.raises(ValueError, match="Required answer scope source is missing"):
        scope.approved_scope_map(db_path)


def test_a_new_approval_replaces_the_old_one_only_when_it_names_it(corpus):
    root, db_path, _, bundle, original_url, missing_url = corpus
    with pytest.raises(ValueError, match="No active scope approval"):
        apply_scope(root, bundle, apply=True, supersede="reviewed-scope-0")
    assert scope.scope_records(db_path) == []
    apply_scope(root, bundle, apply=True)
    first = scope.scope_records(db_path)
    replacement = copy.deepcopy(bundle)
    replacement["action_id"] = "reviewed-scope-2"
    replacement["qualification"]["implementation_revision"] = "b" * 40

    with pytest.raises(ValueError, match="--supersede"):
        apply_scope(root, replacement, apply=True)
    with pytest.raises(ValueError, match="--supersede"):
        apply_scope(root, replacement, apply=True, supersede="some-other-approval")
    with pytest.raises(ValueError, match="its own action ID"):
        apply_scope(
            root,
            {**replacement, "action_id": "reviewed-scope-1"},
            apply=True,
            supersede="reviewed-scope-1",
        )
    assert scope.scope_records(db_path) == first

    # Validation writes nothing.
    assert apply_scope(root, replacement, supersede="reviewed-scope-1") == {
        "status": "validated",
        "limitations": 2,
        "policy_hash": bundle["policy_hash"],
        "superseded": "reviewed-scope-1",
    }
    assert scope.scope_records(db_path) == first

    assert (
        apply_scope(root, replacement, apply=True, supersede="reviewed-scope-1")["status"]
        == "applied"
    )
    current = scope.scope_records(db_path)
    assert {r["action_id"].rsplit(":", 1)[0] for r in current} == {"reviewed-scope-2"}
    assert set(scope.approved_scope_map(db_path)) == {original_url, missing_url}
    with sqlite3.connect(db_path) as db:
        kept = db.execute(
            "SELECT action_id, superseded_by, evidence_json FROM source_answer_scopes_superseded ORDER BY source_url"
        ).fetchall()
    assert [(row[0], row[1], row[2]) for row in kept] == [
        (r["action_id"], "reviewed-scope-2", r["evidence_json"]) for r in first
    ]
    assert (
        apply_scope(root, replacement, apply=True, supersede="reviewed-scope-1")["status"]
        == "already_applied"
    )

    # A replaced approval's ID is never reused, and a third approval still works.
    with pytest.raises(ValueError, match="its own action ID"):
        apply_scope(
            root,
            {**replacement, "action_id": "reviewed-scope-1"},
            apply=True,
            supersede="reviewed-scope-2",
        )
    third = copy.deepcopy(replacement)
    third["action_id"] = "reviewed-scope-3"
    third["qualification"]["implementation_revision"] = "c" * 40
    assert (
        apply_scope(root, third, apply=True, supersede="reviewed-scope-2")["status"]
        == "applied"
    )
    with sqlite3.connect(db_path) as db:
        assert (
            db.execute("SELECT COUNT(*) FROM source_answer_scopes_superseded").fetchone()[0]
            == 4
        )

    # The replaced approvals are part of the corpus snapshot and of a backup's check.
    snapshot = freshness.build_answer_ready_snapshot(root / "pipeline/parsed")
    backup, data = _archive_of(root)
    receipt = backup.inspect_archive(data)
    assert receipt["supersededAnswerScopesChecked"] == 4
    assert receipt["sourceSnapshotHash"] == "sha256:" + snapshot["snapshot_hash"]
    with sqlite3.connect(db_path) as db:
        db.execute("DELETE FROM source_answer_scopes_superseded WHERE superseded_by='reviewed-scope-3'")
    assert (
        freshness.build_answer_ready_snapshot(root / "pipeline/parsed")["snapshot_hash"]
        != snapshot["snapshot_hash"]
    )
    # A replacement is qualified against the same hash, with both approvals in place.
    assert scope.qualification_snapshot_hash(root) == bundle["qualification"]["source_snapshot_hash"]
    # Half the chain is gone: a restore check refuses it, and so does the next replacement.
    backup, data = _archive_of(root)
    with pytest.raises(ValueError, match="Superseded answer scope history changed"):
        backup.inspect_archive(data)
    fourth = copy.deepcopy(third)
    fourth["action_id"] = "reviewed-scope-4"
    with pytest.raises(ValueError, match="Superseded answer scope history changed"):
        apply_scope(root, fourth, apply=True, supersede="reviewed-scope-3")
    with sqlite3.connect(db_path) as db:
        db.execute("DELETE FROM source_answer_scopes_superseded")
    backup, data = _archive_of(root)
    with pytest.raises(ValueError, match="Superseded answer scope history changed"):
        backup.inspect_archive(data)


@pytest.mark.parametrize(
    "damage",
    [
        "one_limitation_removed",
        "copied_row",
        "evidence_edited",
        "registry_hash_replaced",
        "artifact_hash_cleared",
        "evidence_rewritten_in_every_record",
        "applied_at_changed",
        "superseded_at_changed",
    ],
)
def test_history_must_hold_every_record_of_every_approval(corpus, damage):
    root, db_path, _, bundle, _, _ = corpus
    apply_scope(root, bundle, apply=True)
    replacement = copy.deepcopy(bundle)
    replacement["action_id"] = "reviewed-scope-2"
    apply_scope(root, replacement, apply=True, supersede="reviewed-scope-1")
    assert scope.validate_superseded_records(
        scope.superseded_scope_records(db_path), scope.scope_records(db_path)
    ) == 2
    with sqlite3.connect(db_path) as db:
        first = db.execute("SELECT action_id FROM source_answer_scopes_superseded ORDER BY action_id").fetchone()[0]
        if damage == "one_limitation_removed":
            db.execute("DELETE FROM source_answer_scopes_superseded WHERE action_id=?", (first,))
        elif damage == "copied_row":
            db.execute(
                "INSERT INTO source_answer_scopes_superseded SELECT action_id || '-copy',source_url,policy_hash,registry_hash,artifact_hash,evidence_json,applied_at,superseded_by,superseded_at FROM source_answer_scopes_superseded WHERE action_id=?",
                (first,),
            )
        elif damage == "evidence_rewritten_in_every_record":
            assert db.execute(
                "UPDATE source_answer_scopes_superseded SET evidence_json=replace(evidence_json,?,?)",
                ("a" * 40, "d" * 40),
            ).rowcount == 2
        elif damage == "applied_at_changed":
            db.execute("UPDATE source_answer_scopes_superseded SET applied_at='2020-01-01T00:00:00+00:00'")
        elif damage == "superseded_at_changed":
            db.execute("UPDATE source_answer_scopes_superseded SET superseded_at='2020-01-01T00:00:00+00:00'")
        elif damage == "registry_hash_replaced":
            db.execute("UPDATE source_answer_scopes_superseded SET registry_hash=?", ("0" * 64,))
        elif damage == "artifact_hash_cleared":
            assert db.execute(
                "UPDATE source_answer_scopes_superseded SET artifact_hash=NULL WHERE artifact_hash IS NOT NULL"
            ).rowcount
        else:
            db.execute(
                "UPDATE source_answer_scopes_superseded SET evidence_json=replace(evidence_json,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','dddddddddddddddddddddddddddddddddddddddd') WHERE action_id=?",
                (first,),
            )
    with pytest.raises(ValueError, match="Superseded answer scope history changed"):
        scope.validate_superseded_records(
            scope.superseded_scope_records(db_path), scope.scope_records(db_path)
        )
