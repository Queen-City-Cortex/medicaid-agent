"""Golden dataset loader, validator, and filtering."""

import json
from pathlib import Path

import jsonschema

from pipeline.config import GOLDEN_DATASET_PATH, GOLDEN_DATASET_SCHEMA

DATASET_VERSION_FILE = "dataset-version.json"

# A paraphrase row carries a reworded question only. Everything that says what
# a right answer is comes from its golden parent, so the two cannot diverge.
INHERITED_FIELDS = (
    "answer",
    "evidence",
    "status",
    "supporting_quotes",
    "validation_note",
    "expected_behavior",
)


def load_dataset(path: Path | None = None) -> list[dict]:
    """Load a dataset, giving each paraphrase row its golden parent's key."""
    path = path or GOLDEN_DATASET_PATH
    entries = json.loads(path.read_text())
    if not any("paraphrase_of" in entry for entry in entries):
        return entries
    golden = {entry["id"]: entry for entry in json.loads(GOLDEN_DATASET_PATH.read_text())}
    resolved = []
    for entry in entries:
        parent_id = entry.get("paraphrase_of")
        if parent_id is None:
            resolved.append(entry)
            continue
        own = sorted(set(entry) & set(INHERITED_FIELDS))
        if own:
            raise ValueError(
                f"{entry['id']} is a paraphrase of {parent_id} and must not carry its own {', '.join(own)}"
            )
        if parent_id not in golden:
            raise ValueError(f"{entry['id']} is a paraphrase of {parent_id}, which is not in the golden dataset")
        parent = golden[parent_id]
        resolved.append({**entry, **{key: parent[key] for key in INHERITED_FIELDS if key in parent}})
    return resolved


def dataset_version(path: Path | None = None) -> str | None:
    """The version of the dataset directory `path` is in, if it declares one."""
    version_file = (path or GOLDEN_DATASET_PATH).parent / DATASET_VERSION_FILE
    if not version_file.is_file():
        return None
    return json.loads(version_file.read_text())["version"]


def benchmark_entries(entries: list[dict]) -> list[dict]:
    """The entries an evaluation scores: those whose key has been validated."""
    return [entry for entry in entries if entry.get("status") == "validated"]


def validate_dataset(path: Path | None = None) -> list[str]:
    """Validate the golden dataset against the JSON schema. Returns list of error messages."""
    schema = json.loads(GOLDEN_DATASET_SCHEMA.read_text())
    try:
        data = load_dataset(path)
    except ValueError as error:
        return [str(error)]

    errors: list[str] = []
    validator = jsonschema.Draft7Validator(schema)
    for error in validator.iter_errors(data):
        errors.append(f"{error.json_path}: {error.message}")
    for entry in data if isinstance(data, list) else []:
        if isinstance(entry, dict):
            errors.extend(f"{entry.get('id')}: {problem}" for problem in key_problems(entry))

    return errors


def _cited_section_ids(entry: dict) -> set[str]:
    evidence = entry.get("evidence") or {}
    return {
        section.get("section_id")
        for kind in ("primary_sections", "supporting_sections")
        for section in evidence.get(kind) or []
        if isinstance(section, dict)
    }


def key_problems(entry: dict) -> list[str]:
    """What stops an entry's status from being believed, with no corpus at hand."""
    problems = []
    quotes = entry.get("supporting_quotes") or []
    if entry.get("status") == "validated" and not quotes:
        problems.append("a validated entry needs at least one supporting quote")
    if entry.get("status") == "validated" and not (entry.get("answer") or {}).get("text"):
        problems.append("a validated entry needs a factual answer text")
    if entry.get("status") == "needs_validation" and not entry.get("validation_note"):
        problems.append("a needs_validation entry must say what is unsupported in validation_note")
    cited = _cited_section_ids(entry)
    for quote in quotes:
        if isinstance(quote, dict) and quote.get("section_id") not in cited:
            problems.append(f"supporting quote cites {quote.get('section_id')}, which is not in the entry's evidence")
    return problems


def normalize_quote(text: str) -> str:
    """Collapse whitespace and nothing else: quotes are otherwise verbatim."""
    return " ".join((text or "").split())


def check_supporting_quotes(entries: list[dict], sections: dict[str, str]) -> list[str]:
    """Check every supporting quote against section text keyed by section id.

    Fails a quote when its section is missing, has no body, or does not
    contain the quote once both are whitespace-normalised.
    """
    errors = []
    for entry in entries:
        errors.extend(f"{entry['id']}: {problem}" for problem in key_problems(entry))
        for quote in entry.get("supporting_quotes") or []:
            section_id = quote["section_id"]
            if section_id not in sections:
                errors.append(f"{entry['id']}: section {section_id} is missing")
                continue
            body = normalize_quote(sections[section_id])
            if not body:
                errors.append(f"{entry['id']}: section {section_id} is empty")
            elif normalize_quote(quote["quote"]) not in body:
                errors.append(
                    f"{entry['id']}: section {section_id} does not contain the quote "
                    f"\"{normalize_quote(quote['quote'])[:80]}\""
                )
    return errors


def catalog_sections(catalog_path: Path) -> dict[str, str]:
    """Section text by id from a frozen identity catalog (`eval-identity-catalog`)."""
    catalog = json.loads(Path(catalog_path).read_text())
    return {row["section_id"]: row.get("content_text") or "" for row in catalog["sections"]}


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
