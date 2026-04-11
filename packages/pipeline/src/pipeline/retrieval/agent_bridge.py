"""Bridge Python retrieval callers to the canonical TypeScript retrieval CLI."""

import json
import os
import subprocess
import sys

from pipeline.config import AGENT_DIR

RETRIEVAL_CLI_COMMAND = ["npx", "tsx", "src/retrieval-cli.ts"]
RETRIEVAL_CLI_TIMEOUT_SECONDS = int(os.environ.get("RETRIEVAL_CLI_TIMEOUT_SECONDS", "600"))
RETRIEVAL_BATCH_CLI_TIMEOUT_SECONDS = int(os.environ.get("RETRIEVAL_BATCH_CLI_TIMEOUT_SECONDS", "1200"))


def _run_retrieval_cli(payload: dict[str, object], *, timeout_seconds: int) -> dict:
    debug_passthrough = os.environ.get("RETRIEVAL_CLI_DEBUG_PASSTHROUGH") == "1"
    proc = subprocess.run(
        RETRIEVAL_CLI_COMMAND,
        input=json.dumps(payload),
        stdout=subprocess.PIPE,
        stderr=None if debug_passthrough else subprocess.PIPE,
        text=True,
        timeout=timeout_seconds,
        cwd=str(AGENT_DIR),
        env=os.environ.copy(),
    )

    if debug_passthrough and proc.stderr:
        sys.stderr.write(proc.stderr)
        if not proc.stderr.endswith("\n"):
            sys.stderr.write("\n")
        sys.stderr.flush()

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(f"Retrieval CLI exited with code {proc.returncode}: {stderr[:500]}")

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Retrieval CLI returned invalid JSON: {exc.msg}") from exc


def _normalize_results(rows: object) -> list[dict]:
    if not isinstance(rows, list):
        raise RuntimeError("Retrieval CLI response missing results array")

    normalized: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            raise RuntimeError("Retrieval CLI returned a non-object result row")

        normalized.append({
            "section_id": row.get("section_id"),
            "section_number": row.get("section_number"),
            "section_title": row.get("section_title"),
            "doc_title": row.get("doc_title"),
            "document_type": row.get("document_type"),
            "policy_number": row.get("policy_number"),
            "content": row.get("content"),
            "score": row.get("score"),
        })

    return normalized


def search_sections_via_agent_cli(
    query: str,
    top_k: int = 10,
    document_types: list[str] | None = None,
) -> list[dict]:
    """Invoke the TypeScript retrieval CLI and normalize its response."""
    payload: dict[str, object] = {"query": query, "topK": top_k}
    if document_types:
        payload["documentTypes"] = document_types

    response = _run_retrieval_cli(
        payload,
        timeout_seconds=RETRIEVAL_CLI_TIMEOUT_SECONDS,
    )
    return _normalize_results(response.get("results"))


def search_sections_batch_via_agent_cli(
    requests: list[dict],
    *,
    timeout_seconds: int | None = None,
) -> dict[str, list[dict]]:
    """Invoke the TypeScript retrieval CLI once for a batch of retrieval queries."""
    payload_requests: list[dict[str, object]] = []
    for request in requests:
        payload_request: dict[str, object] = {
            "id": request["id"],
            "query": request["query"],
            "topK": request.get("top_k", 10),
        }
        document_types = request.get("document_types")
        if document_types:
            payload_request["documentTypes"] = document_types
        payload_requests.append(payload_request)

    response = _run_retrieval_cli(
        {"requests": payload_requests},
        timeout_seconds=timeout_seconds or RETRIEVAL_BATCH_CLI_TIMEOUT_SECONDS,
    )

    rows = response.get("results_by_request")
    if not isinstance(rows, list):
        raise RuntimeError("Retrieval CLI response missing results_by_request array")

    normalized: dict[str, list[dict]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise RuntimeError("Retrieval CLI returned a non-object batch result row")

        request_id = row.get("id")
        if not isinstance(request_id, str) or not request_id:
            raise RuntimeError("Retrieval CLI batch response missing request id")

        normalized[request_id] = _normalize_results(row.get("results"))

    return normalized
