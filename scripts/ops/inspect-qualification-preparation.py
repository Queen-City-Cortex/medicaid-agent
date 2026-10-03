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
    from pipeline.graph import connection
    connection._driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD), fetch_size=8)
    inputs = json.loads(Path("/inputs.json").read_text())
    preparation.CONTEXT.update({
        "mode": "read-only-inspection", "implementationRevision": inputs["implementationRevision"],
        "inputsSha256": preparation.digest(Path("/inputs.json")),
        "inspectorSha256": preparation.digest(Path(__file__)),
    })
    with connection.get_session() as session:
        marker = session.run("MATCH (p:QualificationPreparation) RETURN properties(p) AS marker").single()
        if not marker or marker["marker"]["sourceSnapshotHash"] != inputs["sourceSnapshotHash"]:
            raise ValueError("Only the completed matching preparation graph may be inspected")
        preparation.CONTEXT["buildRunId"] = marker["marker"]["runId"]
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

    from pipeline.embeddings.chunker import chunk_text, MAX_CHUNK_CHARS
    totals = {"sections": 0, "embeddingInputs": 0, "inputCharacters": 0, "inputUtf8Bytes": 0,
              "oversizedInputsByRepositoryTokenHeuristic": 0, "maximumInputCharacters": 0}
    oversized = []
    with connection.get_session() as session:
        rows = session.run("""
        MATCH (d:Document)-[:HAS_SECTION]->(s:Section) WHERE s.content_length > 0
        CALL (s) {
          OPTIONAL MATCH (ancestor:Section)-[:PARENT_OF*]->(s)
          RETURN collect(DISTINCT ancestor.title) AS ancestors
        }
        RETURN d.id AS document_id, d.document_type AS source_family, s.id AS section_id,
               d.title AS document_title, s.title AS section_title,
               s.content_length AS content_length, s.content_text AS content, ancestors
        """)
        for row in rows:
            heading = [row["document_title"]] if row["document_title"] else []
            heading.extend(title for title in row["ancestors"] if title)
            if row["section_title"]:
                heading.append(row["section_title"])
            text = " > ".join(heading) + "\n" + (row["content"] or "")
            texts = chunk_text(text) if row["content_length"] >= MAX_CHUNK_CHARS else [text]
            totals["sections"] += 1
            for index, part in enumerate(texts):
                totals["embeddingInputs"] += 1
                totals["inputCharacters"] += len(part)
                totals["inputUtf8Bytes"] += len(part.encode())
                totals["maximumInputCharacters"] = max(totals["maximumInputCharacters"], len(part))
                totals["oversizedInputsByRepositoryTokenHeuristic"] += len(part) // 3 > 32000
                if len(part) // 3 > 32000:
                    oversized.append({"sectionId": row["section_id"], "documentId": row["document_id"],
                                      "sourceFamily": row["source_family"], "inputIndex": index,
                                      "characters": len(part), "utf8Bytes": len(part.encode())})
    preparation.write_receipt("embedding-volume.json", {
        **totals, "estimatedTokensAtThreeCharactersPerToken": totals["inputCharacters"] / 3,
        "tokenizerCalled": False, "embeddingsGenerated": False,
        "scope": "same contextual text and paragraph chunking as embed_all; current preparation graph",
        "sourceSnapshotHash": inputs["sourceSnapshotHash"], "catalogSectionsHash": stable_hash(catalog["sections"]),
    })
    preparation.write_receipt("oversized-embedding-inputs.json", {
        "inputs": oversized, "count": len(oversized), "tokenizerCalled": False,
        "embeddingLimitValidated": False, "heuristic": "characters // 3 > 32000",
        "embeddingsGenerated": False,
    })
    connection.close_driver()


if __name__ == "__main__":
    main()
