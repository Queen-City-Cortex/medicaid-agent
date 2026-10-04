"""Standard-library-only annotation validation for system-Python restoration."""
import json
from pathlib import Path

from pipeline.jev.client import MODEL, digest, question_spec, validate_response


def section_input(row: dict) -> dict:
    return {key: row.get(key) if key != "content" else row.get(key) or ""
            for key in ("title", "sectionNumber", "documentTitle", "documentType", "policyNumber", "content")}


def cache_key(state: dict, questions: dict) -> str:
    return digest({"model": MODEL, "input": state, "questions": questions})


def validate_cache(value: dict) -> dict:
    questions = question_spec()["roles"]
    if value.get("specHash") != digest(questions) or value.get("inputHash") != digest(value.get("input")):
        raise ValueError("Section label input/spec hash mismatch")
    if value.get("key") != cache_key(value["input"], questions):
        raise ValueError("Section label cache key mismatch")
    response = validate_response(value["response"], questions)
    expected = {key: answer["noul"] for key, answer in response["answers"].items()}
    if value.get("probabilities") != expected or value.get("model") != MODEL:
        raise ValueError("Section label probabilities/model mismatch")
    return value


def manifest_digest(value: dict) -> str:
    return digest({key: val for key, val in value.items() if key != "digest"})


def validate_label_manifest(value: dict, root: Path) -> None:
    if value.get("digest") != manifest_digest(value) or value.get("model") != MODEL or value.get("specHash") != digest(question_spec()["roles"]):
        raise ValueError("Section annotation manifest identity mismatch")
    ids = [row["id"] for row in value["sections"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate section annotation identity")
    for row in value["sections"]:
        if row["status"] == "labeled":
            key = row["cacheKey"]
            if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
                raise ValueError("Invalid section cache identity")
            cached = validate_cache(json.loads((root / "cache" / f"{key}.json").read_text()))
            if cached["inputHash"] != row["inputHash"] or cached["key"] != key or digest(cached) != row.get("cacheHash"):
                raise ValueError("Manifest/cache identity mismatch")


