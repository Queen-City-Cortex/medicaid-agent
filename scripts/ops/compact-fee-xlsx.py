#!/usr/bin/env python3
"""Stage native-cell-verified fee XLSX diagnostics. No qualification or providers."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit, quote
import shutil
import socket
import sqlite3


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    path.chmod(0o600)


def offline():
    if any(value for key, value in os.environ.items() if key.endswith("API_KEY") or key in {"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"}):
        raise ValueError("Diagnostic process must have no provider credentials")
    def deny(*_args, **_kwargs):
        raise RuntimeError("Network forbidden during compaction")
    socket.socket.connect = deny
    socket.socket.connect_ex = deny
    import dotenv
    dotenv.load_dotenv = lambda *_args, **_kwargs: False
    original_connect = sqlite3.connect
    def readonly(database, *args, **kwargs):
        if str(database) == ":memory:":
            return original_connect(database, *args, **kwargs)
        kwargs["uri"] = True
        name = unquote(urlsplit(str(database)).path) if str(database).startswith("file:") else str(database)
        path = Path(name).resolve()
        for suffix in ("-wal", "-journal"):
            pending = Path(str(path) + suffix)
            if pending.exists() and pending.stat().st_size:
                raise ValueError("Registry must be checkpointed before offline diagnostics")
        return original_connect(f"file:{quote(str(path))}?mode=ro&immutable=1", *args, **kwargs)
    sqlite3.connect = readonly


def stage(archive, output):
    archive, output = archive.resolve(), output.resolve()
    if output.exists() or output == archive or archive in output.parents:
        raise ValueError("Use a new staging directory outside the archived corpus")
    os.environ["CORPUS_DATA_ROOT"] = str(archive)
    offline()
    from pipeline.graph import loader
    from pipeline.crawler_registry import normalize_local_path, read_registry_rows
    from pipeline.parse import converter
    from pipeline.parse.fee_xlsx import FEE_XLSX_REPRESENTATION
    rows = read_registry_rows()
    fee_rows = [row for row in rows if row["source_type"] == "fee_schedule"]
    exact = {}
    for row in fee_rows:
        if row.get("local_path"):
            key = normalize_local_path(row["local_path"], archive / "crawler/documents")
            exact.setdefault(key, []).append(row)
    groups, inventory = {}, []
    for path in sorted((archive / "pipeline/parsed/fee-schedules").glob("*.json")):
        if path.name.endswith(".meta.json"):
            continue
        context = loader._resolve_document_load_context(path, "fee_schedule")
        key = normalize_local_path(str(context["source_file_path"]), archive / "crawler/documents")
        if len(exact.get(key, [])) != 1 or context["crawler_meta"].get("local_path") != key:
            raise ValueError(f"Artifact lacks an unambiguous exact registry join: {path.name}")
        record = {"artifact": path.name, "registry_path": key, "document_id": context["document_id"], "exclusion": context["exclusion_reason"],
                  "sha256": {suffix: digest(path.with_suffix(suffix)) for suffix in (".json", ".md", ".meta.json") if path.with_suffix(suffix).is_file()}}
        inventory.append(record)
        groups.setdefault(context["document_id"], []).append((path, context))
    from pipeline.source_lifecycle import read_table
    captures = {json.loads(row["evidence_json"])["capture"]["capture_path"] for row in read_table(archive / "crawler/crawler.db", "source_classifications")}
    selected = []
    for candidates in groups.values():
        eligible = [item for item in candidates if item[1]["exclusion_reason"] is None]
        if eligible:
            path, context = loader._select_authoritative_parse(eligible)
            key = normalize_local_path(str(context["source_file_path"]), archive / "crawler/documents")
            source = archive / "crawler/documents" / key
            source_hash = digest(source)
            if source_hash != str(context["crawler_meta"]["file_hash"]).removeprefix("sha256:") or source_hash != str(context["meta"]["source_file_hash"]).removeprefix("sha256:"):
                raise ValueError(f"Registry/native/sidecar hash mismatch: {key}")
            selected.append((path, context, source, source_hash))
    registry_hash = digest(archive / "crawler/crawler.db")
    output.mkdir(mode=0o700, parents=True)
    write(output / "inventory.json", {"qualification": "NOT_ASSESSED", "promotable": False, "representation": FEE_XLSX_REPRESENTATION,
          "original_documents_root": str(archive / "crawler/documents"), "registry_sha256": registry_hash, "registry_fee_rows": fee_rows, "artifacts": inventory,
          "selected": [{"artifact": p.name, "source": str(src.relative_to(archive)), "source_sha256": h, "document_id": c["document_id"]} for p, c, src, h in selected]})
    for variant in ("baseline", "candidate"):
        root = output / variant
        (root / "crawler").mkdir(parents=True)
        shutil.copyfile(archive / "crawler/crawler.db", root / "crawler/crawler.db")
        (root / "crawler/documents").symlink_to(archive / "crawler/documents", target_is_directory=True)
        (root / "pipeline/parsed/fee-schedules").mkdir(parents=True)
        for capture in captures:
            destination = root / capture
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(archive / capture, destination)
    converter.PARSED_DATA_DIR = output / "candidate/pipeline/parsed"
    proofs, failures, accounting = [], [], []
    for index, (path, context, source, source_hash) in enumerate(selected, 1):
        try:
            for variant in ("baseline", "candidate"):
                destination = output / variant / "pipeline/parsed/fee-schedules" / path.name
                for suffix in (".json", ".md", ".meta.json"):
                    shutil.copyfile(path.with_suffix(suffix), destination.with_suffix(suffix))
            if source.suffix.lower() == ".xlsx":
                parsed = converter.parse_supported_file(source, None, "fee_schedule")
                original = json.loads(path.read_text())
                before = original["synthetic_sections"]
                after = parsed["payload"]["synthetic_sections"]
                if [{k:v for k,v in section.items() if k != "content_text"} for section in before] != [{k:v for k,v in section.items() if k != "content_text"} for section in after]:
                    raise ValueError(f"Sheet identity/hierarchy changed: {source.name}")
                bodies = {proof["sheet"].strip(): proof for proof in parsed["payload"]["cell_preservation"]}
                for section in before:
                    body = section["content_text"]
                    proof = bodies[section["title"]]
                    if hashlib.sha256(body.encode()).hexdigest() != proof["baseline_body_sha256"]:
                        raise ValueError(f"Native baseline differs from cached body: {source.name}/{section['title']}")
                converter.save_parsed(source, parsed, "fee_schedule")
                candidate_path, _, _ = converter.parsed_output_paths(source, "fee_schedule")
                if candidate_path.name != path.name:
                    raise ValueError("Authoritative artifact naming mismatch")
                proofs.append({"source": str(source.relative_to(archive)), "source_sha256": source_hash, "sheets": parsed["payload"]["cell_preservation"]})
            if digest(source) != source_hash:
                raise ValueError("Native source changed during staging")
            accounting.append({"artifact": path.name, "status": "transformed" if source.suffix.lower() == ".xlsx" else "unchanged"})
        except Exception as error:
            failures.append({"artifact": path.name, "source": str(source.relative_to(archive)), "error": f"{type(error).__name__}: {error}"})
            accounting.append({"artifact": path.name, "status": "FAILED"})
            destination = output / "candidate/pipeline/parsed/fee-schedules" / path.name
            for suffix in (".json", ".md", ".meta.json"):
                destination.with_suffix(suffix).unlink(missing_ok=True)
        print(f"{index}/{len(selected)} {source.name}", flush=True)
    for record in inventory:
        path = archive / "pipeline/parsed/fee-schedules" / record["artifact"]
        if any(digest(path.with_suffix(suffix)) != value for suffix,value in record["sha256"].items()):
            raise ValueError("Original artifact changed during staging")
    if digest(archive / "crawler/crawler.db") != registry_hash:
        raise ValueError("Original registry changed during staging")
    write(output / "accounting.json", accounting)
    write(output / "failures.json", failures)
    if failures:
        raise ValueError(f"{len(failures)} transforms failed; no staging summary or graph seal produced")
    write(output / "native-proofs.json", proofs)
    write(output / "staging-summary.json", {"qualification": "NOT_ASSESSED", "promotable": False, "providers_called": False,
          "old_scope_approvals": "STALE: candidate artifacts change corpus snapshot; approvals preserved, never rebound",
          "eligible_documents": len(selected), "transformed_xlsx": len(proofs),
          "original_utf8_bytes": sum(s["baseline_utf8_bytes"] for p in proofs for s in p["sheets"]),
          "candidate_utf8_bytes": sum(s["candidate_utf8_bytes"] for p in proofs for s in p["sheets"]),
          "original_inputs_preserved": True, "inventory_sha256": digest(output / "inventory.json"), "proofs_sha256": digest(output / "native-proofs.json")})


def seal_staging(output):
    """Bind every graph input and variant to the completed native-cell evidence."""
    output = output.resolve()
    inventory = json.loads((output / "inventory.json").read_text())
    summary = json.loads((output / "staging-summary.json").read_text())
    if summary["promotable"] or summary["qualification"] != "NOT_ASSESSED" or summary["inventory_sha256"] != digest(output / "inventory.json") or summary["proofs_sha256"] != digest(output / "native-proofs.json"):
        raise ValueError("Completed, unmodified staging proof required")
    archive = Path(inventory["original_documents_root"]).parent.parent
    for suffix in ("-wal", "-journal"):
        pending = archive / ("crawler/crawler.db" + suffix)
        if pending.exists() and pending.stat().st_size:
            raise ValueError("Registry has pending journal")
    native_proofs = {item["source"]: item for item in json.loads((output / "native-proofs.json").read_text())}
    originals = {item["artifact"]: item for item in inventory["artifacts"]}
    for variant in ("baseline", "candidate"):
        root = output / variant
        expected = {item["artifact"] for item in inventory["selected"]}
        actual = {p.name for p in (root / "pipeline/parsed/fee-schedules").glob("*.json") if not p.name.endswith(".meta.json")}
        if actual != expected or digest(root / "crawler/crawler.db") != inventory["registry_sha256"]:
            raise ValueError("Staged artifact set or registry differs from inventory")
        hashes = {}
        for item in inventory["selected"]:
            source = archive / item["source"]
            if digest(source) != item["source_sha256"]:
                raise ValueError("Native source differs from inventory")
            path = root / "pipeline/parsed/fee-schedules" / item["artifact"]
            if variant == "candidate" and source.suffix.lower() == ".xlsx":
                payload = json.loads(path.read_text())
                proof = native_proofs[item["source"]]
                if proof["source_sha256"] != item["source_sha256"] or payload.get("representation") != inventory["representation"] or payload.get("cell_preservation") != proof["sheets"]:
                    raise ValueError("Candidate differs from completed native proof")
                emitted = [sheet for sheet in proof["sheets"] if sheet["candidate_utf8_bytes"]]
                if len(emitted) != len(payload["synthetic_sections"]):
                    raise ValueError("Candidate sheet set changed")
                for section, sheet in zip(payload["synthetic_sections"], emitted, strict=True):
                    if section["title"] != sheet["sheet"].strip() or hashlib.sha256(section["content_text"].encode()).hexdigest() != sheet["candidate_body_sha256"]:
                        raise ValueError("Candidate body differs from native proof")
            for suffix in (".json", ".md", ".meta.json"):
                file = path.with_suffix(suffix)
                if (variant == "baseline" or source.suffix.lower() != ".xlsx") and digest(file) != originals[item["artifact"]]["sha256"][suffix]:
                    raise ValueError("Unchanged artifact differs from original")
                hashes[str(file.relative_to(root))] = digest(file)
        write(root / "variant-manifest.json", {"variant": variant, "artifacts": hashes, "registry_sha256": inventory["registry_sha256"],
              "inventory_sha256": summary["inventory_sha256"], "proofs_sha256": summary["proofs_sha256"], "staging_summary_sha256": digest(output / "staging-summary.json"),
              "qualification": "NOT_ASSESSED", "promotable": False})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--seal-existing", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.seal_existing:
        seal_staging(args.output)
    elif args.archive:
        stage(args.archive, args.output)
        seal_staging(args.output)
    else:
        parser.error("--archive is required for staging")
