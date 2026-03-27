"""Test golden dataset loader and validator."""

import json
import pytest
from pathlib import Path
from pipeline.eval.dataset import load_dataset, validate_dataset, filter_dataset


SAMPLE_ENTRY = {
    "id": "q-001",
    "version": 1,
    "created": "2026-03-28",
    "updated": "2026-03-28",
    "question": "What is the age limit for EPSDT services in NC Medicaid?",
    "difficulty": "simple",
    "reasoning_type": "single_lookup",
    "topics": ["epsdt"],
    "target_users": ["beneficiary"],
    "answer": {
        "text": "EPSDT services are available to Medicaid beneficiaries under age 21.",
        "confidence": "high",
        "caveats": []
    },
    "evidence": {
        "primary_sections": [
            {
                "document_id": "doc:clinical_policy:1A",
                "section_id": "sec:doc:clinical_policy:1A:3.1",
                "section_number": "3.1",
                "relevance": "Defines EPSDT age eligibility"
            }
        ],
        "supporting_sections": [],
        "cross_references": [],
        "federal_references": []
    },
    "source": "lived_experience",
    "notes": "Basic EPSDT question."
}

SAMPLE_DATASET = [
    SAMPLE_ENTRY,
    {**SAMPLE_ENTRY, "id": "q-002", "difficulty": "moderate", "reasoning_type": "multi_hop"},
    {**SAMPLE_ENTRY, "id": "q-003", "difficulty": "complex", "reasoning_type": "cross_document"},
]


class TestValidateDataset:
    def test_valid_dataset(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        errors = validate_dataset(path)
        assert errors == []

    def test_missing_required_field(self, tmp_path):
        bad = {**SAMPLE_ENTRY}
        del bad["question"]
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([bad]))
        errors = validate_dataset(path)
        assert len(errors) > 0

    def test_invalid_difficulty(self, tmp_path):
        bad = {**SAMPLE_ENTRY, "difficulty": "impossible"}
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([bad]))
        errors = validate_dataset(path)
        assert len(errors) > 0


class TestLoadDataset:
    def test_loads_entries(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        entries = load_dataset(path)
        assert len(entries) == 3

    def test_returns_dicts(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps(SAMPLE_DATASET))
        entries = load_dataset(path)
        assert all(isinstance(e, dict) for e in entries)


class TestFilterDataset:
    def test_filter_by_difficulty(self):
        result = filter_dataset(SAMPLE_DATASET, difficulty="simple")
        assert len(result) == 1
        assert result[0]["id"] == "q-001"

    def test_filter_by_category(self):
        result = filter_dataset(SAMPLE_DATASET, reasoning_type="multi_hop")
        assert len(result) == 1
        assert result[0]["id"] == "q-002"

    def test_filter_by_question_id(self):
        result = filter_dataset(SAMPLE_DATASET, question_id="q-003")
        assert len(result) == 1

    def test_no_filter_returns_all(self):
        result = filter_dataset(SAMPLE_DATASET)
        assert len(result) == 3
