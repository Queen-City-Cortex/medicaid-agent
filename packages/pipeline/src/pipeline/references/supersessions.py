"""CFR part supersessions: loading and typed access.

Data lives in packages/pipeline/data/references/cfr-supersessions.json so new
supersessions can be added without code changes. Each entry carries the
replacement (title, part) plus provenance — `effective` and a `reason`
narrative explaining the supersession chain. The resolver uses only the
replacement tuple for citation redirects; the federal loader writes the full
provenance to the graph (stub Document + SUPERSEDED_BY edge) so the agent can
narrate the history when a user asks about the old citation.
"""

import json
from dataclasses import dataclass
from pathlib import Path

CFR_SUPERSESSIONS_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "references" / "cfr-supersessions.json"
)


@dataclass(frozen=True)
class CfrSupersession:
    old_title: int
    old_part: int
    new_title: int
    new_part: int
    effective: str | None
    reason: str | None


def load_cfr_supersessions() -> dict[tuple[int, int], CfrSupersession]:
    """Load the (title, part) → CfrSupersession map from the data file.

    Fails open to an empty mapping if the file is missing or malformed so
    reference resolution still works.
    """
    try:
        payload = json.loads(CFR_SUPERSESSIONS_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    raw = payload.get("supersessions") or {}
    result: dict[tuple[int, int], CfrSupersession] = {}
    for key, entry in raw.items():
        try:
            old_title_str, old_part_str = key.split(":", 1)
            old_title, old_part = int(old_title_str), int(old_part_str)
            replacement = entry["replaces_with"]
            supersession = CfrSupersession(
                old_title=old_title,
                old_part=old_part,
                new_title=int(replacement["title"]),
                new_part=int(replacement["part"]),
                effective=entry.get("effective"),
                reason=entry.get("reason"),
            )
        except (ValueError, KeyError, TypeError):
            continue
        result[(old_title, old_part)] = supersession
    return result
