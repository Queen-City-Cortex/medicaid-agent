"""Evaluation-only evidence identities. Never writes to either graph."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from collections.abc import Iterable
from collections import defaultdict
from pathlib import Path

from pipeline.identity import canonicalize_source_url
from pipeline.source_lifecycle import stable_hash

NORMALIZATION_VERSION = 1


def section_key(row: dict) -> tuple[str, str, str | None]:
    return (
        row["source_family"],
        canonicalize_source_url(row["source_url"]),
        row.get("section_number") or None,
    )


def content_signature(row: dict) -> str:
    # Full normalized content and structural parent evidence, never fuzzy title
    # or policy-number matching. Empty content cannot disambiguate duplicates.
    text = " ".join((row.get("content_text") or "").split())
    if text:
        return stable_hash(
            {
                "content": text,
                "level": row.get("level"),
                "parent_number": row.get("parent_number"),
                "parent_content_hash": row.get("parent_content_hash"),
            }
        )
    # Empty structural headings cannot match by title alone. Exact neighboring
    # content plus title/level/parent establishes the location within this source.
    if row.get("previous_content_hash") or row.get("next_content_hash"):
        return stable_hash(
            {
                key: row.get(key)
                for key in [
                    "section_title",
                    "level",
                    "parent_number",
                    "parent_content_hash",
                    "previous_content_hash",
                    "next_content_hash",
                ]
            }
        )
    return ""


def parent_structure_signature(row: dict) -> str:
    if row.get("section_number") or not all(
        row.get(k) for k in ["section_title", "parent_number", "parent_content_hash"]
    ):
        return ""
    # A named subsection under an exactly evidenced numbered parent remains the
    # same logical section when its own revision table changes. Uniqueness is
    # checked across all sections at this source identity.
    return stable_hash(
        {
            k: row.get(k)
            for k in ["section_title", "level", "parent_number", "parent_content_hash"]
        }
    )


def empty_structure_signature(row: dict) -> str:
    if (row.get("content_text") or "").strip() or not all(
        row.get(k) for k in ["section_title", "previous_title", "next_title"]
    ):
        return ""
    # Exact three-heading sibling sequence, levels and parent identity establish
    # a structural location. This is never a fuzzy or isolated title match.
    return stable_hash(
        {
            k: row.get(k)
            for k in [
                "section_title",
                "level",
                "parent_number",
                "previous_title",
                "previous_level",
                "next_title",
                "next_level",
            ]
        }
    )


class EvidenceNormalizer:
    def __init__(self, reference: list[dict], graph: Iterable[dict]):
        self.reference = {r["section_id"]: r for r in reference}
        if len(self.reference) != len(reference):
            raise ValueError("Duplicate canonical evidence IDs")
        expected, observed = defaultdict(list), defaultdict(list)
        seen = set()
        for row in reference:
            expected[section_key(row)].append(row)
        for row in graph:
            if row["section_id"] in seen:
                raise ValueError(
                    "Ambiguous graph evidence: duplicate raw section IDs or multiple parents"
                )
            seen.add(row["section_id"])
            # Retain the exact matching evidence, not every document's full body.
            compact = {k: v for k, v in row.items() if k != "content_text"}
            compact["_signature"] = content_signature(row)
            compact["_identity"] = stable_hash(row.get("content_text"))
            compact["_parent_structure"] = parent_structure_signature(row)
            compact["_empty_structure"] = empty_structure_signature(row)
            compact["_has_body"] = bool((row.get("content_text") or "").strip())
            observed[section_key(row)].append(compact)
        self.raw_to_canonical, self.canonical_to_raw, self.mappings = {}, {}, []
        for key, rows in observed.items():
            candidates = expected.get(key, [])
            for row in rows:
                signature = row["_signature"]
                matches = (
                    candidates
                    if len(rows) == len(candidates) == 1 and key[2] is not None
                    else [
                        r
                        for r in candidates
                        if signature and content_signature(r) == signature
                    ]
                )
                method = "exact_content_and_structure"
                if not matches:
                    matches = [
                        r
                        for r in candidates
                        if r["section_id"] == row["section_id"]
                        and r.get("section_title") == row.get("section_title")
                        and r.get("level") == row.get("level")
                        and row["_identity"] == stable_hash(r.get("content_text"))
                    ]
                    if matches:
                        method = "canonical_identity"
                if not matches:
                    structural = row["_parent_structure"]
                    matches = [
                        r
                        for r in candidates
                        if structural and parent_structure_signature(r) == structural
                    ]
                    if matches:
                        method = "exact_numbered_parent_and_heading"
                if not matches and not row["_has_body"]:
                    structural = row["_empty_structure"]
                    matches = [
                        r
                        for r in candidates
                        if structural and empty_structure_signature(r) == structural
                    ]
                    method = "exact_empty_heading_sequence"
                if len(matches) > 1:
                    raise ValueError(
                        f"Ambiguous evidence identity for {row['section_id']}"
                    )
                canonical = matches[0]["section_id"] if matches else None
                if canonical in self.canonical_to_raw:
                    raise ValueError(f"Multiple graph sections map to {canonical}")
                if canonical:
                    self.raw_to_canonical[row["section_id"]] = canonical
                    self.canonical_to_raw[canonical] = row["section_id"]
                self.mappings.append(
                    {
                        "raw_id": row["section_id"],
                        "canonical_id": canonical,
                        "source_family": key[0],
                        "source_url": key[1],
                        "section_number": key[2],
                        "content_signature": signature,
                        "method": "unique_source_and_number"
                        if canonical
                        and len(rows) == len(candidates) == 1
                        and key[2] is not None
                        else method
                        if canonical
                        else "unmatched",
                    }
                )
        self.mappings.sort(key=lambda row: row["raw_id"])
        self.mapping_hash = stable_hash(self.mappings)
        self.catalog_hash = stable_hash(reference)

    def normalized(self, raw_id: str) -> str:
        return self.raw_to_canonical.get(raw_id, "unmapped:" + raw_id)

    def graph_entries(self, entries: list[dict]) -> list[dict]:
        result = copy.deepcopy(entries)
        for entry in result:
            for key in ["primary_sections", "supporting_sections"]:
                for section in entry["evidence"].get(key, []):
                    canonical = section["section_id"]
                    if canonical not in self.reference:
                        raise ValueError(
                            f"Benchmark evidence is absent from the frozen identity catalog: {canonical}"
                        )
                    section["canonical_section_id"] = canonical
                    # An absent real section stays a miss, never a substitute.
                    section["section_id"] = self.canonical_to_raw.get(
                        canonical, "missing:" + canonical
                    )
        return result

    def evidence(self) -> dict:
        return {
            "version": NORMALIZATION_VERSION,
            "catalogHash": self.catalog_hash,
            "mappingHash": self.mapping_hash,
            "mappings": self.mappings,
            "missingCanonicalIds": sorted(
                set(self.reference) - self.canonical_to_raw.keys()
            ),
        }


def load_normalizer() -> EvidenceNormalizer | None:
    catalog_path = os.environ.get("EVAL_IDENTITY_CATALOG")
    if not catalog_path:
        return None
    from pipeline.graph.connection import get_driver
    from pipeline.eval.identity_read import graph_rows

    catalog = json.loads(Path(catalog_path).read_text())
    if catalog.get("schema_version") != NORMALIZATION_VERSION:
        raise ValueError("Incompatible evaluation identity catalog")
    from pipeline.config import NEO4J_DATABASE

    with get_driver().session(
        database=NEO4J_DATABASE, default_access_mode="READ", fetch_size=10
    ) as session:
        return EvidenceNormalizer(catalog["sections"], graph_rows(session))


def build_catalog(entries: list[dict]) -> dict:
    """Read the frozen canonical parses/caches; do not fetch or mutate a graph."""
    import re
    from pipeline.config import CRAWLER_DATA_DIR, ECFR_CACHE_DIR, PARSED_DATA_DIR
    from pipeline.crawler_registry import read_registry_rows, normalize_local_path
    from pipeline.identity import build_document_id
    from pipeline.graph.loader import (
        build_sections_from_items,
        build_sections_from_synthetic_items,
    )
    from pipeline.federal.parser import parse_part_xml
    from pipeline.federal.ssa_client import statute_cache_path, statute_source_url
    from pipeline.federal.uslm_parser import parse_statute_compilation
    from pipeline.references.citations import (
        federal_regulation_doc_id,
        federal_statute_doc_id,
    )

    needed = {
        s["document_id"]
        for e in entries
        for kind in ["primary_sections", "supporting_sections"]
        for s in e["evidence"].get(kind, [])
    }
    references, artifacts, loaded = [], {}, set()

    def append(doc_id, family, url, sections, artifact):
        if doc_id in loaded:
            raise ValueError(
                f"Multiple canonical artifacts for {doc_id}; resolve identity before evaluation"
            )
        loaded.add(doc_id)
        artifacts[str(artifact)] = hashlib.sha256(artifact.read_bytes()).hexdigest()
        by_id = {s["id"]: s for s in sections}
        next_by_id = {
            s["prev_sibling_id"]: s for s in sections if s.get("prev_sibling_id")
        }

        def neighbor_hash(section):
            content = " ".join((section.get("content_text") or "").split())
            return hashlib.sha256(content.encode()).hexdigest() if content else None

        for section in sections:
            parent = by_id.get(section.get("parent_id"), {})
            parent_text = " ".join((parent.get("content_text") or "").split())
            references.append(
                {
                    "section_id": section["id"],
                    "source_family": family,
                    "source_url": url,
                    "section_number": section.get("section_number"),
                    "section_title": section.get("title"),
                    "previous_title": by_id.get(section.get("prev_sibling_id"), {}).get(
                        "title"
                    ),
                    "previous_level": by_id.get(section.get("prev_sibling_id"), {}).get(
                        "level"
                    ),
                    "next_title": next_by_id.get(section["id"], {}).get("title"),
                    "next_level": next_by_id.get(section["id"], {}).get("level"),
                    "previous_content_hash": neighbor_hash(
                        by_id.get(section.get("prev_sibling_id"), {})
                    ),
                    "next_content_hash": neighbor_hash(
                        next_by_id.get(section["id"], {})
                    ),
                    "content_text": section.get("content_text", ""),
                    "level": section.get("level"),
                    "parent_number": parent.get("section_number"),
                    "parent_content_hash": hashlib.sha256(
                        parent_text.encode()
                    ).hexdigest()
                    if parent_text
                    else None,
                }
            )

    registry = {
        normalize_local_path(r["local_path"]): r
        for r in read_registry_rows()
        if r.get("local_path") and r["status"] in {"downloaded", "updated", "unchanged"}
    }
    for meta_file in sorted(PARSED_DATA_DIR.rglob("*.meta.json")):
        meta = json.loads(meta_file.read_text())
        relative = normalize_local_path(
            meta.get("source_file") or meta.get("source_pdf"), CRAWLER_DATA_DIR
        )
        row = registry.get(relative)
        if not row:
            continue
        doc_id = build_document_id(row["source_type"], row["source_url"])
        if (
            doc_id not in needed
            or meta.get("parse_status", "parsed") != "parsed"
            or meta.get("answer_ready") is False
            or meta.get("quality_flags")
        ):
            continue
        source_hash = str(
            meta.get("source_file_hash") or meta.get("source_pdf_hash") or ""
        ).removeprefix("sha256:")
        if not source_hash or source_hash != str(
            row.get("file_hash") or ""
        ).removeprefix("sha256:"):
            continue
        artifact = meta_file.with_name(
            meta_file.name.removesuffix(".meta.json") + ".json"
        )
        expected_hash = (
            meta.get("artifacts", {}).get("json", {}).get("sha256") or ""
        ).removeprefix("sha256:")
        if (
            expected_hash
            and hashlib.sha256(artifact.read_bytes()).hexdigest() != expected_hash
        ):
            raise ValueError(f"Canonical parsed artifact hash mismatch: {artifact}")
        actual_source = CRAWLER_DATA_DIR / relative
        if (
            not actual_source.is_file()
            or hashlib.sha256(actual_source.read_bytes()).hexdigest() != source_hash
        ):
            raise ValueError(
                f"Canonical source artifact changed or disappeared: {relative}"
            )
        payload = json.loads(artifact.read_text())
        sections = (
            build_sections_from_synthetic_items(payload, doc_id)
            if "synthetic_sections" in payload
            else build_sections_from_items(payload, doc_id)
        )
        append(doc_id, row["source_type"], row["source_url"], sections, artifact)
    for artifact in sorted(ECFR_CACHE_DIR.glob("title-*-part-*.xml")):
        match = re.fullmatch(r"title-(\d+)-part-(\d+)\.xml", artifact.name)
        if not match:
            continue
        title, part = map(int, match.groups())
        doc_id = federal_regulation_doc_id(title, part)
        if doc_id in needed:
            append(
                doc_id,
                "federal_regulation",
                f"https://www.ecfr.gov/current/title-{title}/part-{part}",
                parse_part_xml(artifact.read_text(), title, part),
                artifact,
            )
    for title in [19, 21]:
        doc_id = federal_statute_doc_id(title)
        if doc_id in needed:
            artifact = statute_cache_path(title)
            append(
                doc_id,
                "federal_statute",
                statute_source_url(title),
                parse_statute_compilation(artifact.read_text(), title),
                artifact,
            )
    if needed - loaded:
        raise ValueError(
            "Frozen source artifacts missing for benchmark identities: "
            + ", ".join(sorted(needed - loaded))
        )
    expected_ids = {
        s["section_id"]
        for e in entries
        for kind in ["primary_sections", "supporting_sections"]
        for s in e["evidence"].get(kind, [])
    }
    references = [r for r in references if r["section_id"] in expected_ids]
    references.sort(key=lambda r: r["section_id"])
    # Validate every benchmark identity before any expensive evaluation runs.
    EvidenceNormalizer(references, references).graph_entries(entries)
    return {
        "schema_version": NORMALIZATION_VERSION,
        "sections": references,
        "artifactHashes": artifacts,
        "catalogHash": stable_hash(references),
    }
