#!/usr/bin/env python3
"""Read-only identity and embedding-volume inspection; makes no provider calls."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location("preparation", Path(__file__).with_name("prepare-qualification.py"))
preparation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparation)


def main():
    mounts = [line.split() for line in Path("/proc/mounts").read_text().splitlines()]
    preparation.validate_environment(os.environ, mounts)
    if not all(preparation.readonly_mount(mounts, path) for path in ("/inputs.json", "/catalog.json")):
        raise ValueError("Pinned inspection inputs must be mounted read-only")
    preparation.deny_network()
    import dotenv
    dotenv.load_dotenv = lambda *_args, **_kwargs: False
    from neo4j import GraphDatabase
    from pipeline import config
    import sqlite3
    registry_uri = preparation.immutable_registry_uri(config.CRAWLER_DB_PATH)
    original_connect = sqlite3.connect
    def readonly_connect(database, *args, **kwargs):
        database_path = str(database).removeprefix("file:").split("?", 1)[0]
        if database_path == str(config.CRAWLER_DB_PATH):
            database = registry_uri
            kwargs["uri"] = True
        return original_connect(database, *args, **kwargs)
    sqlite3.connect = readonly_connect
    from pipeline.graph import connection
    connection._driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD), fetch_size=8)
    inputs = json.loads(Path("/inputs.json").read_text())
    preparation.CONTEXT.update({
        "mode": "read-only-inspection", "implementationRevision": inputs["implementationRevision"],
        "inputsSha256": preparation.digest(Path("/inputs.json")),
        "inspectorSha256": preparation.digest(Path(__file__)),
    })
    import importlib
    module_names = ["chunker", "plan_graph", "inspection", "generator", "voyage_client"]
    modules = [importlib.import_module("pipeline.embeddings." + name) for name in module_names]
    modules.extend(importlib.import_module(name) for name in ("pipeline.parse_provenance", "pipeline.config", "pipeline.graph.connection", "pipeline.freshness"))
    preparation.CONTEXT["plannerModuleHashes"] = {
        module.__name__: preparation.digest(Path(module.__file__)) for module in modules
    }
    if preparation.CONTEXT["plannerModuleHashes"] != inputs["plannerModuleHashes"]:
        raise ValueError("Imported planner modules differ from pinned implementation")
    with connection.get_session() as session:
        marker = session.run("MATCH (p:QualificationPreparation) RETURN properties(p) AS marker").single()
        if not marker or marker["marker"]["sourceSnapshotHash"] != inputs["sourceSnapshotHash"]:
            raise ValueError("Only the completed matching preparation graph may be inspected")
        preparation.CONTEXT["buildRunId"] = marker["marker"]["runId"]
    if marker["marker"].get("harnessSha256") != inputs["graphBuildHarnessSha256"]:
        raise ValueError("Graph differs from the attested retained build")
    from pipeline.freshness import build_answer_ready_snapshot
    def check_snapshot():
        snapshot = build_answer_ready_snapshot(Path("/data/pipeline/parsed"),
            include_answer_scopes=False, db_path=Path("/data/crawler/crawler.db"))
        if "sha256:" + snapshot["snapshot_hash"] != inputs["sourceSnapshotHash"]:
            raise ValueError("Complete corpus snapshot differs from retained build")
        return snapshot
    before = check_snapshot()
    catalog = json.loads(Path("/catalog.json").read_text())
    if catalog["catalogHash"] != inputs["catalogHash"]:
        raise ValueError("Catalog differs from pinned preparation inputs")
    from pipeline.eval.identity import EvidenceNormalizer
    from pipeline.source_lifecycle import stable_hash
    graph = []
    sources = sorted({(row["source_family"], row["source_url"]) for row in catalog["sections"]})
    for family, url in sources:
        with connection.get_session() as session:
            rows = session.run("""
            MATCH (d:Document {document_type:$family, source_url:$url})-[:HAS_SECTION]->(s:Section)
            OPTIONAL MATCH (s)<-[:PARENT_OF]-(p:Section)
            OPTIONAL MATCH (previous:Section)-[:NEXT_SIBLING]->(s)
            OPTIONAL MATCH (s)-[:NEXT_SIBLING]->(next:Section)
            RETURN s.id AS section_id, d.source_url AS source_url, d.document_type AS source_family,
              s.section_number AS section_number, s.content_text AS content_text,
              s.title AS section_title, s.level AS level,
              previous.content_text AS previous_content, next.content_text AS next_content,
              previous.title AS previous_title, previous.level AS previous_level,
              next.title AS next_title, next.level AS next_level,
              p.section_number AS parent_number, p.content_text AS parent_content
            """, family=family, url=url)
            for record in rows:
                row = dict(record)
                for side in ["previous", "next", "parent"]:
                    text = " ".join((row.pop(side + "_content") or "").split())
                    row[side + "_content_hash"] = hashlib.sha256(text.encode()).hexdigest() if text else None
                graph.append(row)
    normalizer = EvidenceNormalizer(catalog["sections"], graph)
    missing = sorted(set(normalizer.reference) - normalizer.canonical_to_raw.keys())
    preparation.write_receipt("candidate-identity-mapping.json", {
        "catalogHash": catalog["catalogHash"], "mappingHash": normalizer.mapping_hash,
        "expectedIdentities": len(normalizer.reference), "mappedIdentities": len(normalizer.canonical_to_raw),
        "missingIdentities": missing, "sourceIdentitiesRead": len(sources), "mapping": normalizer.mappings,
        "usableAsQualificationEvidence": False, "evaluationsRun": False,
    })

    from pipeline.embeddings.plan_graph import iter_sections
    from pipeline.embeddings.inspection import measure_embedding_plan
    volume = measure_embedding_plan(iter_sections())
    preparation.write_receipt("embedding-volume.json", {
        **volume, "sourceSnapshotHash": inputs["sourceSnapshotHash"],
        "catalogSectionsHash": stable_hash(catalog["sections"]),
        "graphBuildImplementationRevision": inputs["graphBuildImplementationRevision"],
        "graphDumpSha256": inputs["graphDumpSha256"],
    })
    preparation.write_receipt("oversized-embedding-inputs.json", {
        "inputs": [], "count": 0, "tokenizerCalled": False,
        "embeddingLimitValidated": False, "bytePolicyValidated": True,
        "embeddingsGenerated": False,
    })
    from pipeline.parse_provenance import reconcile_parse_orphans
    provenance = reconcile_parse_orphans(Path("/data"))
    with connection.get_session() as session:
        for item in provenance["orphans"]:
            if item["disposition"] == "verified_duplicate_excluded":
                row = session.run("""
                MATCH (d:Document {document_type:$family, source_url:$url})
                RETURN count(d) AS documents
                """, family=item["sourceFamily"], url=item["sourceUrl"]).single()
                item["canonicalGraphDocuments"] = row["documents"]
                if row["documents"] != 1:
                    raise ValueError("Duplicate disposition lacks exactly one canonical graph document")
    preparation.write_receipt("parse-provenance-reconciliation.json", provenance)
    if check_snapshot() != before:
        raise ValueError("Corpus changed during inspection")
    preparation.write_receipt("inspection-completion.json", {
        "completeCorpusSnapshotVerified": True, "sourceSnapshotHash": inputs["sourceSnapshotHash"],
        "bytePolicyPassed": volume["oversizedPlannedInputs"] == 0,
        "losslessPlanSections": volume["losslessPlanSections"],
        "whitespaceOnlyNovelBodyInputs": volume["whitespaceOnlyNovelBodyInputs"],
        "blankInputRepresentationReviewRequired": volume["whitespaceOnlyNovelBodyInputs"] > 0,
        "catalogIdentitiesMapped": len(normalizer.canonical_to_raw),
        "catalogIdentitiesExpected": len(normalizer.reference),
        "provenanceDispositions": {"verifiedDuplicates": provenance["verifiedDuplicates"], "unresolved": provenance["unresolved"]},
        "blockedNetworkRequests": preparation.BLOCKED_REQUESTS,
        "embeddingsGenerated": False, "paidEvaluations": "NOT_RUN", "qualification": "NOT_ASSESSED",
        "promotable": False,
    })
    connection.close_driver()


if __name__ == "__main__":
    main()
