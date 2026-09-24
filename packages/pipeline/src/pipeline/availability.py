"""Apply captured availability observations exactly once, without downloading."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from pipeline.corpus_manifest import load_corpus_manifest
from pipeline.retirement import canonical_url
from pipeline.source_lifecycle import stable_hash, verify_capture


def _time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return (
        parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    )


def apply_availability(
    root: Path, db: sqlite3.Connection, row: dict, evidence: dict, *, apply: bool
) -> dict:
    """Caller owns the corpus lock and commits this update with the audit journal."""
    if evidence.get("schema_version") != 1 or not evidence.get("observations"):
        raise ValueError("Availability requires versioned captured observations")
    family = next(
        f
        for f in load_corpus_manifest().source_families
        if f.source_type == row["source_type"]
    )
    observations = []
    for item in evidence["observations"]:
        audit_path = verify_capture(root, item["audit"])
        audit = json.loads(audit_path.read_text())
        if audit.get("schema_version") != 1:
            raise ValueError("Incompatible availability audit")
        capture = audit.get("captures", {}).get(row["source_url"])
        if not capture or canonical_url(capture["url"]) != row["source_url"]:
            raise ValueError("Availability capture must identify this exact source")
        if (
            capture.get("error")
            or capture.get("blocked_by")
            or type(capture.get("status_code")) is not int
            or not 200 <= capture["status_code"] <= 599
        ):
            raise ValueError(
                "An unvisited or failed request is not an HTTP observation"
            )
        for url in [
            capture["url"],
            capture.get("final_url", capture["url"]),
            *[r["location"] for r in capture.get("redirects", [])],
        ]:
            if urlsplit(canonical_url(url)).hostname not in family.allowed_domains:
                raise ValueError("Availability observation has an unapproved redirect")
        checked = _time(capture["checked_at"])
        if checked > datetime.now(UTC):
            raise ValueError("Availability observation is in the future")
        response = verify_capture(audit_path.parent, capture)
        # A copied cached manifest cannot create a new observation: identity
        # depends on URL and actual request timestamp, never directory/action ID.
        identity = {"source_url": row["source_url"], "checked_at": checked.isoformat()}
        observations.append(
            {
                **identity,
                "observation_id": stable_hash(identity),
                "status_code": capture["status_code"],
                "final_url": capture.get("final_url", capture["url"]),
                "redirects": capture.get("redirects", []),
                "response_hash": capture["sha256"],
                "response_path": str(response.relative_to(root.resolve())),
                "audit": item["audit"],
            }
        )
    observations.sort(key=lambda o: o["checked_at"])
    if len({o["observation_id"] for o in observations}) != len(observations):
        raise ValueError("Duplicate availability observation")
    seen = {}
    if db.execute(
        "SELECT 1 FROM sqlite_master WHERE name='source_audit_actions'"
    ).fetchone():
        for previous in db.execute(
            "SELECT result_json FROM source_audit_actions WHERE source_url=? AND disposition='availability'",
            (row["source_url"],),
        ):
            for observation in json.loads(previous[0])["observations"]:
                seen[observation["observation_id"]] = observation
    count = int(row["consecutive_not_found"])
    latest = _time(row["last_checked_at"]) if row.get("last_checked_at") else None
    applied = 0
    for observation in observations:
        previous = seen.get(observation["observation_id"])
        if previous:
            # Manifest copies may have different paths, but not different responses.
            if any(
                previous[k] != observation[k]
                for k in ["status_code", "final_url", "redirects", "response_hash"]
            ):
                raise ValueError("Previously applied observation was changed")
            continue
        checked = _time(observation["checked_at"])
        if latest and checked <= latest:
            raise ValueError(
                "Availability observation predates the current registry check"
            )
        # A 404 at a redirect destination is not a 404 from the source URL.
        # Record the check, but break any earlier confirmed-404 streak.
        direct_404 = (
            observation["status_code"] == 404
            and not observation["redirects"]
            and canonical_url(observation["final_url"]) == row["source_url"]
        )
        count = count + 1 if direct_404 else 0
        latest, applied = checked, applied + 1
    if apply and applied:
        db.execute(
            "UPDATE documents SET consecutive_not_found=?, last_checked_at=? WHERE source_url=?",
            (count, latest.isoformat(), row["source_url"]),
        )
    return {
        "source_url": row["source_url"],
        "status": "recorded" if apply else "validated",
        "observations": observations,
        "new_observations": applied,
        "consecutive_not_found": count,
    }
