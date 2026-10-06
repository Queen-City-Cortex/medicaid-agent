#!/usr/bin/env python3
"""Build/audit an offline disposable graph; never qualify or promote it.

Run in the pinned pipeline image, on an internal Docker network, with the
verified corpus mounted read-only at /data and private receipts at /output.
"""

import argparse
from dataclasses import replace
from datetime import datetime, timezone
import errno
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import time
import traceback
import uuid
from urllib.parse import urlsplit
import urllib.request

TARGET = "qualification-preparation-neo4j"
TARGETS = {TARGET, "qualification-cycle-neo4j"}
ALLOWED_ENV = {
    "NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", "NEO4J_DATABASE", "CORPUS_DATA_ROOT",
    "RAYON_NUM_THREADS", "EMBEDDING_TOKENIZER_DIR", "MASTRA_OBSERVABILITY_PATH", "AGENT_MODEL", "VERIFIER_MODEL", "VERIFIER_ENABLED",
    "PATH", "NODE_VERSION", "YARN_VERSION", "PYTHONDONTWRITEBYTECODE",
    "PYTHONUNBUFFERED", "UV_PROJECT_ENVIRONMENT", "HOSTNAME", "HOME", "LANG", "LC_CTYPE", "PWD",
}
CONTEXT = {"runId": str(uuid.uuid4()), "startedAt": datetime.now(timezone.utc).isoformat(),
           "harnessSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "implementationRevision": None}
OUTPUT_ROOT = Path("/output")
BLOCKED_REQUESTS = {"sockets": 0, "http": 0}


def readonly_mount(mounts, root):
    effective = {row[1]: row[3].split(",") for row in mounts}
    return "ro" in effective.get(root, []) and all(
        "ro" in flags for point, flags in effective.items() if point.startswith(root + "/")
    )


def immutable_registry_uri(path):
    """Static read-only snapshots need no SQLite sidecar/locking writes."""
    for suffix in ("-wal", "-journal"):
        pending = Path(str(path) + suffix)
        if pending.exists() and pending.stat().st_size:
            raise ValueError("Checkpoint the registry before mounting it read-only")
    return f"file:{path}?mode=ro&immutable=1"


def validate_environment(env, mounts):
    target = urlsplit(env.get("NEO4J_URI", ""))
    if target.scheme != "bolt" or target.hostname not in TARGETS or target.port != 7687:
        raise ValueError("Only the named disposable preparation graph is allowed")
    if env.get("CORPUS_DATA_ROOT") != "/data":
        raise ValueError("CORPUS_DATA_ROOT must be /data")
    if not readonly_mount(mounts, "/data"):
        raise ValueError("Corpus must be mounted read-only")
    if set(env) - ALLOWED_ENV:
        raise ValueError("Only allowlisted preparation environment variables are allowed")
    if env.get("NEO4J_DATABASE", "neo4j") != "neo4j":
        raise ValueError("Only the neo4j candidate database is allowed")


def deny_network(target=None):
    target = target or urlsplit(os.environ.get("NEO4J_URI", "bolt://" + TARGET + ":7687")).hostname
    if target not in TARGETS:
        raise ValueError("Unknown disposable target")
    allowed_ips = {row[4][0] for row in socket.getaddrinfo(target, 7687)}
    original = socket.socket.connect
    original_ex = socket.socket.connect_ex

    def check(address):
        if not isinstance(address, tuple) or address[0] not in allowed_ips or address[1] != 7687:
            BLOCKED_REQUESTS["sockets"] += 1
            raise RuntimeError("Preparation blocked a non-candidate socket")

    def connect(sock, address):
        check(address)
        return original(sock, address)

    def connect_ex(sock, address):
        check(address)
        return original_ex(sock, address)

    def denied(*_args, **_kwargs):
        BLOCKED_REQUESTS["http"] += 1
        raise RuntimeError("Preparation forbids HTTP requests")

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    urllib.request.urlopen = denied


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def output_directory(base, audit_only):
    if not audit_only:
        return base
    directory = base / ("audit-" + CONTEXT["runId"])
    directory.mkdir(mode=0o700, exist_ok=False)
    return directory


def write_receipt(name, value):
    path = OUTPUT_ROOT / name
    if path.exists():
        previous = json.loads(path.read_text())
        if previous.get("preparationContext", {}).get("runId") != CONTEXT["runId"]:
            raise FileExistsError("Refusing to replace another preparation run's receipt")
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({**value, "preparationContext": CONTEXT}, indent=2, sort_keys=True) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)


def run(audit_only=False):
    global OUTPUT_ROOT
    OUTPUT_ROOT = output_directory(Path("/output"), audit_only)
    mounts = [line.split() for line in Path("/proc/mounts").read_text().splitlines()]
    validate_environment(os.environ, mounts)
    CONTEXT["mode"] = "audit-only" if audit_only else "build"
    if not readonly_mount(mounts, "/inputs.json"):
        raise ValueError("Pinned input manifest must be mounted read-only")
    expected = json.loads(Path("/inputs.json").read_text())
    CONTEXT["implementationRevision"] = expected["implementationRevision"]
    CONTEXT["inputsSha256"] = digest(Path("/inputs.json"))
    if not audit_only and any((OUTPUT_ROOT / name).exists() for name in
                              ("completion.json", "failure.json", "graph-audit.json", "build-stages.json")):
        raise ValueError("A build requires a fresh receipt directory")
    documents_root = Path(expected["originalDocumentsRoot"])
    if not readonly_mount(mounts, str(documents_root.parent.parent)):
        raise ValueError("Original sidecar layout must also be mounted read-only")
    if not documents_root.samefile(Path("/data/crawler/documents")):
        raise ValueError("Sidecar alias is not the same corpus tree")
    for root in [Path("/data"), documents_root.parent.parent]:
        probe = root / (".preparation-probe-" + CONTEXT["runId"])
        try:
            probe.touch(exist_ok=False)
        except OSError as exc:
            if exc.errno != errno.EROFS:
                raise
        else:
            probe.unlink()
            raise ValueError("Corpus write probe unexpectedly succeeded")
    # The image must not hydrate credentials from an application .env file.
    import dotenv
    dotenv.load_dotenv = lambda *_args, **_kwargs: False
    deny_network()
    from neo4j import GraphDatabase
    from pipeline import config
    # Keep unchanged absolute sidecar paths meaningful without rewriting them.
    config.CRAWLER_DATA_DIR = documents_root
    registry_uri = immutable_registry_uri(config.CRAWLER_DB_PATH)
    original_connect = sqlite3.connect

    def readonly_connect(database, *args, **kwargs):
        database_path = str(database).removeprefix("file:").split("?", 1)[0]
        if database_path == str(config.CRAWLER_DB_PATH):
            database = registry_uri
            kwargs["uri"] = True
        return original_connect(database, *args, **kwargs)

    sqlite3.connect = readonly_connect
    from pipeline.graph import connection
    connection._driver = GraphDatabase.driver(
        config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD), fetch_size=8,
    )
    with connection.get_session() as session:
        nodes = session.run("MATCH (n) RETURN count(n) AS count").single()["count"]
        database = session.run("CALL db.info() YIELD id, name RETURN id, name").single().data()
        marker = session.run("MATCH (p:QualificationPreparation) RETURN properties(p) AS marker").single()
    write_receipt("graph-target.json", {"nodeCountBefore": nodes, "database": database})
    if not audit_only and nodes:
        raise ValueError("Build requires an empty disposable graph; use a fresh volume")
    from pipeline.freshness import build_answer_ready_snapshot
    from pipeline.source_lifecycle import stable_hash
    from pipeline.answer_scope import implementation_hash, scope_policy, approved_scope_map
    snapshot = build_answer_ready_snapshot()
    if "sha256:" + snapshot["snapshot_hash"] != expected["sourceSnapshotHash"]:
        raise ValueError("Complete source snapshot differs from the restored scoped archive")
    if implementation_hash() != expected["scopeImplementationHash"]:
        raise ValueError("Scope implementation differs from the approved rehearsal")
    approvals = approved_scope_map(config.CRAWLER_DB_PATH)
    if len(approvals) != len(scope_policy()["limitations"]):
        raise ValueError("Expected four valid retained scope approvals")
    if audit_only and (not marker or marker["marker"].get("sourceSnapshotHash") != expected["sourceSnapshotHash"]
                       or marker["marker"].get("harnessSha256") != CONTEXT["harnessSha256"]):
        raise ValueError("Audit target does not match this prepared corpus and harness")

    hashes = expected["federalCacheHashes"]
    for name, checksum in hashes.items():
        if digest(config.ECFR_CACHE_DIR / name) != checksum:
            raise ValueError("Federal cache differs from the original verified archive")

    def cached(name):
        if name not in hashes:
            raise ValueError("Unattested federal input")
        return (config.ECFR_CACHE_DIR / name).read_text()

    from pipeline.federal import loader, ssa_client
    loader.fetch_part_xml = lambda title, part, refresh=False: cached(f"title-{title}-part-{part}.xml")

    def cached_statute(title, refresh=False):
        html = cached(f"usc-title42-subchapter{title}.html")
        ssa_client.validate_usc_subchapter(html, title)
        return html

    ssa_client.fetch_usc_subchapter = cached_statute
    from pipeline.graph.corpus_writer import graph_writer
    original_upsert = graph_writer.upsert_document_bundle
    adapter_counts = {"federalCheckTimesCleared": 0}

    def preparation_upsert(bundle):
        document = bundle.document
        checked_at = document.source_checked_at
        if document.document_type in {"federal_regulation", "federal_statute"}:
            checked_at = None
            if document.source_checked_at is not None:
                adapter_counts["federalCheckTimesCleared"] += 1
        return original_upsert(replace(bundle, document=replace(document, source_checked_at=checked_at)))

    graph_writer.upsert_document_bundle = preparation_upsert
    write_receipt("input-verification.json", {
        "sourceSnapshotHash": "sha256:" + snapshot["snapshot_hash"], "scopePolicyHash": stable_hash(scope_policy()),
        "scopeImplementationHash": implementation_hash(), "validScopeApprovals": len(approvals),
        "verifiedFederalCacheFiles": len(hashes), "federalInputsFresh": False,
        "corpusReadOnly": True, "network": "candidate-only", "providerCredentials": False,
        "sidecarLayout": "original read-only mount alias; no artifact rewriting",
        "guardAssertions": ["read-only mount and EROFS write probe", "environment allowlist", "candidate-only socket guard"],
        "preparationAdapter": "Archived federal inputs are not marked checked now",
    })

    from pipeline.eval.dataset import load_dataset
    from pipeline.eval.identity import build_catalog
    catalog = build_catalog(load_dataset())
    if catalog["catalogHash"] != expected["catalogHash"]:
        raise ValueError("Canonical evidence catalog changed")
    write_receipt("evidence-identity-catalog.json", catalog)
    os.environ["EVAL_IDENTITY_CATALOG"] = str(OUTPUT_ROOT / "evidence-identity-catalog.json")
    # The pinned image has no git checkout; its sealed revision is its identity.
    os.environ["RAILWAY_GIT_COMMIT_SHA"] = expected["implementationRevision"]
    from pipeline.evaluation_evidence import evaluation_fingerprint
    write_receipt("evaluation-fingerprint.json", {"fingerprint": evaluation_fingerprint(), "evaluationsRun": False})

    stages = {}

    def stage(name, action):
        started = time.monotonic()
        try:
            result = action()
            if isinstance(result, dict) and (result.get("errors", 0) or result.get("timed_out", 0)):
                raise RuntimeError(f"{name} returned errors: {result['errors']}")
            stages[name] = {"status": "PASS", "result": result}
        except Exception as exc:
            stages[name] = {"status": "FAIL", "errorType": type(exc).__name__, "error": str(exc)}
            raise
        finally:
            stages[name]["elapsedSeconds"] = round(time.monotonic() - started, 3)
            write_receipt("build-stages.json", stages)

    if not audit_only:
        from pipeline.graph.loader import load_all
        from pipeline.embeddings.indexer import ensure_vector_index
        from pipeline.graph.schema_version import write_schema_version
        from pipeline.references import resolver
        resolver.PARSED_DATA_DIR = (OUTPUT_ROOT / "parsed")
        from pipeline.references.amendments import detect_amendments
        from pipeline.concepts.seed import seed_concepts
        from pipeline.concepts.linker import link_concepts
        stage("allRetainedFamilies", lambda: load_all(reset=True))
        stage("vectorIndexSchemaOnly", lambda: (ensure_vector_index(), {"created": True})[-1])
        stage("cfr", lambda: loader.load_all_cfr(refresh=False))
        stage("ssa", lambda: loader.load_ssa(refresh=False))
        stage("references", lambda: resolver.extract_and_resolve_all(llm_assist=False))
        stage("amendments", detect_amendments)
        stage("concepts", lambda: {"seeded": seed_concepts(), **link_concepts()})
        stage("schemaVersion", write_schema_version)
        with connection.get_session() as session:
            session.run("CREATE (p:QualificationPreparation) SET p = $properties", properties={
                "sourceSnapshotHash": expected["sourceSnapshotHash"], "harnessSha256": CONTEXT["harnessSha256"],
                "runId": CONTEXT["runId"], "promotable": False,
            }).consume()
        write_receipt("preparation-adapter.json", {**adapter_counts, "productionLoaderFix": "implemented locally; not deployed",
                                                    "qualificationRequiresFreshFederalInputsAndRebuild": True})

    from pipeline import audit
    audit.AUDIT_DATA_DIR = OUTPUT_ROOT
    report = audit.run_corpus_audit(
        json_output_path=OUTPUT_ROOT / "corpus-audit.json",
        markdown_output_path=OUTPUT_ROOT / "corpus-audit.md",
    )["report"]
    from pipeline.release import inspect_release_graph, build_release_audit_results
    metrics = inspect_release_graph(config.EMBEDDING_DIMENSIONS)
    gates = build_release_audit_results(report, metrics)
    structural_passed = not (report.get("graph_error") or gates["duplicateIdentities"]
                             or gates["missingAnswerReadyLoads"] or gates["missingRequiredSourceFamilies"])
    write_receipt("audit-graph.json" if audit_only else "graph-audit.json", {
        "metrics": metrics, "gates": gates, "structuralCompleteness": "PASS" if structural_passed else "FAIL",
        "federalInputsFresh": False, "staleFederalSources": expected["federalCacheOriginalTimes"],
        "graphBuiltWithPreparationAdapter": True, "usableAsQualificationEvidence": False,
        "qualification": "NOT_ASSESSED", "readiness": "NO_GO", "promotable": False,
        "paidEvaluations": "NOT_RUN", "embeddings": "NOT_RUN",
    })
    after = build_answer_ready_snapshot()
    if "sha256:" + after["snapshot_hash"] != "sha256:" + snapshot["snapshot_hash"]:
        raise ValueError("Read-only corpus changed during preparation")
    write_receipt("audit-completion.json" if audit_only else "completion.json", {
        "harnessRanToEnd": True, "buildExecuted": not audit_only,
        "auditedBuildRunId": marker["marker"].get("runId") if audit_only else None, "structuralCompleteness": "PASS" if structural_passed else "FAIL",
        "sourceSnapshotHash": "sha256:" + after["snapshot_hash"],
        "corpusChanged": False, "paidQualificationCalls": "prevented by network and credential guards", "promotable": False,
        "federalInputsFresh": False, "blockedRequests": BLOCKED_REQUESTS,
        "graphBuiltWithPreparationAdapter": True, "usableAsQualificationEvidence": False,
        "qualification": "NOT_ASSESSED", "readiness": "NO_GO",
    })
    connection.close_driver()
    if not structural_passed:
        raise ValueError("Structural audit failed; retain the incomplete graph evidence")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()
    try:
        run(args.audit_only)
    except Exception as error:
        write_receipt("failure.json", {"errorType": type(error).__name__, "error": str(error), "traceback": traceback.format_exc(), "promotable": False})
        raise
