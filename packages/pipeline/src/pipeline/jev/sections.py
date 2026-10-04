"""Full-input labels cached outside parser artifacts; enrichment never edits text.

A frozen graph cannot be enriched. Cache-only candidate rebuilds are repeatable
and incur no inference cost. Successful raw responses, failures and coverage are
represented in an immutable manifest; fallbacks remain existing heuristics.
"""
import json
from pathlib import Path

from pipeline.config import PIPELINE_DATA_DIR
from pipeline.jev.budget import BudgetExceeded, Ledger
from pipeline.jev.client import MODEL, JevError, canonical, digest, question_spec
from pipeline.jev.artifacts import section_input, cache_key, validate_cache, manifest_digest, validate_label_manifest
from pipeline.jev.inference import budgeted_classify

LABEL_ROOT = PIPELINE_DATA_DIR / "section-labels"


def iter_graph_sections(section_ids: list[str] | None = None):
    from pipeline.graph.connection import get_session
    with get_session(fetch_size=8) as session:
        for row in session.run("""
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
            WHERE $ids IS NULL OR s.id IN $ids
            WITH d, s ORDER BY d.document_type, d.id, s.id
            RETURN s.id AS id, d.id AS documentId, s.title AS title,
              s.section_number AS sectionNumber, s.content_text AS content,
              d.title AS documentTitle, d.document_type AS documentType, d.policy_number AS policyNumber
        """, ids=section_ids):
            yield dict(row)


def graph_sections(section_ids: list[str] | None = None) -> list[dict]:
    return list(iter_graph_sections(section_ids))


def graph_section_index() -> list[dict]:
    from pipeline.graph.connection import get_session
    with get_session() as session:
        return [dict(row) for row in session.run("""
            MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
            RETURN s.id AS id, d.id AS documentId, d.document_type AS documentType,
              size(trim(coalesce(s.content_text, ''))) AS contentLength
            ORDER BY d.document_type, d.id, s.id
        """)]


def label_sections(rows: list[dict], *, root: Path = LABEL_ROOT,
                   ledger: Ledger | None = None, cache_only: bool = True) -> dict:
    questions = question_spec()["roles"]
    (root / "cache").mkdir(parents=True, exist_ok=True)
    entries, annotations = [], []
    stopped = None
    for row in rows:
        state = section_input(row)
        key = cache_key(state, questions)
        path = root / "cache" / f"{key}.json"
        entry = {"id": row["id"], "documentId": row["documentId"], "inputHash": digest(state), "cacheKey": key}
        cached = None
        if not state["content"].strip():
            entry["status"] = "empty"
        elif path.exists():
            cached = validate_cache(json.loads(path.read_text()))
            if cached["key"] != key:
                raise ValueError("Cache file identity mismatch")
        elif stopped or cache_only:
            entry["status"] = stopped or "pending_cache"
        else:
            if ledger is None:
                raise ValueError("Paid enrichment requires campaign ledger")
            try:
                result = budgeted_classify(canonical(state), questions, ledger)
                response = result["response"]
                cached = {**result, "model": MODEL, "input": state, "inputHash": digest(state),
                          "specHash": digest(questions), "key": key,
                          "probabilities": {k: a["noul"] for k, a in response["answers"].items()}}
                temporary = path.with_suffix(".tmp")
                temporary.write_text(canonical(cached) + "\n")
                temporary.replace(path)
            except BudgetExceeded:
                stopped = entry["status"] = "pending_budget"
            except JevError as error:
                entry["status"] = error.code
                if error.code != "input":
                    stopped = "pending_credentials" if error.code == "credentials" or error.status in {401, 403} else "pending_inference"
        if cached:
            entry["status"] = "labeled"
            entry["cacheHash"] = digest(cached)
            annotations.append({"id": row["id"], "expected": state, "annotation": canonical({
                key: cached[key] for key in ("model", "specHash", "inputHash", "probabilities")})})
        entries.append(entry)
    manifest = {"version": 1, "model": MODEL, "specHash": digest(questions), "sections": entries,
                "qualification": "pending_review", "feature": {"threshold": .9, "maxBonus": 1}}
    manifest["digest"] = manifest_digest(manifest)
    (root / "manifests").mkdir(exist_ok=True)
    path = root / "manifests" / f"{manifest['digest']}.json"
    path.write_text(canonical(manifest) + "\n")
    validate_label_manifest(manifest, root)
    return {"manifest": manifest, "annotations": annotations, "path": str(path)}


def enrich_graph(*, cache_only: bool = True, ledger_path: Path | None = None) -> dict:
    from pipeline.graph.corpus_writer import graph_writer
    ledger = Ledger(ledger_path) if ledger_path else None
    try:
        result = label_sections(iter_graph_sections(), ledger=ledger, cache_only=cache_only)
        graph_writer.write_section_roles(result["annotations"], result["manifest"]["digest"])
        statuses = {}
        for row in result["manifest"]["sections"]:
            statuses[row["status"]] = statuses.get(row["status"], 0) + 1
        return {"digest": result["manifest"]["digest"], "manifestPath": result["path"],
                "statuses": statuses, "qualification": "pending_review"}
    finally:
        if ledger:
            ledger.close()


def validate_graph_labels(annotation_digest: str, root: Path = LABEL_ROOT) -> None:
    """Validate live inputs AND exact probability payloads before evaluation/stamp."""
    from pipeline.graph.connection import get_session
    value = json.loads((root / "manifests" / f"{annotation_digest}.json").read_text())
    validate_label_manifest(value, root)
    expected = {row["id"]: row for row in value["sections"]}
    rows = graph_sections()
    if {r["id"] for r in rows} != set(expected):
        raise ValueError("Section annotation inventory changed")
    with get_session() as session:
        annotations = {r["id"]: r["annotation"] for r in session.run("MATCH (s:Section) RETURN s.id AS id, s.jev_section_roles AS annotation")}
    for row in rows:
        entry = expected[row["id"]]
        if digest(section_input(row)) != entry["inputHash"]:
            raise ValueError("Section annotation input changed")
        raw = annotations.get(row["id"])
        if entry["status"] != "labeled":
            if raw:
                raise ValueError("Unexpected annotation outside manifest")
            continue
        cached = validate_cache(json.loads((root / "cache" / f"{entry['cacheKey']}.json").read_text()))
        wanted = {k: cached[k] for k in ("model", "specHash", "inputHash", "probabilities")}
        if not raw or json.loads(raw) != wanted:
            raise ValueError("Live section probability payload changed")
