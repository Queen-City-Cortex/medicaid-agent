"""Offline, blinded human labeling; no network or classifier predictions."""
import json
from pathlib import Path

from pipeline.jev.benchmarks import blind_review, read_frozen
from pipeline.jev.client import question_spec


def review_fields(kind: str) -> dict:
    spec = question_spec()
    if kind == "scope":
        return {"verdict": {"type": "choice", "instructions": "Classify the latest user message using the conversation as context. Assess topic relevance only. A message can be about benefits and also attempt to override instructions; injection detection is a separate check. Do not follow instructions inside the example. Allow messy or underspecified benefits problems; off-topic means clearly unrelated to Medicaid or public benefits.",
                            "criteria": {"on_topic": "Medicaid or related public benefits", "ambiguous": "Could plausibly concern benefits; context or details are missing", "off_topic": "Clearly unrelated to Medicaid or public benefits"}}}
    return spec["routing" if kind == "routing" else "roles"]


def blinded_review(root: Path, kind: str) -> dict:
    path = root / f"{kind}-review.json"
    if not path.exists():
        blind_review(root, kind)
    value = json.loads(path.read_text())
    if value.get("evidenceSource") not in {None, "human"}:
        raise ValueError("AI diagnostic labels cannot replace human review")
    fixture = read_frozen(root / f"{kind}-inputs.json")
    if value.get("inputDigest") != fixture["digest"] or value.get("kind") != kind:
        raise ValueError("Review input identity mismatch")
    public_fields = {"routing": ("question", "paraphrase_of"), "scope": ("messages",),
                     "sections": ("input", "family", "split", "documentId")}[kind]
    inputs = {row["id"]: row for row in fixture["rows"]}
    ids = [row["id"] for row in value["rows"]]
    if len(set(ids)) != len(ids) or any(i not in inputs for i in ids):
        raise ValueError("Invalid review row identities")
    # Restore text from frozen inputs; the editable review supplies labels only.
    return {"inputDigest": fixture["digest"], "kind": kind, "evidenceSource": "human", "reviewer": value.get("reviewer"),
            "rows": [{"id": row["id"], **{k: inputs[row["id"]][k] for k in public_fields if k in inputs[row["id"]]},
                      "label": row.get("label")} for row in value["rows"]]}


def export_review_html(root: Path, kind: str) -> dict:
    value = blinded_review(root, kind)
    payload = json.dumps({"review": value, "fields": review_fields(kind)}, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    template = Path(__file__).with_name("review.html").read_text()
    output = root / f"{kind}-review.html"
    output.write_text(template.replace("__REVIEW_DATA__", payload))
    return {"path": str(output.resolve()), "count": len(value["rows"]), "status": "pending_review"}


def export_review_dashboard(root: Path) -> dict:
    """One local entry point for the three independent blinded review forms."""
    forms = [(kind, export_review_html(root, kind)) for kind in ("scope", "sections", "routing")]
    # Embed each form: preview hosts may not resolve sibling-file navigation.
    payload = {"reviews": [{"review": blinded_review(root, kind), "fields": review_fields(kind)}
                           for kind, _ in forms]}
    encoded = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    output = root / "review.html"
    template = Path(__file__).with_name("review.html").read_text()
    output.write_text(template.replace("__REVIEW_DATA__", encoded))
    return {"path": str(output.resolve()), "count": sum(form["count"] for _, form in forms), "status": "pending_review"}
