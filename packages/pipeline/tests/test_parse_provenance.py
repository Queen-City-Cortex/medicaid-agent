import hashlib
import json
import sqlite3
import pytest
from pipeline.parse_provenance import reconcile_parse_orphans


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path
    sources = root / "crawler/documents/bulletins"
    sources.mkdir(parents=True)
    parsed = root / "pipeline/parsed/bulletins"
    parsed.mkdir(parents=True)
    sources.joinpath("old.pdf").write_bytes(b"source")
    sources.joinpath("new.pdf").write_bytes(b"source")
    conn = sqlite3.connect(root / "crawler/crawler.db")
    conn.execute(
        "CREATE TABLE documents (id INTEGER, source_type TEXT, status TEXT, file_hash TEXT, local_path TEXT, source_url TEXT)"
    )
    conn.execute(
        "INSERT INTO documents VALUES (1,?,?,?,?,?)",
        (
            "bulletin",
            "unchanged",
            digest(sources / "new.pdf"),
            "bulletins/new.pdf",
            "https://medicaid.ncdhhs.gov/test",
        ),
    )
    conn.commit()
    conn.close()
    for stem in ("old", "new"):
        doc = {
            "name": stem,
            "origin": {"filename": stem + ".pdf"},
            "texts": [{"text": "Policy"}],
        }
        jp = parsed / (stem + ".json")
        jp.write_text(json.dumps(doc))
        md = parsed / (stem + ".md")
        md.write_text("Policy")
        meta = {
            "source_file": str(sources / (stem + ".pdf")),
            "source_file_hash": "sha256:" + digest(sources / (stem + ".pdf")),
            "parse_status": "parsed",
            "answer_ready": True,
            "quality_flags": [],
            "artifacts": {
                "json": {"sha256": "sha256:" + digest(jp)},
                "markdown": {"sha256": "sha256:" + digest(md)},
            },
        }
        parsed.joinpath(stem + ".meta.json").write_text(json.dumps(meta))
    return root


def test_duplicate_proven_without_modifying_files(corpus):
    before = {str(p): digest(p) for p in corpus.rglob("*") if p.is_file()}
    report = reconcile_parse_orphans(corpus)
    assert report["count"] == 1 and report["verifiedDuplicates"] == 1
    assert report["orphans"][0]["registryId"] == 1
    assert before == {str(p): digest(p) for p in corpus.rglob("*") if p.is_file()}
    assert not list(corpus.rglob("*-wal"))


@pytest.mark.parametrize(
    "case", ["tamper", "wrong_hash", "missing_payload", "different_family", "inactive"]
)
def test_ambiguous_or_invalid_provenance_stays_unresolved(corpus, case):
    if case == "tamper":
        (corpus / "pipeline/parsed/bulletins/new.md").write_text("changed")
    elif case == "missing_payload":
        (corpus / "crawler/documents/bulletins/old.pdf").unlink()
    else:
        conn = sqlite3.connect(corpus / "crawler/crawler.db")
        field, value = {
            "wrong_hash": ("file_hash", "different"),
            "different_family": ("source_type", "managed_care_guidance"),
            "inactive": ("status", "removed"),
        }[case]
        conn.execute(f"UPDATE documents SET {field}=?", (value,))
        conn.commit()
        conn.close()
    report = reconcile_parse_orphans(corpus)
    assert report["verifiedDuplicates"] == 0 and report["unresolved"] >= 1


def test_uncheckpointed_registry_is_rejected(corpus):
    (corpus / "crawler/crawler.db-wal").write_bytes(b"uncheckpointed")
    with pytest.raises(ValueError, match="Checkpoint"):
        reconcile_parse_orphans(corpus)


def test_unknown_or_uninterpretable_metadata_is_counted(corpus):
    path = corpus / "pipeline/parsed/unknown/example.meta.json"
    path.parent.mkdir()
    path.write_text("{}")
    (corpus / "pipeline/parsed/bulletins/no-path.meta.json").write_text("{}")
    result = reconcile_parse_orphans(corpus)
    assert result["skippedMetadataReasons"] == {
        "unknown_family": 1,
        "uninterpretable_source_path": 1,
    }
