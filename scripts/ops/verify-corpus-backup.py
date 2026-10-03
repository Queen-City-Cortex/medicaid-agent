"""Verify an encrypted corpus archive without persisting the age private key."""

import argparse
import ctypes
import hashlib
import json
import re
import sqlite3
import subprocess
import tarfile
import tempfile
import uuid
import sys
from urllib.parse import urlparse
from datetime import UTC, datetime
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages/pipeline/src"))
from pipeline.source_lifecycle import lifecycle_snapshot, validate_never_downloaded  # noqa: E402
from pipeline.corpus_manifest import get_source_family  # noqa: E402


def keychain_identity():
    service = b"Queen-City-Cortex.medicaid-agent.corpus-backup.age"
    account = b"production"
    security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
    find = security.SecKeychainFindGenericPassword
    find.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.c_void_p,
    ]
    find.restype = ctypes.c_int32
    length, pointer = ctypes.c_uint32(), ctypes.c_void_p()
    status = find(
        None,
        len(service),
        service,
        len(account),
        account,
        ctypes.byref(length),
        ctypes.byref(pointer),
        None,
    )
    if status:
        raise RuntimeError("Keychain retrieval failed: " + str(status))
    try:
        return ctypes.string_at(pointer, length.value)
    finally:
        security.SecKeychainItemFreeContent(None, pointer)


def check_relocations(hashes, proofs, journals, registry):
    """Check retained proof and resumable journal dependencies after restore."""
    def hex_hash(value):
        return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None

    prefix = "crawler/documents/.recovery-evidence/"
    by_hash = {}
    by_url = {row["source_url"]: row for row in registry}
    for name, proof in proofs.items():
        fingerprint = hashlib.sha256(json.dumps(proof, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        if name != prefix + fingerprint + "/identity-evidence.json" or proof.get("schema_version") != 1:
            raise ValueError("Relocation identity manifest changed in backup")
        source = by_url.get(proof.get("source_url"))
        if not source or not proof.get("reviewed_identity_finding") or not proof.get("captures"):
            raise ValueError("Relocation source identity missing in backup")
        family = get_source_family(source["source_type"])
        def official(url):
            parsed = urlparse(url)
            return parsed.scheme == "https" and any(parsed.hostname == domain or (domain != "policies-inactive.ncdhhs.gov" and (parsed.hostname or "").endswith("." + domain)) for domain in family.allowed_domains)
        if not official(proof["source_url"]) or not official(proof["payload_url"]):
            raise ValueError("Relocation URL outside source family in backup")
        for capture in proof["captures"]:
            relative = Path(capture["capture_path"])
            if not relative.parts or relative.is_absolute() or ".." in relative.parts or "\\" in capture["capture_path"]:
                raise ValueError("Invalid relocation capture path in backup")
            capture_name = prefix + fingerprint + "/" + relative.as_posix()
            if capture["status_code"] != 200 or capture["url"] != capture["final_url"] or not official(capture["url"]) or hashes.get(capture_name) != "sha256:" + capture["sha256"]:
                raise ValueError("Relocation capture missing or changed in backup")
        by_hash[fingerprint] = proof
    checked = 0
    referenced = set()
    for journal in journals:
        fingerprint = journal.get("identityEvidenceHash")
        if fingerprint is None:
            continue
        proof = by_hash.get(fingerprint)
        info = journal.get("info")
        required_info = {"local_path", "file_hash", "file_size", "mime_type", "detected_content_type", "content_disposition_filename", "etag", "last_modified"}
        if not hex_hash(journal.get("registryHash")) or "originalHash" not in journal or (journal["originalHash"] is not None and not hex_hash(journal["originalHash"])) or not isinstance(info, dict) or not required_info <= info.keys():
            raise ValueError("Relocation recovery journal is incomplete in backup")
        if not isinstance(info["local_path"], str) or not hex_hash(info["file_hash"]) or type(info["file_size"]) is not int or info["file_size"] <= 0 or any(info[field] is not None and not isinstance(info[field], str) for field in required_info - {"local_path", "file_hash", "file_size"}):
            raise ValueError("Invalid relocation recovery journal fields in backup")
        if not proof or info["file_hash"] != proof["expected_payload_sha256"]:
            raise ValueError("Relocation journal proof missing or changed in backup")
        relative = Path(info["local_path"])
        family = get_source_family(by_url[proof["source_url"]]["source_type"])
        if relative.is_absolute() or len(relative.parts) != 2 or ".." in relative.parts or "\\" in info["local_path"] or relative.parts[0] != family.directory_name or relative.suffix not in family.allowed_file_formats:
            raise ValueError("Invalid relocation recovery journal path in backup")
        source = by_url[proof["source_url"]]
        if "completed" in journal and type(journal["completed"]) is not bool:
            raise ValueError("Invalid relocation journal completion state in backup")
        committed = journal.get("completed") is True or (source["status"] in {"downloaded", "updated", "unchanged"} and source.get("file_hash") == info["file_hash"] and source.get("local_path") == info["local_path"])
        if not committed:
            state_hash = hashlib.sha256(json.dumps(source, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
            if state_hash != journal["registryHash"]:
                raise ValueError("Interrupted relocation registry guard changed in backup")
            if source.get("local_path") and source["local_path"] != info["local_path"]:
                raise ValueError("Interrupted relocation installed artifact path changed in backup")
        installed = hashes.get("crawler/documents/" + info["local_path"]) == "sha256:" + info["file_hash"]
        later_revision = committed and source.get("file_hash") is not None and source["file_hash"] != info["file_hash"]
        if later_revision and (not isinstance(source.get("local_path"), str) or not hex_hash(source["file_hash"]) or hashes.get("crawler/documents/" + source["local_path"]) != "sha256:" + source["file_hash"]):
            raise ValueError("Relocation current registry artifact missing or changed in backup")
        versions = "crawler/documents/" + relative.parts[0] + "/.versions/" + relative.stem + "."
        retained_version = any(name.startswith(versions) and value == "sha256:" + info["file_hash"] for name, value in hashes.items())
        if not installed and not (later_revision and retained_version):
            raise ValueError("Relocation installed artifact missing or changed in backup")
        checked += 1
        referenced.add(fingerprint)
    if set(by_hash) - referenced:
        raise ValueError("Relocation proof missing recovery journal in backup")
    return checked


def inspect_archive(stream, *, include_history=False):
    hashes, metas = {}, {}
    proofs, journals = {}, []
    counts = {"sourceFiles": 0, "parsedFiles": 0}
    byte_count = 0
    with tempfile.TemporaryDirectory(prefix="corpus-restore-db-") as temporary:
        with tarfile.open(fileobj=stream, mode="r|gz") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                if (
                    member.name in hashes
                    or Path(member.name).is_absolute()
                    or ".." in Path(member.name).parts
                ):
                    raise ValueError("Duplicate or unsafe archive member")
                content = []
                is_meta = (
                    member.name.startswith("pipeline/parsed/")
                    and member.name.endswith(".meta.json")
                    and not Path(member.name).name.startswith("._")
                )
                is_evidence = member.name.startswith(("pipeline/source-audit-evidence/", "pipeline/source-retirement-evidence/"))
                keep = is_meta or is_evidence or member.name in [
                    "crawler/crawler.db",
                    "crawler/crawler.db-wal",
                    "crawler/crawler.db-shm",
                ]
                is_proof = member.name.startswith("crawler/documents/.recovery-evidence/") and member.name.endswith("/identity-evidence.json")
                is_journal = member.name.startswith("crawler/recovery-journal/") and member.name.endswith(".json")
                keep = keep or is_proof or is_journal
                digest = hashlib.sha256()
                source = tar.extractfile(member)
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    byte_count += len(chunk)
                    if keep:
                        content.append(chunk)
                hashes[member.name] = "sha256:" + digest.hexdigest()
                for prefix, key in [
                    ("crawler/documents/", "sourceFiles"),
                    ("pipeline/parsed/", "parsedFiles"),
                ]:
                    if member.name.startswith(prefix):
                        counts[key] += 1
                if keep:
                    data = b"".join(content)
                    if is_meta:
                        metas[member.name] = json.loads(data)
                    elif is_proof:
                        proofs[member.name] = json.loads(data)
                    elif is_journal:
                        journals.append(json.loads(data))
                    elif is_evidence:
                        target = Path(temporary) / member.name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                    else:
                        (Path(temporary) / Path(member.name).name).write_bytes(data)
        db_path = Path(temporary) / "crawler.db"
        if not db_path.is_file():
            raise ValueError("Archive is missing the crawler registry")
        with sqlite3.connect(db_path) as db:
            integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError("Restored SQLite registry failed integrity check")
            counts["registryDocuments"] = db.execute(
                "SELECT count(*) FROM documents"
            ).fetchone()[0]
            db.row_factory = sqlite3.Row
            registry = [dict(row) for row in db.execute("SELECT * FROM documents ORDER BY source_url")]
            retirements = (
                [
                    dict(r)
                    for r in db.execute("SELECT * FROM source_retirements ORDER BY id")
                ]
                if db.execute(
                    "SELECT 1 FROM sqlite_master WHERE name='source_retirements'"
                ).fetchone()
                else []
            )
        lifecycle = lifecycle_snapshot(db_path, hashes)
        from pipeline.answer_scope import validate_scope_records
        validate_scope_records(lifecycle.get("answer_scopes", []), registry, hashes)
        relocations_checked = check_relocations(hashes, proofs, journals, registry)
        checked = 0
        for name, meta in metas.items():
            for kind, suffix in [("json", ".json"), ("markdown", ".md")]:
                expected = meta.get("artifacts", {}).get(kind, {}).get("sha256")
                if expected:
                    if hashes.get(name.removesuffix(".meta.json") + suffix) != expected:
                        raise ValueError("Parsed artifact hash mismatch: " + name)
                    checked += 1
        availability_checked = 0
        for action in lifecycle.get("availability_observations", []):
            for observation in json.loads(action["result_json"])["observations"]:
                if hashes.get(observation["response_path"]) != "sha256:" + observation["response_hash"]:
                    raise ValueError("Availability response missing or changed in backup")
                audit = observation["audit"]
                if hashes.get(audit["capture_path"]) != "sha256:" + audit["sha256"]:
                    raise ValueError("Availability audit missing or changed in backup")
                availability_checked += 1
        for row in retirements:
            for capture in json.loads(row["evidence_json"])["evidence"]:
                if hashes.get(capture["capture_path"]) != "sha256:" + capture["sha256"]:
                    raise ValueError("Retirement evidence missing or changed in backup")
        for row in lifecycle["classifications"]:
            capture = json.loads(row["evidence_json"])["capture"]
            if hashes.get(capture["capture_path"]) != "sha256:" + capture["sha256"]:
                raise ValueError("Classification evidence missing or changed in backup")
        by_url = {row["source_url"]: row for row in registry}
        for row in lifecycle["classifications"]:
            evidence = json.loads(row["evidence_json"])
            if row["source_url"] not in by_url or evidence.get("schema_version") != 1 or evidence.get("resource_role") != row["resource_role"]:
                raise ValueError("Invalid classification identity in backup")
            if evidence["resource_role"] == "index" and (not evidence.get("children") or any(url not in by_url for url in evidence["children"])):
                raise ValueError("Classified index children missing from backup registry")
        for row in retirements:
            evidence = json.loads(row["evidence_json"])
            if row.get("reactivated_at") is None:
                document = by_url.get(row["source_url"])
                if not document or document.get("status") != "removed":
                    raise ValueError("Retirement identity missing from backup registry")
                if evidence.get("schema_version") == 2 and evidence.get("payload_state") == "never_downloaded":
                    validate_never_downloaded(Path(temporary), document, evidence.get("download_history", {}))
                elif hashes.get("crawler/documents/" + (document.get("local_path") or "")) != evidence.get("original_artifact_hash") or not evidence.get("original_artifact_hash"):
                    raise ValueError("Retired original artifact hash mismatch in backup")
            if evidence.get("schema_version") not in {1, 2}:
                raise ValueError("Incompatible retirement evidence")
            for snapshot in evidence.get("download_history", {}).get("retained_snapshots", []):
                for capture in [snapshot, snapshot["restore_receipt"]]:
                    if hashes.get(capture["capture_path"]) != "sha256:" + capture["sha256"]:
                        raise ValueError("Download-history evidence missing or changed in backup")
        if (
            not counts["sourceFiles"]
            or not counts["parsedFiles"]
            or not checked
            or not counts["registryDocuments"]
        ):
            raise ValueError("Archive lacks required corpus contents")
        documents = []
        for name, meta in sorted(metas.items()):
            parse_status = meta.get("parse_status", "parsed")
            flags = meta.get("quality_flags") or []
            ready = meta.get("answer_ready")
            if ready is None:
                ready = parse_status == "parsed" and not flags
            if parse_status != "parsed" or not ready or flags:
                continue
            documents.append(
                {
                    "artifact": name.removeprefix("pipeline/parsed/"),
                    "source_hash": str(
                        meta.get("source_file_hash")
                        or meta.get("source_pdf_hash")
                        or ""
                    ),
                    "parsed_payload_hash": hashes.get(
                        name.removesuffix(".meta.json") + ".json", ""
                    ).removeprefix("sha256:"),
                }
            )
        unscoped_lifecycle = {key: value for key, value in lifecycle.items() if key != "answer_scopes"}
        unscoped_hash = hashlib.sha256(json.dumps({"documents": documents, "lifecycle": unscoped_lifecycle}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if any(json.loads(record["evidence_json"])["qualification"]["source_snapshot_hash"] != unscoped_hash for record in lifecycle.get("answer_scopes", [])):
            raise ValueError("Complete archive corpus changed after scope approval")
        snapshot = (
            "sha256:"
            + hashlib.sha256(
                json.dumps(
                    {"documents": documents, "lifecycle": lifecycle},
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest()
        )
        return {
            **({"_history": {
                "schema_version": 1,
                "registry_sha256": hashes["crawler/crawler.db"],
                "documents": registry,
                "source_artifacts": {
                    row["source_url"]: ([{"path": "crawler/documents/" + row["local_path"], "sha256": hashes["crawler/documents/" + row["local_path"]]}] if row.get("local_path") and "crawler/documents/" + row["local_path"] in hashes else [])
                    for row in registry
                },
            }} if include_history else {}),
            "sourceSnapshotHash": snapshot,
            "sqliteIntegrity": integrity,
            "artifactHashesChecked": checked,
            "answerScopesChecked": len(lifecycle.get("answer_scopes", [])),
            "retirementRecordsChecked": len(retirements),
            "classificationRecordsChecked": len(lifecycle["classifications"]),
            "availabilityObservationsChecked": availability_checked,
            "relocationRecordsChecked": relocations_checked,
            "snapshotSchemaVersion": 2,
            "uncompressedBytes": byte_count,
            "counts": counts,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--history-output", type=Path, help="Private retained registry/artifact evidence for source audit")
    parser.add_argument(
        "--image", required=True, help="Locally built corpus-job image containing age"
    )
    args = parser.parse_args()
    archive = args.archive.resolve(strict=True)
    container = "corpus-backup-verify-" + uuid.uuid4().hex
    identity = keychain_identity()
    with tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(
            [
                "docker",
                "run",
                "--rm",
                "--name",
                container,
                "--network",
                "none",
                "-i",
                "--tmpfs",
                "/run/recovery:rw,noexec,nosuid,size=1m",
                "-v",
                str(archive) + ":/archive.age:ro",
                "--entrypoint",
                "sh",
                args.image,
                "-c",
                "umask 077; cat > /run/recovery/identity; exec age -d -i /run/recovery/identity /archive.age",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=errors,
        )
        try:
            proc.stdin.write(identity)
            proc.stdin.close()
            del identity
            result = inspect_archive(proc.stdout, include_history=bool(args.history_output))
            while proc.stdout.read(1024 * 1024):
                pass
            if proc.wait(timeout=60) != 0:
                raise RuntimeError("Archive decryption failed")
        finally:
            if proc.poll() is None:
                subprocess.run(
                    ["docker", "rm", "-f", container], capture_output=True, timeout=30
                )
                proc.kill()
                proc.wait(timeout=30)
            proc.stdout.close()
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if args.history_output:
        history = result.pop("_history")
        history["archive_sha256"] = digest
        args.history_output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", dir=args.history_output.parent, delete=False) as output:
            json.dump(history, output, indent=2)
        Path(output.name).replace(args.history_output)
    receipt = {
        "schemaVersion": 1,
        "archiveObject": "backups/corpus/" + archive.name,
        "archiveSha256": digest,
        "decryptionVerified": True,
        **result,
        "checkedAt": datetime.now(UTC).isoformat(),
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", dir=args.receipt.parent, delete=False
    ) as output:
        json.dump(receipt, output, indent=2)
    Path(output.name).replace(args.receipt)
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
