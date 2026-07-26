"""Corpus lifecycle audit across manifest, crawler, parser, and graph layers."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipeline.config import (
    AUDIT_DATA_DIR,
    CRAWLER_DATA_DIR,
    PARSED_DATA_DIR,
    PARSE_SUPPORTED_FILE_FORMATS,
    SOURCE_TYPE_DIRS,
)
from pipeline.corpus_manifest import CORPUS_MANIFEST, SourceFamilyManifest
from pipeline.crawler_registry import (
    normalize_local_path,
    read_registry_rows,
    read_source_freshness,
)
from pipeline.graph.connection import get_session
from pipeline.identity import build_document_id
from pipeline.source_selection import (
    build_source_selection_index,
    resolve_source_selection_metadata,
)


FAILURE_REASONS = (
    "crawler_error",
    "removed",
    "unsupported_format",
    "missing_parsed",
    "parse_exception",
    "zero_section_parse",
    "title_only_or_blank_body",
    "missing_graph_load",
    "ineligible_graph_load",
)
_ACTIVE_REGISTRY_STATUSES = frozenset({"downloaded", "updated", "unchanged"})


def _normalize_local_path(path_value: str | None) -> str | None:
    return normalize_local_path(path_value, CRAWLER_DATA_DIR)


def _resolve_local_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    path = Path(path_value)
    if path.is_absolute():
        return path
    return CRAWLER_DATA_DIR / path


def scan_downloaded_files(
    crawler_data_dir: Path = CRAWLER_DATA_DIR,
    source_type_dirs: dict[str, str] = SOURCE_TYPE_DIRS,
) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for source_type, directory_name in source_type_dirs.items():
        source_dir = crawler_data_dir / directory_name
        if not source_dir.exists():
            continue
        for file_path in sorted(path for path in source_dir.iterdir() if path.is_file()):
            files.append(
                {
                    "source_type": source_type,
                    "local_path": str(file_path),
                    "source_format": file_path.suffix.lower(),
                    "filename": file_path.name,
                }
            )
    return files


def read_parsed_sidecars(
    parsed_data_dir: Path = PARSED_DATA_DIR,
    source_type_dirs: dict[str, str] = SOURCE_TYPE_DIRS,
) -> list[dict[str, Any]]:
    reverse_dirs = {directory_name: source_type for source_type, directory_name in source_type_dirs.items()}
    sidecars: list[dict[str, Any]] = []

    for meta_path in parsed_data_dir.glob("*/*.meta.json"):
        directory_name = meta_path.parent.name
        source_type = reverse_dirs.get(directory_name)
        if source_type is None:
            continue
        payload = json.loads(meta_path.read_text())
        section_count = payload.get("section_count", 0)
        quality_flags = list(payload.get("quality_flags") or [])
        if section_count == 0 and "zero_section_parse" not in quality_flags:
            quality_flags.append("zero_section_parse")
        parse_status = payload.get("parse_status") or "parsed"
        answer_ready = payload.get("answer_ready")
        if answer_ready is None:
            answer_ready = parse_status == "parsed" and len(quality_flags) == 0
        sidecars.append(
            {
                "source_type": source_type,
                "meta_path": str(meta_path),
                "json_path": str(meta_path.with_suffix("").with_suffix(".json")),
                "source_file": payload.get("source_file") or payload.get("source_pdf"),
                "source_format": payload.get("source_format"),
                "parse_status": parse_status,
                "quality_flags": quality_flags,
                "answer_ready": bool(answer_ready),
                "section_count": section_count,
                "page_count": payload.get("page_count", 0),
                "content_char_count": payload.get("content_char_count", 0),
            }
        )

    return sidecars


def read_graph_documents() -> tuple[list[dict[str, Any]], str | None]:
    try:
        with get_session() as session:
            result = session.run(
                """
                MATCH (d:Document)
                WHERE d.document_type IN $source_types
                RETURN
                  d.id AS id,
                  d.document_type AS source_type,
                  d.source_url AS source_url,
                  d.pdf_path AS source_path,
                  d.answer_ready AS answer_ready,
                  d.source_format AS source_format,
                  d.authority_tier AS authority_tier,
                  d.answer_role AS answer_role,
                  d.corpus_bucket AS corpus_bucket,
                  d.variant_group AS variant_group,
                  d.variant_date AS variant_date,
                  d.retrieval_ready AS retrieval_ready
                """,
                {"source_types": [family.source_type for family in CORPUS_MANIFEST.source_families]},
            )
            return [
                {
                    "id": record["id"],
                    "source_type": record["source_type"],
                    "source_url": record["source_url"],
                    "source_path": record["source_path"],
                    "answer_ready": record["answer_ready"],
                    "source_format": record["source_format"],
                    "authority_tier": record["authority_tier"],
                    "answer_role": record["answer_role"],
                    "corpus_bucket": record["corpus_bucket"],
                    "variant_group": record["variant_group"],
                    "variant_date": record["variant_date"],
                    "retrieval_ready": record["retrieval_ready"],
                }
                for record in result
            ], None
    except Exception as exc:  # pragma: no cover - exercised in CLI usage
        return [], str(exc)


def _match_parsed_entry(
    registry_row: dict[str, Any],
    parsed_by_source_file: dict[str, dict[str, Any]],
    parsed_by_source_type: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    local_path = _normalize_local_path(registry_row.get("local_path"))
    if local_path and local_path in parsed_by_source_file:
        return parsed_by_source_file[local_path]

    filename_stem = Path(local_path).stem if local_path else None
    if not filename_stem:
        return None

    for parsed_entry in parsed_by_source_type.get(registry_row["source_type"], []):
        source_file = parsed_entry.get("source_file")
        if source_file and Path(source_file).stem == filename_stem:
            return parsed_entry

    return None


def classify_document_entry(
    *,
    source_family: SourceFamilyManifest,
    registry_row: dict[str, Any] | None,
    local_file: dict[str, Any] | None,
    parsed_entry: dict[str, Any] | None,
    graph_entry: dict[str, Any] | None,
    selection_index: dict[str, Any] | None = None,
) -> dict[str, Any]:
    registry_status = registry_row.get("status") if registry_row else None
    source_url = registry_row.get("source_url") if registry_row else None
    local_path = (
        registry_row.get("local_path")
        if registry_row and registry_row.get("local_path")
        else local_file.get("local_path") if local_file else parsed_entry.get("source_file") if parsed_entry else None
    )
    source_path = _resolve_local_path(local_path)
    source_format = (
        parsed_entry.get("source_format")
        if parsed_entry and parsed_entry.get("source_format")
        else source_path.suffix.lower() if source_path else None
    )
    normalized_source_format = (
        source_format
        if source_format is None or source_format.startswith(".")
        else f".{source_format}"
    )
    parse_status = parsed_entry.get("parse_status") if parsed_entry else None
    quality_flags = parsed_entry.get("quality_flags", []) if parsed_entry else []

    downloaded = bool(source_path and source_path.exists())
    parsed = bool(parsed_entry and parse_status == "parsed")
    loaded = graph_entry is not None
    answer_ready_source = graph_entry.get("answer_ready") if graph_entry is not None else None
    if answer_ready_source is None and parsed_entry is not None:
        answer_ready_source = parsed_entry.get("answer_ready")
    answer_ready = bool(loaded and answer_ready_source)

    states = ["discovered"]
    if downloaded:
        states.append("downloaded")
    if parsed:
        states.append("parsed")
    if loaded:
        states.append("loaded")
    if answer_ready:
        states.append("answer_ready")

    failure_reasons: list[str] = []
    if registry_status == "error":
        failure_reasons.append("crawler_error")
    if registry_status == "removed":
        failure_reasons.append("removed")
    if downloaded and normalized_source_format and normalized_source_format not in PARSE_SUPPORTED_FILE_FORMATS:
        failure_reasons.append("unsupported_format")
    if downloaded and normalized_source_format in PARSE_SUPPORTED_FILE_FORMATS and not parsed_entry:
        failure_reasons.append("missing_parsed")
    if parse_status == "parse_exception":
        failure_reasons.append("parse_exception")
    if "zero_section_parse" in quality_flags:
        failure_reasons.append("zero_section_parse")
    if "title_only_or_blank_body" in quality_flags:
        failure_reasons.append("title_only_or_blank_body")
    should_load = bool(
        registry_status in _ACTIVE_REGISTRY_STATUSES
        and parsed
        and parsed_entry
        and parsed_entry.get("answer_ready")
    )
    if should_load and not loaded:
        failure_reasons.append("missing_graph_load")
    if loaded and not should_load:
        failure_reasons.append("ineligible_graph_load")

    reconciliation_issues: list[str] = []
    if registry_row and local_path and not downloaded:
        reconciliation_issues.append("missing_source_file")
    if parsed_entry and parsed_entry.get("source_file") and not Path(parsed_entry["source_file"]).exists():
        reconciliation_issues.append("missing_source_file")
    if local_file and registry_row is None:
        reconciliation_issues.append("missing_registry_record")
    if parsed_entry and registry_row is None:
        reconciliation_issues.append("parsed_without_registry")

    selection = resolve_source_selection_metadata(
        {
            "title": registry_row.get("title") if registry_row else None,
            "source_type": source_family.source_type,
            "source_url": source_url,
            "local_path": local_path,
            "source_format": source_format,
            "status": registry_status,
        },
        selection_index,
    )
    retrieval_ready = graph_entry.get("retrieval_ready") if graph_entry is not None else None
    if retrieval_ready is None:
        retrieval_ready = selection.retrieval_ready

    return {
        "source_type": source_family.source_type,
        "source_url": source_url,
        "title": registry_row.get("title") if registry_row else None,
        "registry_status": registry_status,
        "local_path": local_path,
        "parsed_artifact": parsed_entry.get("json_path") if parsed_entry else None,
        "graph_document_id": graph_entry.get("id") if graph_entry else None,
        "source_format": source_format,
        "authority_tier": source_family.authority_tier,
        "answer_role": source_family.answer_role,
        "required_for_answering": source_family.required_for_answering,
        "corpus_bucket": graph_entry.get("corpus_bucket") if graph_entry is not None else selection.corpus_bucket,
        "variant_group": graph_entry.get("variant_group") if graph_entry is not None else selection.variant_group,
        "variant_date": graph_entry.get("variant_date") if graph_entry is not None else selection.variant_date,
        "retrieval_ready": bool(retrieval_ready),
        "states": states,
        "current_state": states[-1],
        "answer_ready": answer_ready,
        "failure_reasons": sorted(set(failure_reasons)),
        "reconciliation_issues": sorted(set(reconciliation_issues)),
        "parse_status": parse_status,
        "quality_flags": quality_flags,
    }


def build_corpus_audit_report(
    *,
    source_families: tuple[SourceFamilyManifest, ...],
    registry_rows: list[dict[str, Any]],
    local_files: list[dict[str, Any]],
    parsed_sidecars: list[dict[str, Any]],
    graph_documents: list[dict[str, Any]],
    graph_error: str | None = None,
    source_freshness: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    selection_index = build_source_selection_index(registry_rows)
    local_by_path = {
        _normalize_local_path(entry["local_path"]): entry
        for entry in local_files
    }
    parsed_by_source_file = {
        _normalize_local_path(entry["source_file"]): entry
        for entry in parsed_sidecars
        if entry.get("source_file")
    }
    parsed_by_source_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in parsed_sidecars:
        parsed_by_source_type[entry["source_type"]].append(entry)

    graph_by_source_url = {
        entry["source_url"]: entry
        for entry in graph_documents
        if entry.get("source_url")
    }
    graph_by_source_path = {
        _normalize_local_path(entry["source_path"]): entry
        for entry in graph_documents
        if entry.get("source_path")
    }

    documents: list[dict[str, Any]] = []
    matched_local_paths: set[str] = set()
    matched_parsed_sources: set[str] = set()

    source_family_map = {family.source_type: family for family in source_families}
    freshness_by_source = {
        row["source_type"]: row
        for row in (source_freshness or [])
    }

    for registry_row in registry_rows:
        source_family = source_family_map[registry_row["source_type"]]
        normalized_registry_path = _normalize_local_path(registry_row.get("local_path"))
        local_file = local_by_path.get(normalized_registry_path)
        parsed_entry = _match_parsed_entry(
            registry_row,
            parsed_by_source_file,
            parsed_by_source_type,
        )
        graph_entry = (
            graph_by_source_url.get(registry_row.get("source_url"))
            or graph_by_source_path.get(normalized_registry_path)
        )

        if local_file:
            matched_local_paths.add(_normalize_local_path(local_file["local_path"]) or local_file["local_path"])
        if parsed_entry and parsed_entry.get("source_file"):
            matched_parsed_sources.add(_normalize_local_path(parsed_entry["source_file"]) or parsed_entry["source_file"])

        documents.append(
            classify_document_entry(
                source_family=source_family,
                registry_row=registry_row,
                local_file=local_file,
                parsed_entry=parsed_entry,
                graph_entry=graph_entry,
                selection_index=selection_index,
            )
        )

    for local_file in local_files:
        normalized_local_path = _normalize_local_path(local_file["local_path"]) or local_file["local_path"]
        if normalized_local_path in matched_local_paths:
            continue
        source_family = source_family_map[local_file["source_type"]]
        parsed_entry = parsed_by_source_file.get(normalized_local_path)
        if parsed_entry and parsed_entry.get("source_file"):
            matched_parsed_sources.add(_normalize_local_path(parsed_entry["source_file"]) or parsed_entry["source_file"])
        documents.append(
            classify_document_entry(
                source_family=source_family,
                registry_row=None,
                local_file=local_file,
                parsed_entry=parsed_entry,
                graph_entry=graph_by_source_path.get(normalized_local_path),
                selection_index=selection_index,
            )
        )

    for parsed_entry in parsed_sidecars:
        source_file = parsed_entry.get("source_file")
        normalized_source_file = _normalize_local_path(source_file)
        if normalized_source_file and normalized_source_file in matched_parsed_sources:
            continue
        source_family = source_family_map[parsed_entry["source_type"]]
        documents.append(
            classify_document_entry(
                source_family=source_family,
                registry_row=None,
                local_file=local_by_path.get(normalized_source_file) if normalized_source_file else None,
                parsed_entry=parsed_entry,
                graph_entry=graph_by_source_path.get(normalized_source_file),
                selection_index=selection_index,
            )
        )

    documents.sort(
        key=lambda entry: (
            entry["source_type"],
            entry.get("source_url") or "",
            entry.get("local_path") or "",
        )
    )

    source_family_reports: list[dict[str, Any]] = []
    failure_counter: Counter[str] = Counter()
    graph_id_counts = Counter(
        entry["id"] for entry in graph_documents if entry.get("id")
    )
    registry_id_counts: Counter[str] = Counter()
    for row in registry_rows:
        try:
            registry_id_counts[
                build_document_id(
                    row["source_type"],
                    row.get("source_url"),
                    _normalize_local_path(row.get("local_path")),
                )
            ] += 1
        except (KeyError, TypeError, ValueError):
            # Other reconciliation checks report malformed registry rows. Keep
            # the audit available so those errors can be inspected and fixed.
            continue

    duplicate_document_id_values = sorted(
        {
            document_id
            for counts in (registry_id_counts, graph_id_counts)
            for document_id, count in counts.items()
            if count > 1
        }
    )
    duplicate_document_ids = sum(
        count - 1
        for counts in (registry_id_counts, graph_id_counts)
        for count in counts.values()
        if count > 1
    )

    for source_family in source_families:
        family_docs = [entry for entry in documents if entry["source_type"] == source_family.source_type]
        family_failures = Counter(reason for entry in family_docs for reason in entry["failure_reasons"])
        failure_counter.update(family_failures)

        counts = {
            "discovered": len(family_docs),
            "downloaded": sum("downloaded" in entry["states"] for entry in family_docs),
            "parsed": sum("parsed" in entry["states"] for entry in family_docs),
            "loaded": sum("loaded" in entry["states"] for entry in family_docs),
            "answer_ready": sum("answer_ready" in entry["states"] for entry in family_docs),
            "retrieval_ready": sum(entry["retrieval_ready"] for entry in family_docs),
        }
        bucket_counts = Counter((entry["corpus_bucket"] or "default") for entry in family_docs)

        authoritative_count = (
            len(family_docs) if source_family.authority_tier == "authoritative" else 0
        )
        freshness = freshness_by_source.get(source_family.source_type, {})
        last_discovery = freshness.get("last_successful_discovery_at")
        freshness_status = "never"
        if last_discovery:
            checked_at = datetime.fromisoformat(
                str(last_discovery).replace("Z", "+00:00")
            )
            if checked_at.tzinfo is None:
                checked_at = checked_at.replace(tzinfo=timezone.utc)
            age_days = (
                datetime.now(timezone.utc) - checked_at.astimezone(timezone.utc)
            ).total_seconds() / 86_400
            freshness_status = (
                "fresh"
                if age_days <= source_family.freshness_sla_days
                else "stale"
            )
        source_family_reports.append(
            {
                "source_type": source_family.source_type,
                "authority_tier": source_family.authority_tier,
                "answer_role": source_family.answer_role,
                "required_for_answering": source_family.required_for_answering,
                "freshness_expectation": source_family.freshness_expectation,
                "discovery_interval_hours": source_family.discovery_interval_hours,
                "freshness_sla_days": source_family.freshness_sla_days,
                "last_successful_discovery_at": last_discovery,
                "last_content_change_at": freshness.get("last_content_change_at"),
                "freshness_status": freshness_status,
                "counts": counts,
                "corpus_buckets": dict(sorted(bucket_counts.items())),
                "authoritative_documents": authoritative_count,
                "non_authoritative_documents": len(family_docs) - authoritative_count,
                "failure_reasons": dict(sorted(family_failures.items())),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "graph_error": graph_error,
        "failure_reason_labels": list(FAILURE_REASONS),
        "summary": {
            "documents_total": len(documents),
            "by_failure_reason": dict(sorted(failure_counter.items())),
            "duplicate_document_ids": duplicate_document_ids,
            "duplicate_document_id_values": duplicate_document_id_values,
        },
        "source_families": source_family_reports,
        "documents": documents,
    }


def render_audit_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Corpus Audit",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Documents tracked: {report['summary']['documents_total']}",
    ]
    if report.get("graph_error"):
        lines.append(f"- Graph status: unavailable ({report['graph_error']})")

    lines.extend([
        "",
        "| Source Family | Tier | Freshness | Docs | Downloaded | Parsed | Loaded | Answer Ready | Failures |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ])

    for family in report["source_families"]:
        failures = ", ".join(
            f"{reason}:{count}"
            for reason, count in family["failure_reasons"].items()
        ) or "none"
        lines.append(
            "| {source_type} | {authority_tier} | {freshness_status} | {discovered} | {downloaded} | {parsed} | {loaded} | {answer_ready} | {failures} |".format(
                source_type=family["source_type"],
                authority_tier=family["authority_tier"],
                freshness_status=family["freshness_status"],
                discovered=family["counts"]["discovered"],
                downloaded=family["counts"]["downloaded"],
                parsed=family["counts"]["parsed"],
                loaded=family["counts"]["loaded"],
                answer_ready=family["counts"]["answer_ready"],
                failures=failures,
            )
        )

        if (
            family.get("corpus_buckets")
            and (
                any(bucket != "default" for bucket in family["corpus_buckets"])
                or family["counts"]["retrieval_ready"] != family["counts"]["discovered"]
            )
        ):
            lines.append(
                "|  |  |  |  |  |  |  | retrieval-ready: {retrieval_ready} | buckets: {buckets} |".format(
                    retrieval_ready=family["counts"]["retrieval_ready"],
                    buckets=", ".join(
                        f"{bucket}:{count}"
                        for bucket, count in family["corpus_buckets"].items()
                    ),
                )
            )

    return "\n".join(lines) + "\n"


def run_corpus_audit(
    *,
    json_output_path: Path | None = None,
    markdown_output_path: Path | None = None,
) -> dict[str, Any]:
    graph_documents, graph_error = read_graph_documents()
    report = build_corpus_audit_report(
        source_families=CORPUS_MANIFEST.source_families,
        registry_rows=read_registry_rows(),
        local_files=scan_downloaded_files(),
        parsed_sidecars=read_parsed_sidecars(),
        graph_documents=graph_documents,
        graph_error=graph_error,
        source_freshness=read_source_freshness(),
    )

    markdown = render_audit_markdown(report)
    output_dir = AUDIT_DATA_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = json_output_path or output_dir / "latest-corpus-audit.json"
    md_path = markdown_output_path or output_dir / "latest-corpus-audit.md"

    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2))
    md_path.write_text(markdown)

    return {
        "report": report,
        "markdown": markdown,
        "json_path": str(json_path),
        "markdown_path": str(md_path),
    }
