"""Exercise actual offline staging, preservation and graph-input seals."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

from openpyxl import Workbook
import pytest
from pipeline.parse import converter

OPS = Path(__file__).resolve().parents[3] / "scripts/ops"
spec = importlib.util.spec_from_file_location("inspector", OPS / "inspect-fee-compaction.py")
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


def archive_fixture(tmp_path):
    root = tmp_path / "archive"
    native = root / "crawler/documents/fee-schedules"
    native.mkdir(parents=True)
    parses = root / "pipeline/parsed/fee-schedules"
    parses.mkdir(parents=True)
    db = sqlite3.connect(root / "crawler/crawler.db")
    db.execute("CREATE TABLE documents (id INTEGER PRIMARY KEY, source_url TEXT, source_type TEXT, local_path TEXT, file_hash TEXT, status TEXT, title TEXT)")
    for index in range(2):
        source = native / f"fee-{index}.xlsx"
        book = Workbook()
        book.active.append(["Procedure description and reimbursement rate preserved", "X1234", None, 42.5])
        book.active["Z1"].number_format = "0.00"
        book.save(source)
        book.close()
        parsed = converter.parse_xlsx(source)
        stem = converter.artifact_stem_for_source_path(source)
        (parses / (stem + ".json")).write_text(json.dumps(parsed["payload"]))
        (parses / (stem + ".md")).write_text(parsed["markdown"])
        (parses / (stem + ".meta.json")).write_text(json.dumps({"source_file": str(source), "source_file_hash": "sha256:" + converter.file_sha256(source), "parse_cache_version": 6, "parse_status": "parsed", "answer_ready": True}))
        db.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?)", (index, f"https://medicaid.ncdhhs.gov/fee-{index}.xlsx", "fee_schedule", f"fee-schedules/fee-{index}.xlsx", converter.file_sha256(source), "downloaded", f"Fee {index}"))
    db.commit()
    db.close()
    return root


def run_stage(root, output):
    return subprocess.run([sys.executable, str(OPS / "compact-fee-xlsx.py"), "--archive", str(root), "--output", str(output)], env={"PATH": os.environ["PATH"], "HOME": str(output.parent)}, capture_output=True, text=True, timeout=90)


def inputs(output):
    paths = [output / name for name in ("inventory.json", "staging-summary.json", "native-proofs.json")]
    return json.loads(paths[0].read_text()), json.loads(paths[1].read_text()), *paths


def test_actual_staging_and_sealed_variants(tmp_path):
    archive = archive_fixture(tmp_path)
    before = {str(p.relative_to(archive)): converter.file_sha256(p) for p in archive.rglob("*") if p.is_file()}
    output = tmp_path / "staging"
    result = run_stage(archive, output)
    assert result.returncode == 0, result.stderr
    inventory, summary, inventory_path, summary_path, proof_path = inputs(output)
    assert summary["transformed_xlsx"] == 2
    assert summary["candidate_utf8_bytes"] < summary["original_utf8_bytes"]
    assert before == {str(p.relative_to(archive)): converter.file_sha256(p) for p in archive.rglob("*") if p.is_file()}
    for variant in ("baseline", "candidate"):
        inspector.validate_tree(output / variant, variant, inventory, summary, inventory_path, summary_path, proof_path)
    with pytest.raises(ValueError, match="variant"):
        inspector.validate_tree(output / "candidate", "baseline", inventory, summary, inventory_path, summary_path, proof_path)
    path = next((output / "candidate/pipeline/parsed/fee-schedules").glob("*__xlsx.json"))
    path.write_text("{}")
    with pytest.raises(ValueError, match="Unproven"):
        inspector.validate_tree(output / "candidate", "candidate", inventory, summary, inventory_path, summary_path, proof_path)


def test_baseline_mismatch_reports_all_files_and_never_seals(tmp_path):
    archive = archive_fixture(tmp_path)
    path = next((archive / "pipeline/parsed/fee-schedules").glob("*__xlsx.json"))
    value = json.loads(path.read_text())
    value["synthetic_sections"][0]["content_text"] += "unexplained change"
    path.write_text(json.dumps(value))
    output = tmp_path / "staging"
    result = run_stage(archive, output)
    assert result.returncode != 0
    failures = json.loads((output / "failures.json").read_text())
    assert len(failures) == 1
    assert "baseline differs" in failures[0]["error"]
    assert len(json.loads((output / "accounting.json").read_text())) == 2
    assert not (output / "staging-summary.json").exists()
    assert not (output / "candidate/variant-manifest.json").exists()
    assert not (output / "candidate/pipeline/parsed/fee-schedules" / path.name).exists()


def test_wal_refused_before_inventory(tmp_path):
    archive = archive_fixture(tmp_path)
    (archive / "crawler/crawler.db-wal").write_bytes(b"uncheckpointed")
    output = tmp_path / "staging"
    result = run_stage(archive, output)
    assert result.returncode != 0
    assert "checkpointed" in result.stderr
    assert not output.exists()
