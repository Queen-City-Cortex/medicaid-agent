"""Restoration validates complete Jev manifests, caches, and SQLite snapshots."""
import hashlib
import io
import json
import tarfile

import pytest

from tests.test_backup_verification import archive, backup
from pipeline.jev.client import canonical, MODEL
from pipeline.jev.sections import label_sections


def labeled_archive(tmp_path, monkeypatch, *, omit_cache=False, tamper=False, omit_labels=False):
    from pipeline.jev import sections
    def inference(state, spec, ledger):
        return {"response": {"model": MODEL, "answers": {k: {"type": "noul", "noul": .95} for k in spec},
                             "usage": {"input_tokens": 300, "output_tokens": 20}}, "latencyMs": 1}
    monkeypatch.setattr(sections, "budgeted_classify", inference)
    root = tmp_path / "labels"
    label_sections([{"id": "s", "documentId": "d", "title": "Covered", "documentTitle": "Policy", "documentType": "clinical_policy", "policyNumber": None, "sectionNumber": None, "content": "Covered."}], root=root, ledger=object(), cache_only=False)
    source = archive(tmp_path)
    files = {}
    with tarfile.open(fileobj=source, mode="r:gz") as tar:
        for member in tar:
            files[member.name] = tar.extractfile(member).read()
    files["pipeline/section-labels-backup.json"] = json.dumps({"version": 1, "files": {
        "pipeline/section-labels/" + str(path.relative_to(root)): "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*.json")
    }}).encode()
    for path in root.rglob("*.json"):
        if omit_labels:
            continue
        if omit_cache and path.parent.name == "cache":
            continue
        data = path.read_bytes()
        if tamper and path.parent.name == "cache":
            value = json.loads(data)
            value["probabilities"]["scope"] = value["response"]["answers"]["scope"]["noul"] = .91
            data = canonical(value).encode()
        files["pipeline/section-labels/" + str(path.relative_to(root))] = data
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as tar:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    output.seek(0)
    return output


def test_restored_labels_validate_cache_manifest_and_probabilities(tmp_path, monkeypatch):
    result = backup.inspect_archive(labeled_archive(tmp_path, monkeypatch))
    assert result["sqliteIntegrity"] == "ok"
    assert result["counts"]["sectionLabelArtifacts"] == 2


@pytest.mark.parametrize("mutation", ["omit_cache", "tamper", "omit_labels"])
def test_missing_or_changed_label_payload_fails_restore(tmp_path, monkeypatch, mutation):
    with pytest.raises((ValueError, FileNotFoundError)):
        backup.inspect_archive(labeled_archive(tmp_path, monkeypatch, **{mutation: True}))


def test_real_linux_backup_pipeline_restores_registry_labels_and_live_ledger(tmp_path, monkeypatch):
    import os
    import shutil
    import sqlite3
    import subprocess
    from pipeline.jev.budget import Ledger
    from pipeline.jev.benchmarks import REPO_ROOT
    if 'GNU tar' not in subprocess.run(['tar', '--version'], capture_output=True, text=True).stdout:
        pytest.skip('Production pipeline requires GNU tar; exercised by Linux CI')
    corpus = tmp_path / 'corpus # ? space'
    corpus.mkdir()
    source = labeled_archive(tmp_path, monkeypatch)
    with tarfile.open(fileobj=source, mode='r:gz') as tar:
        for member in tar:
            target = corpus / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())
    (corpus / 'pipeline/releases').mkdir(parents=True)
    ledger_path = corpus / 'pipeline/jev/campaign.db'
    ledger_path.parent.mkdir(parents=True)
    ledger = Ledger(ledger_path)
    ledger.reserve('typesafe', MODEL, 'fixture', .01)
    tools = tmp_path / 'tools'
    tools.mkdir()
    (tools / 'age').write_text('#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\ncat > "$2"\n')
    (tools / 'rclone').write_text('#!/bin/sh\nif [ "$1" = "copyto" ]; then cp "$2" "$BACKUP_TEST_OUTPUT"; fi\n')
    for path in tools.iterdir():
        path.chmod(0o755)
    output = tmp_path / 'backup.tar.gz'
    env = {**os.environ, 'PATH': str(tools) + os.pathsep + os.environ['PATH'],
           'CORPUS_DATA_ROOT': str(corpus), 'BACKUP_AGE_RECIPIENT': 'fixture',
           'BUCKET': 'fixture', 'ACCESS_KEY_ID': 'fixture', 'SECRET_ACCESS_KEY': 'fixture',
           'ENDPOINT': 'https://unused.invalid', 'SECONDARY_RCLONE_TARGET': '',
           'BACKUP_TEST_OUTPUT': str(output)}
    try:
        subprocess.run(['bash', str(REPO_ROOT / 'scripts/ops/object-storage-backup.sh')],
                       env=env, check=True, capture_output=True, timeout=30)
        with output.open('rb') as stream:
            result = backup.inspect_archive(stream)
        assert result['sqliteIntegrity'] == 'ok'
        assert result['counts']['sectionLabelArtifacts'] == 2
        with tarfile.open(output, mode='r:gz') as tar:
            assert 'crawler/crawler.db' in tar.getnames()
            assert not any(name.endswith(('.db-wal', '.db-shm', '.sqlite-snapshot')) for name in tar.getnames())
            restored = tmp_path / 'restored-ledger.db'
            restored.write_bytes(tar.extractfile('pipeline/jev/campaign.db').read())
        with sqlite3.connect(restored) as db:
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert db.execute('SELECT charged FROM calls').fetchone()[0] == 10_000_000
        assert ledger_path.exists()
    finally:
        ledger.close()
