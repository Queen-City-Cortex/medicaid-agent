#!/usr/bin/env python3
"""Build and inspect an empty, isolated, non-promotable fee-only graph."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
from urllib.parse import urlsplit
import importlib.util

spec = importlib.util.spec_from_file_location("compaction", Path(__file__).with_name("compact-fee-xlsx.py"))
compaction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compaction)

ALLOWED_ENV = {"PATH", "HOME", "HOSTNAME", "LANG", "LC_CTYPE", "PWD", "PYTHONUNBUFFERED",
               "NODE_VERSION", "YARN_VERSION", "PYTHONDONTWRITEBYTECODE", "UV_PROJECT_ENVIRONMENT",
               "CORPUS_DATA_ROOT", "NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", "NEO4J_DATABASE", "EMBEDDING_TOKENIZER_DIR"}
TARGETS = {"baseline": "fee-compaction-baseline", "candidate": "fee-compaction-candidate"}


def guard(env, mounts, variant):
    target = urlsplit(env.get("NEO4J_URI", ""))
    if target.scheme != "bolt" or target.hostname != TARGETS[variant] or target.port != 7687:
        raise ValueError("Only the dedicated variant graph is allowed")
    if set(env) - ALLOWED_ENV or env.get("CORPUS_DATA_ROOT") != "/data" or env.get("EMBEDDING_TOKENIZER_DIR") != "/tokenizers" or env.get("NEO4J_DATABASE", "neo4j") != "neo4j":
        raise ValueError("Unexpected diagnostic environment")
    points = {row[1]: row[3].split(",") for row in mounts}
    for root in ("/data", "/archive", "/tokenizers", "/inventory.json", "/staging-summary.json", "/native-proofs.json"):
        if "ro" not in points.get(root, []) or any("ro" not in flags for point, flags in points.items() if point.startswith(root + "/")):
            raise ValueError("Diagnostic inputs must be mounted read-only")
    return target.hostname


def validate_tree(root, variant, inventory, summary, inventory_path, summary_path, proof_path):
    manifest = json.loads((root / "variant-manifest.json").read_text())
    if manifest["variant"] != variant or manifest["promotable"] or manifest["qualification"] != "NOT_ASSESSED":
        raise ValueError("Wrong diagnostic variant")
    for key, path in (("inventory_sha256", inventory_path), ("proofs_sha256", proof_path), ("staging_summary_sha256", summary_path)):
        if manifest[key] != compaction.digest(path):
            raise ValueError("Graph input seal does not match completed proof")
    if manifest["proofs_sha256"] != summary["proofs_sha256"] or manifest["registry_sha256"] != inventory["registry_sha256"] or compaction.digest(root / "crawler/crawler.db") != inventory["registry_sha256"]:
        raise ValueError("Registry/proof mismatch")
    selected = {item["artifact"] for item in inventory["selected"]}
    actual = {p.name for p in (root / "pipeline/parsed/fee-schedules").glob("*.json") if not p.name.endswith(".meta.json")}
    required = {"pipeline/parsed/fee-schedules/" + str(Path(name).with_suffix(suffix)) for name in selected for suffix in (".json", ".md", ".meta.json")}
    if actual != selected or set(manifest["artifacts"]) != required:
        raise ValueError("Wrong artifact set")
    original = {item["artifact"]: item for item in inventory["artifacts"]}
    for name, expected in manifest["artifacts"].items():
        path = root / name
        if compaction.digest(path) != expected:
            raise ValueError("Unproven staged artifact")
        if variant == "baseline":
            base = path.name.removesuffix(".meta.json").removesuffix(".md").removesuffix(".json") + ".json"
            suffix = ".meta.json" if path.name.endswith(".meta.json") else path.suffix
            if original[base]["sha256"][suffix] != expected:
                raise ValueError("Baseline differs from original artifact")
    for item in inventory["selected"]:
        source = Path(inventory["original_documents_root"]).parent.parent / item["source"]
        if compaction.digest(source) != item["source_sha256"]:
            raise ValueError("Native source changed after proof")
        if variant == "candidate" and source.suffix.lower() == ".xlsx":
            payload = json.loads((root / "pipeline/parsed/fee-schedules" / item["artifact"]).read_text())
            if payload.get("representation") != inventory["representation"]:
                raise ValueError("Candidate XLSX lacks current representation")


def main(variant):
    target = guard(os.environ, [line.split() for line in Path("/proc/mounts").read_text().splitlines()], variant)
    original_connect, original_ex = socket.socket.connect, socket.socket.connect_ex
    allowed_ips = {row[4][0] for row in socket.getaddrinfo(target, 7687)}
    compaction.offline()
    def check(address):
        if not isinstance(address, tuple) or address[0] not in allowed_ips or address[1] != 7687:
            raise RuntimeError("Only the isolated diagnostic Bolt socket is allowed")
    def connect(sock, address):
        check(address)
        return original_connect(sock, address)
    def connect_ex(sock, address):
        check(address)
        return original_ex(sock, address)
    socket.socket.connect, socket.socket.connect_ex = connect, connect_ex
    inventory = json.loads(Path("/inventory.json").read_text())
    summary = json.loads(Path("/staging-summary.json").read_text())
    if summary["qualification"] != "NOT_ASSESSED" or summary["promotable"] or summary["inventory_sha256"] != compaction.digest(Path("/inventory.json")):
        raise ValueError("Complete sealed staging proof required")
    validate_tree(Path("/data"), variant, inventory, summary, Path("/inventory.json"), Path("/staging-summary.json"), Path("/native-proofs.json"))
    documents_root = Path(inventory["original_documents_root"])
    archive_root = str(documents_root.parent.parent)
    mounts = {row[1]: row[3].split(",") for row in [line.split() for line in Path("/proc/mounts").read_text().splitlines()]}
    if "ro" not in mounts.get(archive_root, []) or any("ro" not in flags for point,flags in mounts.items() if point.startswith(archive_root + "/")) or not documents_root.samefile(Path("/archive/crawler/documents")):
        raise ValueError("Original documents must be the same read-only archive")
    from pipeline.graph import connection, loader
    from pipeline import config
    # Historical sidecars name the archived documents. The same archive is
    # mounted at its original absolute path and /archive, both read-only.
    loader.CRAWLER_DATA_DIR = Path(inventory["original_documents_root"])
    from neo4j import GraphDatabase
    connection._driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD), fetch_size=1)
    from pipeline.embeddings.tokenizer import local_tokenizer, TOKENIZER_SHA256
    if config.EMBEDDING_MODEL != "voyage-4" or config.EMBEDDING_DIMENSIONS != 1024:
        raise ValueError("Diagnostic configuration differs from reviewed planner")
    local_tokenizer(config.EMBEDDING_MODEL)  # Require the verified local asset before graph writes.
    with connection.get_session() as session:
        if session.run("MATCH (n) RETURN count(n) AS count").single()["count"]:
            raise ValueError("Diagnostic graph must initially be empty")
    stats = loader.load_all("fee_schedule", reset=False)
    if stats["errors"] or stats["skipped"] or stats["loaded"] != summary["eligible_documents"]:
        raise ValueError(f"Incomplete fee-only graph: {stats}")
    identity = {}
    with connection.get_session() as session:
        for label in ("Document", "Section"):
            fields = "n.id AS id,n.title AS title,n.source_type AS source_type,n.source_url AS source_url" if label == "Document" else "n.id AS id,n.title AS title,n.section_number AS section_number,n.level AS level,n.has_tables AS has_tables"
            identity[label] = [dict(row) for row in session.run(f"MATCH (n:{label}) RETURN {fields} ORDER BY n.id")]
        identity["relationships"] = [dict(row) for row in session.run("MATCH (a)-[r]->(b) WHERE a:Document OR a:Section RETURN a.id AS source,type(r) AS kind,b.id AS target ORDER BY source,kind,target")]
        if session.run("MATCH (n) WHERE n.embedding IS NOT NULL OR n:Chunk RETURN count(n) AS count").single()["count"]:
            raise ValueError("Diagnostic graph must have no vectors or chunks")
        session.run("CREATE (:FeeCompactionDiagnostic {variant:$variant,promotable:false,qualification:'NOT_ASSESSED'})", variant=variant).consume()
    from pipeline.embeddings.generator import iter_section_contexts
    from pipeline.embeddings.planner import plan_inputs, PLAN_VERSION
    totals = {"sections": 0, "embeddingInputs": 0, "inputCharacters": 0, "inputUtf8Bytes": 0, "localTokens": 0}
    body_bytes, body_chars = 0, 0
    plans = hashlib.sha256()
    for sid, heading, body, _epoch in iter_section_contexts():
        body_bytes += len(body.encode())
        body_chars += len(body)
        totals["sections"] += 1
        for part in plan_inputs(heading, body, config.EMBEDDING_MODEL):
            totals["embeddingInputs"] += 1
            totals["inputCharacters"] += len(part.text)
            totals["inputUtf8Bytes"] += len(part.text.encode())
            totals["localTokens"] += part.tokens
            plans.update((sid + ":" + str(part.body_start) + ":" + hashlib.sha256(part.text.encode()).hexdigest() + "\n").encode())
    compaction.write(Path("/output") / (variant + "-identity.json"), identity)
    compaction.write(Path("/output") / (variant + "-metrics.json"), {**totals, "bodyUtf8Bytes": body_bytes, "bodyCharacters": body_chars,
                     "loadStats": stats, "tokenizerSha256": TOKENIZER_SHA256, "planVersion": PLAN_VERSION,
                     "model": config.EMBEDDING_MODEL, "dimensions": config.EMBEDDING_DIMENSIONS, "plansSha256": plans.hexdigest(), "qualification": "NOT_ASSESSED", "promotable": False,
                     "providersCalled": False, "embeddingsGenerated": False, "billingUsageMeasured": False,
                     "inventorySha256": compaction.digest(Path("/inventory.json")), "inspectorSha256": compaction.digest(Path(__file__))})
    connection.close_driver()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", required=True, choices=TARGETS)
    main(parser.parse_args().variant)
