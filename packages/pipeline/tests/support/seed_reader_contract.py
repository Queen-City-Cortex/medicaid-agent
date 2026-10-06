"""Load the committed Docling fixture into a graph through the real loader,
under a test-only identity, so the agent's retrieval tools can be tested
against what the pipeline writes rather than a hand-written CREATE.

    .venv/bin/python tests/support/seed_reader_contract.py            # load
    .venv/bin/python tests/support/seed_reader_contract.py --cleanup  # delete

Run from ``packages/pipeline``. Prints one JSON line describing the loaded
document. The agent's ``tests/integration/pipeline-writer.integration.test.ts``
spawns both modes. Nothing here touches a crawler registry or the network:
``CORPUS_DATA_ROOT`` is pointed at an empty directory before ``pipeline`` is
imported, and the load context the registry would normally supply is given
here with identifiers no real document can carry.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/1a-14_surgery-for-ambiguous-genitalia.json"
SOURCE_TYPE = "clinical_policy"
ID_PREFIX = "test:reader-contract:"
DOCUMENT_ID = f"{ID_PREFIX}doc:1a-14"
POLICY_NUMBER = "TEST-RC-1A-14"
SOURCE_HOST = "integration.test"
SOURCE_URL = f"https://{SOURCE_HOST}/reader-contract/1a-14.pdf"
LOCAL_PATH = "clinical-policies/reader-contract-1a-14.pdf"
TITLE = "Reader contract fixture: 1A-14 Surgery for Ambiguous Genitalia"


def guard() -> None:
    """Refuse to touch a graph under anything but the test-only identity."""
    from pipeline.graph import loader

    if not DOCUMENT_ID.startswith(ID_PREFIX):
        raise SystemExit(f"document id {DOCUMENT_ID!r} lacks the test prefix {ID_PREFIX!r}")
    if not POLICY_NUMBER.startswith("TEST-"):
        raise SystemExit(f"policy number {POLICY_NUMBER!r} is not test-only")
    if not SOURCE_URL.startswith(f"https://{SOURCE_HOST}/"):
        raise SystemExit(f"source url {SOURCE_URL!r} is not on {SOURCE_HOST}")
    if loader.CRAWLER_DB_PATH.exists():
        raise SystemExit(f"a crawler registry exists at {loader.CRAWLER_DB_PATH}; the seed must not read one")


def load_context() -> dict:
    """What ``_resolve_document_load_context`` reads from the parse sidecar and
    the registry, with the identity fields replaced by test-only values. The
    eligibility checks it makes all read the registry, which this seed has
    none of, so the context is marked eligible."""
    pages = json.loads(FIXTURE.read_text()).get("pages") or {}
    return {
        "meta": {
            "source_file": LOCAL_PATH,
            "source_format": "pdf",
            "page_count": len(pages),
            "parse_status": "parsed",
            "answer_ready": True,
        },
        "source_file_path": Path(LOCAL_PATH),
        "crawler_meta": {
            "title": TITLE,
            "policy_number": POLICY_NUMBER,
            "category": "Surgery",
            "source_url": SOURCE_URL,
            "local_path": LOCAL_PATH,
            "status": "downloaded",
            "last_checked_at": "2026-10-06 00:00:00",
            "last_changed_at": "2026-10-06 00:00:00",
        },
        "document_id": DOCUMENT_ID,
        "exclusion_reason": None,
    }


def seed() -> dict:
    from pipeline.corpus_manifest import get_source_family
    from pipeline.graph.connection import get_session
    from pipeline.graph.loader import load_document
    from pipeline.graph.schema import ensure_schema

    guard()
    # The same DDL every pipeline load runs; the full-text index must be online
    # before the reader's keyword search can see the sections.
    ensure_schema()
    with get_session() as session:
        session.run("CALL db.awaitIndexes()")
    result = load_document(FIXTURE, SOURCE_TYPE, load_context=load_context())
    if result.get("skipped") or not result.get("sections"):
        raise SystemExit(f"loader did not write the fixture: {result}")
    family = get_source_family(SOURCE_TYPE)
    return {
        "document_id": DOCUMENT_ID,
        "section_count": result["sections"],
        "document_type": SOURCE_TYPE,
        "policy_number": POLICY_NUMBER,
        "title": TITLE,
        "source_url": SOURCE_URL,
        "authority_tier": family.authority_tier,
        "answer_role": family.answer_role,
    }


def cleanup() -> dict:
    from pipeline.graph import corpus_writer
    from pipeline.graph.connection import get_session

    guard()
    # The writer's own delete (document, its sections and chunks), then a sweep
    # of anything else carrying the test identity. Section ids are
    # ``sec:<document id>:...``, so the sweep names both shapes and no other.
    corpus_writer.graph_writer.delete_document(DOCUMENT_ID)
    with get_session() as session:
        deleted = session.run(
            "MATCH (n) WHERE n.id = $id OR n.id STARTS WITH $section_prefix "
            "DETACH DELETE n RETURN count(n) AS count",
            {"id": DOCUMENT_ID, "section_prefix": f"sec:{DOCUMENT_ID}:"},
        ).single()["count"]
    return {"document_id": DOCUMENT_ID, "swept": deleted}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cleanup", action="store_true", help="delete the seeded document instead of loading it")
    args = parser.parse_args(argv)

    # Before any pipeline import: pipeline.config resolves the registry path
    # from this variable at import, and the loader opens that registry when the
    # file exists. An empty root means no registry and no listings.
    os.environ["CORPUS_DATA_ROOT"] = tempfile.mkdtemp(prefix="reader-contract-")
    from pipeline.graph.connection import close_driver

    try:
        print(json.dumps(cleanup() if args.cleanup else seed()), flush=True)
    finally:
        close_driver()
    return 0


if __name__ == "__main__":
    sys.exit(main())
