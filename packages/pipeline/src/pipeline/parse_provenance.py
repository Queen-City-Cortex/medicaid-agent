"""Read-only evidence for retained parses without an exact registry path."""

import hashlib
import json
from pathlib import Path
import sqlite3
from pipeline.corpus_manifest import CORPUS_MANIFEST
from pipeline.parse.artifact_paths import artifact_stem_for_source_path


def _digest(path):
    if not path.is_file():
        return None
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def _artifacts_valid(path, meta):
    stem = path.name.removesuffix(".meta.json")
    return all(
        _digest(path.with_name(stem + ext))
        == str(
            meta.get("artifacts", {}).get(kind, {}).get("sha256") or ""
        ).removeprefix("sha256:")
        for kind, ext in (("json", ".json"), ("markdown", ".md"))
    )


def reconcile_parse_orphans(corpus: Path) -> dict:
    """Exclude duplicate retained parses only after comparing actual source bytes."""
    db = corpus / "crawler/crawler.db"
    for suffix in ("-wal", "-journal"):
        pending = Path(str(db) + suffix)
        if pending.exists() and pending.stat().st_size:
            raise ValueError("Checkpoint the registry before read-only reconciliation")
    original_registry_hash = _digest(db)
    skipped = {"unknown_family": 0, "uninterpretable_source_path": 0}
    with sqlite3.connect(f"file:{db}?mode=ro&immutable=1", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        rows = [dict(r) for r in conn.execute("SELECT * FROM documents")]
    families = {
        f.directory_name: f.source_type for f in CORPUS_MANIFEST.source_families
    }
    by_path = {(r["source_type"], r["local_path"]) for r in rows}
    results = []
    for path in sorted((corpus / "pipeline/parsed").glob("*/*.meta.json")):
        meta = json.loads(path.read_text())
        family = families.get(path.parent.name)
        value = str(meta.get("source_file") or meta.get("source_pdf") or "")
        if family is None:
            skipped["unknown_family"] += 1
            continue
        if "/documents/" not in value:
            skipped["uninterpretable_source_path"] += 1
            continue
        relative = Path(value.rsplit("/documents/", 1)[1])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe retained source path")
        if (family, str(relative)) in by_path:
            continue
        recorded = str(
            meta.get("source_file_hash") or meta.get("source_pdf_hash") or ""
        ).removeprefix("sha256:")
        actual = _digest(corpus / "crawler/documents" / relative)
        candidates = [
            r
            for r in rows
            if r["source_type"] == family
            and recorded
            and r["status"] in {"downloaded", "updated", "unchanged"}
            and str(r["file_hash"] or "").removeprefix("sha256:") == recorded
        ]
        result = {
            "sidecar": str(path.relative_to(corpus)),
            "sidecarSha256": _digest(path),
            "sourceFamily": family,
            "recordedSourceSha256": recorded,
            "retainedSourceSha256": actual,
            "disposition": "unresolved_excluded",
            "reason": "No unique verified source and artifact match",
            "matchingRegistryRows": len(candidates),
        }
        if actual == recorded and len(candidates) == 1:
            row = candidates[0]
            stem = artifact_stem_for_source_path(Path(row["local_path"]))
            canonical_path = path.parent / (stem + ".meta.json")
            old_stem = path.name.removesuffix(".meta.json")
            old_json, new_json = (
                path.with_name(old_stem + ".json"),
                path.parent / (stem + ".json"),
            )
            if canonical_path.is_file() and old_json.is_file() and new_json.is_file():
                canonical = json.loads(canonical_path.read_text())
                old, new = (
                    json.loads(old_json.read_text()),
                    json.loads(new_json.read_text()),
                )
                for data in (old, new):
                    data.pop("name", None)
                    data.pop("origin", None)
                md = _digest(path.with_name(old_stem + ".md"))
                if (
                    _digest(corpus / "crawler/documents" / row["local_path"])
                    == recorded
                    and _artifacts_valid(path, meta)
                    and _artifacts_valid(canonical_path, canonical)
                    and canonical.get("answer_ready") is True
                    and canonical.get("parse_status") == "parsed"
                    and not canonical.get("quality_flags")
                    and old == new
                    and md is not None
                    and md == _digest(path.parent / (stem + ".md"))
                    and str(
                        canonical.get("source_file_hash")
                        or canonical.get("source_pdf_hash")
                        or ""
                    ).removeprefix("sha256:")
                    == recorded
                ):
                    result.update(
                        disposition="verified_duplicate_excluded",
                        reason="Exact same-family payload and canonical parse content",
                        registryId=row["id"],
                        canonicalSourcePath=row["local_path"],
                        sourceUrl=row["source_url"],
                        canonicalSidecar=str(canonical_path.relative_to(corpus)),
                        canonicalSidecarSha256=_digest(canonical_path),
                        retainedJsonSha256=_digest(old_json),
                        canonicalJsonSha256=_digest(new_json),
                        markdownSha256=md,
                    )
        results.append(result)
    if _digest(db) != original_registry_hash:
        raise ValueError("Registry changed during provenance reconciliation")
    return {
        "registryUnchangedVerified": True,
        "skippedMetadataReasons": skipped,
        "mode": "read-only-provenance-reconciliation",
        "registrySha256": _digest(db),
        "registryModified": False,
        "artifactsModified": False,
        "graphDocumentsAdded": 0,
        "orphans": results,
        "count": len(results),
        "verifiedDuplicates": sum(
            r["disposition"] == "verified_duplicate_excluded" for r in results
        ),
        "unresolved": sum(r["disposition"] == "unresolved_excluded" for r in results),
    }
