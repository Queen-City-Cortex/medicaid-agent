"""Golden dataset loader, validator, and filtering."""

import json
from pathlib import Path

import jsonschema

from pipeline.config import GOLDEN_DATASET_PATH, GOLDEN_DATASET_SCHEMA


def load_dataset(path: Path | None = None) -> list[dict]:
    """Load the golden dataset from JSON."""
    path = path or GOLDEN_DATASET_PATH
    return json.loads(path.read_text())


def validate_dataset(path: Path | None = None) -> list[str]:
    """Validate the golden dataset against the JSON schema. Returns list of error messages."""
    path = path or GOLDEN_DATASET_PATH
    schema_path = GOLDEN_DATASET_SCHEMA

    data = json.loads(path.read_text())
    schema = json.loads(schema_path.read_text())

    errors: list[str] = []
    validator = jsonschema.Draft7Validator(schema)
    for error in validator.iter_errors(data):
        errors.append(f"{error.json_path}: {error.message}")

    return errors


def filter_dataset(
    entries: list[dict],
    difficulty: str | None = None,
    reasoning_type: str | None = None,
    question_id: str | None = None,
    category: str | None = None,
) -> list[dict]:
    """Filter dataset entries by criteria."""
    result = entries

    if difficulty:
        result = [e for e in result if e["difficulty"] == difficulty]
    if reasoning_type:
        result = [e for e in result if e["reasoning_type"] == reasoning_type]
    if question_id:
        result = [e for e in result if e["id"] == question_id]
    if category:
        result = [e for e in result if e.get("reasoning_type") == category]

    return result
