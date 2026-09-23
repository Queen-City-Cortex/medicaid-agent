import json
import sqlite3
from pathlib import Path

import pytest

from pipeline import recovery_import as importer
from pipeline.parse import converter
from pipeline.retirement import corpus_writer_lock


@pytest.fixture
def bundle(tmp_path, monkeypatch):
    root = tmp_path / "data"
    source = root / "crawler/documents/bulletins/test.pdf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"%PDF-test source")
    parsed = root / "pipeline/parsed"
    parsed.mkdir(parents=True)
    db_path = root / "crawler/crawler.db"
    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TABLE documents(local_path,source_type,status,source_url)")
        db.execute(
            "INSERT INTO documents VALUES('bulletins/test.pdf','bulletin','error','https://medicaid.ncdhhs.gov/test')"
        )
    for key, value in {
        "CORPUS_DATA_ROOT": root,
        "CRAWLER_DATA_DIR": source.parents[1],
        "CRAWLER_DB_PATH": db_path,
        "PARSED_DATA_DIR": parsed,
    }.items():
        monkeypatch.setattr(importer, key, value)
    monkeypatch.setattr(converter, "PARSED_DATA_DIR", parsed)
    recovered = tmp_path / "bundle"
    files = recovered / "parsed/bulletins"
    files.mkdir(parents=True)
    (files / "test.json").write_text('{"sections":[{"text":"Recovered evidence"}]}')
    (files / "test.md").write_text("Recovered evidence")
    meta = {
        "parse_cache_version": converter.PARSE_CACHE_VERSION,
        "parse_status": "parsed",
        "answer_ready": True,
        "quality_flags": [],
        "source_file_hash": importer.digest(source),
        "parsed_at": "2026-09-22T00:00:00Z",
        "source_format": "pdf",
        "parse_backend": "docling",
        "section_count": 1,
        "table_count": 0,
        "page_count": 1,
        "content_char_count": 18,
        "parse_time_seconds": 1,
        "artifacts": {
            "json": {"sha256": importer.digest(files / "test.json")},
            "markdown": {"sha256": importer.digest(files / "test.md")},
        },
    }
    (files / "test.meta.json").write_text(json.dumps(meta))
    repo = Path(importer.__file__).resolve().parents[4]
    code = [
        "packages/pipeline/src/pipeline/parse/converter.py",
        "packages/pipeline/src/pipeline/parse/worker.py",
        "packages/pipeline/src/pipeline/parse/post_process.py",
        "packages/pipeline/src/pipeline/config.py",
        "packages/pipeline/src/pipeline/corpus_manifest.py",
        "packages/pipeline/pyproject.toml",
        "packages/pipeline/uv.lock",
        "corpus-manifest.json",
    ]
    manifest = {
        "schema_version": 1,
        "code_commit": "a" * 40,
        "parse_cache_version": converter.PARSE_CACHE_VERSION,
        "code_hashes": {name: importer.digest(repo / name) for name in code},
        "files": [
            {
                "file": "bulletins/test.pdf",
                "source_url": "https://medicaid.ncdhhs.gov/test",
                "source_hash": importer.digest(source),
                "metadata_hash": importer.digest(files / "test.meta.json"),
            }
        ],
    }
    (recovered / "manifest.json").write_text(json.dumps(manifest))
    return root, recovered, source, parsed / "bulletins/test.meta.json"


def test_apply_preserves_attempts_and_repeat_is_idempotent(bundle):
    root, recovered, source, target = bundle
    target.parent.mkdir(parents=True)
    target.write_text(
        json.dumps(
            {
                "source_file_hash": importer.digest(source),
                "parse_cache_version": converter.PARSE_CACHE_VERSION,
                "attempt_count_total": 7,
                "attempt_count_generation": 2,
            }
        )
    )
    importer.main([str(recovered)])
    assert json.loads(target.read_text())["attempt_count_total"] == 7
    importer.main([str(recovered), "--apply"])
    assert json.loads(target.read_text())["attempt_count_total"] == 8
    importer.main([str(recovered), "--apply"])
    assert json.loads(target.read_text())["attempt_count_total"] == 8
    assert list(
        (root / "pipeline/run-state/parse-imports").glob(
            "*/previous/bulletins/test.meta.json"
        )
    )


@pytest.mark.parametrize(
    "mutation", ["source", "payload", "metadata", "fingerprint", "version"]
)
def test_rejects_tampering_before_writing(bundle, mutation):
    _, recovered, source, target = bundle
    if mutation == "source":
        source.write_bytes(b"changed")
    elif mutation == "payload":
        (recovered / "parsed/bulletins/test.json").write_text("{}")
    elif mutation == "metadata":
        (recovered / "parsed/bulletins/test.meta.json").write_text("{}")
    else:
        path = recovered / "manifest.json"
        manifest = json.loads(path.read_text())
        if mutation == "fingerprint":
            manifest["code_hashes"] = {}
        else:
            manifest["parse_cache_version"] = 999
        path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        importer.main([str(recovered), "--apply"])
    assert not target.exists()


def test_competing_writer_is_rejected(bundle):
    root, recovered, _, target = bundle
    with corpus_writer_lock(root), pytest.raises(BlockingIOError):
        importer.main([str(recovered), "--apply"])
    assert not target.exists()


def test_interruption_keeps_completed_artifacts_reusable(bundle, monkeypatch):
    root, recovered, _, target = bundle
    save = importer.save_parsed

    def interrupted(*args):
        save(*args)
        raise KeyboardInterrupt()

    monkeypatch.setattr(importer, "save_parsed", interrupted)
    with pytest.raises(KeyboardInterrupt):
        importer.main([str(recovered), "--apply"])
    assert json.loads(target.read_text())["attempt_count_total"] == 1
    monkeypatch.setattr(importer, "save_parsed", save)
    importer.main([str(recovered), "--apply"])
    assert json.loads(target.read_text())["attempt_count_total"] == 1
    journals = [
        json.loads(p.read_text())
        for p in (root / "pipeline/run-state/parse-imports").glob("*/result.json")
    ]
    assert any(j["status"] == "running" for j in journals)
    assert any(j["status"] == "completed" for j in journals)


def test_changed_url_identity_is_rejected(bundle):
    root, recovered, _, target = bundle
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        db.execute(
            "UPDATE documents SET source_url='https://medicaid.ncdhhs.gov/other'"
        )
    with pytest.raises(ValueError, match="identity"):
        importer.main([str(recovered), "--apply"])
    assert not target.exists()
