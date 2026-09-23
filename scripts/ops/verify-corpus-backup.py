"""Verify an encrypted corpus archive without persisting the age private key."""

import argparse
import ctypes
import hashlib
import json
import sqlite3
import subprocess
import tarfile
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path


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


def inspect_archive(stream):
    hashes, metas = {}, {}
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
                keep = is_meta or member.name in [
                    "crawler/crawler.db",
                    "crawler/crawler.db-wal",
                    "crawler/crawler.db-shm",
                ]
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
        checked = 0
        for name, meta in metas.items():
            for kind, suffix in [("json", ".json"), ("markdown", ".md")]:
                expected = meta.get("artifacts", {}).get(kind, {}).get("sha256")
                if expected:
                    if hashes.get(name.removesuffix(".meta.json") + suffix) != expected:
                        raise ValueError("Parsed artifact hash mismatch: " + name)
                    checked += 1
        for row in retirements:
            for capture in json.loads(row["evidence_json"])["evidence"]:
                if hashes.get(capture["capture_path"]) != "sha256:" + capture["sha256"]:
                    raise ValueError("Retirement evidence missing or changed in backup")
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
        snapshot = (
            "sha256:"
            + hashlib.sha256(
                json.dumps(
                    {"documents": documents, "retirements": retirements},
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest()
        )
        return {
            "sourceSnapshotHash": snapshot,
            "sqliteIntegrity": integrity,
            "artifactHashesChecked": checked,
            "retirementRecordsChecked": len(retirements),
            "uncompressedBytes": byte_count,
            "counts": counts,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
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
            result = inspect_archive(proc.stdout)
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
