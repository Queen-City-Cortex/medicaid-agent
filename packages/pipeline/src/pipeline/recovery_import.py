"""Import locally recovered PDF parses under the corpus writer lock."""

import argparse
import datetime
import fcntl
import hashlib
import json
import shutil
import sqlite3
import uuid
from pathlib import Path
from pipeline.config import (
    CORPUS_DATA_ROOT,
    CRAWLER_DATA_DIR,
    CRAWLER_DB_PATH,
    PARSED_DATA_DIR,
)
from pipeline.crawler_registry import PAYLOAD_RETAINED_STATUSES
from pipeline.parse.converter import (
    PARSE_CACHE_VERSION,
    SOURCE_TYPE_DIRS,
    save_parsed,
    _atomic_write_text,
)


def digest(path):
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    root = CORPUS_DATA_ROOT
    if not (root is not None and root.exists()):
        raise ValueError("Explicit existing CORPUS_DATA_ROOT required")
    lock_path = root / ".locks/corpus-job.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = json.loads((args.bundle / "manifest.json").read_text())
        if (
            manifest.get("schema_version") != 1
            or not manifest["parse_cache_version"] == PARSE_CACHE_VERSION
        ):
            raise ValueError("Invalid recovery bundle")
        required_code = {
            "packages/pipeline/src/pipeline/parse/converter.py",
            "packages/pipeline/src/pipeline/parse/worker.py",
            "packages/pipeline/src/pipeline/parse/post_process.py",
            "packages/pipeline/src/pipeline/config.py",
            "packages/pipeline/src/pipeline/corpus_manifest.py",
            "packages/pipeline/pyproject.toml",
            "packages/pipeline/uv.lock",
            "corpus-manifest.json",
        }
        if not set(manifest["code_hashes"]) == required_code:
            raise ValueError("Missing or unexpected parser fingerprints")
        for rel, expected in manifest["code_hashes"].items():
            if not digest(Path(__file__).resolve().parents[4] / rel) == expected:
                raise ValueError(f"Parser build mismatch: {rel}")
        conn = sqlite3.connect(f"file:{CRAWLER_DB_PATH}?mode=ro", uri=True)
        candidates = []
        seen = set()
        for item in manifest["files"]:
            rel = Path(item["file"])
            if not (
                not rel.is_absolute()
                and ".." not in rel.parts
                and (len(rel.parts) == 2)
                and (rel.suffix == ".pdf")
            ):
                raise ValueError("Invalid recovery bundle")
            if str(rel) in seen:
                raise ValueError("Duplicate source identity in recovery bundle")
            seen.add(str(rel))
            source = CRAWLER_DATA_DIR / rel
            source_type = next(
                (k for k, v in SOURCE_TYPE_DIRS.items() if v == rel.parent.name)
            )
            rows = conn.execute(
                "SELECT status,source_url FROM documents WHERE local_path=? AND source_type=?",
                (str(rel), source_type),
            ).fetchall()
            if not (
                len(rows) == 1
                and rows[0][0] in PAYLOAD_RETAINED_STATUSES
                and rows[0][1] == item.get("source_url")
            ):
                raise ValueError(f"Inactive or ambiguous registry identity: {rel}")
            if not digest(source) == item["source_hash"]:
                raise ValueError(f"Source changed: {rel}")
            paths = {
                name: args.bundle / "parsed" / rel.with_suffix(suffix)
                for name, suffix in [
                    ("json", ".json"),
                    ("markdown", ".md"),
                    ("metadata", ".meta.json"),
                ]
            }
            if not digest(paths["metadata"]) == item["metadata_hash"]:
                raise ValueError(f"Metadata changed: {rel}")
            meta = json.loads(paths["metadata"].read_text())
            if not (
                meta["parse_cache_version"] == PARSE_CACHE_VERSION
                and meta["parse_status"] == "parsed"
                and (meta["answer_ready"] is True)
                and (not meta["quality_flags"])
            ):
                raise ValueError("Invalid recovery bundle")
            if not meta["source_file_hash"] == item["source_hash"]:
                raise ValueError("Invalid recovery bundle")
            for name in ["json", "markdown"]:
                if not digest(paths[name]) == meta["artifacts"][name]["sha256"]:
                    raise ValueError(f"Artifact changed: {rel}/{name}")
            payload = json.loads(paths["json"].read_text())
            if not isinstance(payload, dict):
                raise ValueError("Invalid recovery bundle")
            parsed = {
                **meta,
                "payload": payload,
                "markdown": paths["markdown"].read_text(),
            }
            candidates.append((rel, source, source_type, meta, parsed))
        conn.close()
        print(
            json.dumps(
                {
                    "validated_files": [str(c[0]) for c in candidates],
                    "apply": args.apply,
                }
            ),
            flush=True,
        )
        if not args.apply:
            return
        batch_id = uuid.uuid4().hex
        archive = root / "pipeline/run-state/parse-imports" / batch_id
        archive.mkdir(parents=True)
        records = []
        _atomic_write_text(archive / "manifest.json", json.dumps(manifest, indent=2))
        for rel, _, _, meta, _ in candidates:
            # Keep the local run's metadata and attempt history independently of
            # the hosted attempt counters, including interrupted imports.
            _atomic_write_text(
                archive / "recovered" / rel.with_suffix(".meta.json"),
                json.dumps(meta, indent=2),
            )

        def checkpoint(status):
            _atomic_write_text(
                archive / "result.json",
                json.dumps(
                    {"batch_id": batch_id, "status": status, "records": records},
                    indent=2,
                ),
            )

        checkpoint("running")
        for rel, source, source_type, meta, parsed in candidates:
            target = PARSED_DATA_DIR / rel.with_suffix(".meta.json")
            old = json.loads(target.read_text()) if target.exists() else {}
            current = (
                old.get("parse_cache_version") == PARSE_CACHE_VERSION
                and old.get("source_file_hash") == meta["source_file_hash"]
                and (old.get("answer_ready") is True)
                and old.get("parse_status") == "parsed"
                and not old.get("quality_flags")
            )
            if current:
                current = all(
                    (
                        (p := (PARSED_DATA_DIR / rel.with_suffix(suffix))).is_file()
                        and digest(p)
                        == old.get("artifacts", {}).get(name, {}).get("sha256")
                        for name, suffix in [("json", ".json"), ("markdown", ".md")]
                    )
                )
            if current:
                records.append({"file": str(rel), "status": "already_valid"})
                checkpoint("running")
                continue
            for suffix in [".json", ".md", ".meta.json"]:
                original = PARSED_DATA_DIR / rel.with_suffix(suffix)
                if original.exists():
                    backup = archive / "previous" / rel.with_suffix(suffix)
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(original, backup)
            save_parsed(source, parsed, source_type)
            committed = json.loads(target.read_text())
            committed["recovery_import"] = {
                "batch_id": batch_id,
                "original_parsed_at": meta["parsed_at"],
                "code_commit": manifest["code_commit"],
                "source_hash": meta["source_file_hash"],
            }
            _atomic_write_text(target, json.dumps(committed, indent=2))
            records.append(
                {
                    "file": str(rel),
                    "status": "imported",
                    "attempt_count_total": committed["attempt_count_total"],
                }
            )
            checkpoint("running")
        result = {
            "status": "completed",
            "batch_id": batch_id,
            "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "records": records,
        }
        _atomic_write_text(archive / "result.json", json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
