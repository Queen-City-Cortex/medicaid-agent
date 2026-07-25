"""Machine-readable freshness and answer-ready change detection."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from pipeline.config import PARSED_DATA_DIR


def build_answer_ready_snapshot(
    parsed_dir: Path = PARSED_DATA_DIR,
) -> dict[str, object]:
    """Hash all successfully parsed, answer-ready source artifacts."""
    documents: list[dict[str, str]] = []
    for meta_path in sorted(parsed_dir.rglob("*.meta.json")):
        try:
            meta = json.loads(meta_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue

        parse_status = meta.get("parse_status", "parsed")
        quality_flags = meta.get("quality_flags") or []
        answer_ready = meta.get("answer_ready")
        if answer_ready is None:
            answer_ready = parse_status == "parsed" and not quality_flags
        if parse_status != "parsed" or not answer_ready or quality_flags:
            continue

        documents.append(
            {
                "artifact": str(meta_path.relative_to(parsed_dir)),
                "source_hash": str(
                    meta.get("source_file_hash")
                    or meta.get("source_pdf_hash")
                    or ""
                ),
            }
        )

    encoded = json.dumps(
        documents,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return {
        "snapshot_hash": hashlib.sha256(encoded).hexdigest(),
        "answer_ready_documents": len(documents),
    }


def compare_answer_ready_snapshot(
    state_file: Path,
    parsed_dir: Path = PARSED_DATA_DIR,
) -> dict[str, object]:
    """Compare the current answer-ready snapshot without acknowledging it."""
    current = build_answer_ready_snapshot(parsed_dir)
    previous_hash: str | None = None
    try:
        previous = json.loads(state_file.read_text())
        previous_hash = previous.get("snapshot_hash")
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass

    return {
        **current,
        "previous_snapshot_hash": previous_hash,
        "changed": previous_hash != current["snapshot_hash"],
    }


def acknowledge_answer_ready_snapshot(
    state_file: Path,
    snapshot: dict[str, object],
) -> None:
    """Atomically record a snapshot only after its release was accepted."""
    acknowledged = {
        "snapshot_hash": snapshot["snapshot_hash"],
        "answer_ready_documents": snapshot["answer_ready_documents"],
    }
    state_file.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        "w",
        dir=state_file.parent,
        prefix=f".{state_file.name}.",
        delete=False,
    ) as temporary:
        temporary.write(json.dumps(acknowledged, indent=2) + "\n")
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, state_file)
