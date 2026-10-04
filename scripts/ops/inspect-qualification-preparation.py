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
    from pipeline.eval.identity import load_normalizer
    from pipeline.source_lifecycle import stable_hash
    os.environ["EVAL_IDENTITY_CATALOG"] = "/catalog.json"
    normalizer = load_normalizer()
    if normalizer.catalog_hash != inputs["catalogHash"]:
        raise ValueError("Catalog section content differs from sealed identity hash")
    missing = sorted(set(normalizer.reference) - normalizer.canonical_to_raw.keys())
    preparation.write_receipt("candidate-identity-mapping.json", {
        "catalogHash": catalog["catalogHash"], "mappingHash": normalizer.mapping_hash,
        "expectedIdentities": len(normalizer.reference), "mappedIdentities": len(normalizer.canonical_to_raw),
        "missingIdentities": missing, "readerScope": "whole-graph", "mapping": normalizer.mappings,
        "usableAsQualificationEvidence": False, "evaluationsRun": False,
    })

    from pipeline.embeddings.generator import iter_section_contexts
    from pipeline.embeddings.planner import plan_inputs, plan_hash, PLAN_VERSION
    from pipeline.embeddings.tokenizer import TOKENIZER_SHA256
    totals = {"sections": 0, "embeddingInputs": 0, "inputCharacters": 0,
              "inputUtf8Bytes": 0, "localTokens": 0, "maximumInputCharacters": 0,
              "maximumInputTokens": 0}
    plans = hashlib.sha256()
    for sid, heading, body, _epoch in iter_section_contexts():
        planned = list(plan_inputs(heading, body, "voyage-4"))
        plans.update((sid + ":" + plan_hash(planned, "voyage-4", 1024)).encode())
        totals["sections"] += 1
        for part in planned:
            totals["embeddingInputs"] += 1
            totals["inputCharacters"] += len(part.text)
            totals["inputUtf8Bytes"] += len(part.text.encode())
            totals["localTokens"] += part.tokens
            totals["maximumInputCharacters"] = max(totals["maximumInputCharacters"], len(part.text))
            totals["maximumInputTokens"] = max(totals["maximumInputTokens"], part.tokens)
    preparation.write_receipt("embedding-volume.json", {
        **totals, "tokenizerCalled": True, "tokenizerSha256": TOKENIZER_SHA256,
        "planVersion": PLAN_VERSION, "wholeGraphPlanHash": plans.hexdigest(),
        "embeddingsGenerated": False, "billingUsageMeasured": False,
        "scope": "shared contextual reader and planner; entire restored preparation graph",
        "sourceSnapshotHash": inputs["sourceSnapshotHash"], "catalogSectionsHash": stable_hash(catalog["sections"]),
    })
    connection.close_driver()


if __name__ == "__main__":
    main()
