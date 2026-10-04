"""Restoration validates complete Jev manifests, caches, and SQLite snapshots."""
import io
import json
import tarfile

import pytest

from tests.test_backup_verification import archive, backup
from pipeline.jev.client import canonical, MODEL
from pipeline.jev.sections import label_sections


def labeled_archive(tmp_path, monkeypatch, *, omit_cache=False, tamper=False):
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
    for path in root.rglob("*.json"):
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


@pytest.mark.parametrize("mutation", ["omit_cache", "tamper"])
def test_missing_or_changed_label_payload_fails_restore(tmp_path, monkeypatch, mutation):
    with pytest.raises((ValueError, FileNotFoundError)):
        backup.inspect_archive(labeled_archive(tmp_path, monkeypatch, **{mutation: True}))
