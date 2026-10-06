"""Test golden dataset loader and validator."""

import json

import pytest
from click.testing import CliRunner

from pipeline.config import GOLDEN_DATASET_PATH
from pipeline.eval.dataset import (
    INHERITED_FIELDS,
    benchmark_entries,
    check_supporting_quotes,
    dataset_version,
    filter_dataset,
    key_problems,
    load_dataset,
    validate_dataset,
)

HELDOUT_PATH = GOLDEN_DATASET_PATH.parent / "heldout-paraphrase.json"


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
    "notes": "Basic EPSDT question.",
    "status": "validated",
    "supporting_quotes": [
        {
            "section_id": "sec:doc:clinical_policy:1A:3.1",
            "quote": "beneficiaries under   21 years of age",
        }
    ],
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


UNVALIDATED = {
    **{k: v for k, v in SAMPLE_ENTRY.items() if k != "supporting_quotes"},
    "id": "q-009",
    "status": "needs_validation",
    "validation_note": "The age limit is not in the cited section.",
}
SECTION_TEXT = {"sec:doc:clinical_policy:1A:3.1": "EPSDT covers\nbeneficiaries under 21 years   of age."}


class TestAnswerKeyStatus:
    def test_only_validated_entries_are_scored(self):
        assert [e["id"] for e in benchmark_entries([SAMPLE_ENTRY, UNVALIDATED])] == ["q-001"]

    @pytest.mark.parametrize(
        "entry, problem",
        [
            ({**SAMPLE_ENTRY, "supporting_quotes": []}, "supporting quote"),
            ({**SAMPLE_ENTRY, "answer": {"confidence": "high"}}, "factual answer"),
            ({**UNVALIDATED, "validation_note": ""}, "validation_note"),
            (
                {**SAMPLE_ENTRY, "supporting_quotes": [{"section_id": "sec:elsewhere", "quote": "under 21 years of age"}]},
                "not in the entry's evidence",
            ),
        ],
    )
    def test_a_status_without_its_backing_is_a_dataset_error(self, tmp_path, entry, problem):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([entry]))

        assert any(problem in error for error in validate_dataset(path))

    def test_schema_rejects_an_entry_without_a_status(self, tmp_path):
        path = tmp_path / "dataset.json"
        path.write_text(json.dumps([{k: v for k, v in SAMPLE_ENTRY.items() if k != "status"}]))

        assert any("'status' is a required property" in error for error in validate_dataset(path))


class TestSupportingQuotes:
    def test_quote_matches_after_whitespace_is_collapsed(self):
        assert check_supporting_quotes([SAMPLE_ENTRY], SECTION_TEXT) == []

    @pytest.mark.parametrize(
        "sections, failure",
        [
            ({}, "is missing"),
            ({"sec:doc:clinical_policy:1A:3.1": "  \n"}, "is empty"),
            ({"sec:doc:clinical_policy:1A:3.1": "beneficiaries under 18 years of age"}, "does not contain the quote"),
            # Verbatim apart from whitespace: case and punctuation are not folded.
            ({"sec:doc:clinical_policy:1A:3.1": "Beneficiaries Under 21 Years Of Age"}, "does not contain the quote"),
        ],
    )
    def test_quote_fails_against_a_missing_empty_or_different_section(self, sections, failure):
        errors = check_supporting_quotes([SAMPLE_ENTRY], sections)

        assert len(errors) == 1 and failure in errors[0] and errors[0].startswith("q-001")


class TestGoldenDataset:
    """The committed files, with no corpus at hand."""

    def test_golden_and_paraphrase_files_are_valid(self):
        assert validate_dataset() == []
        assert validate_dataset(HELDOUT_PATH) == []

    def test_every_validated_entry_has_quotes_from_its_own_evidence(self):
        validated = benchmark_entries(load_dataset())

        assert validated
        for entry in validated:
            assert entry["supporting_quotes"], entry["id"]
            assert key_problems(entry) == [], entry["id"]
            assert all(q["quote"].strip() for q in entry["supporting_quotes"]), entry["id"]

    def test_every_unvalidated_entry_says_what_is_unsupported(self):
        for entry in load_dataset():
            if entry["status"] != "validated":
                assert entry["validation_note"], entry["id"]

    def test_instruction_only_keys_are_not_scored_and_keep_instructions_out_of_the_reference(self):
        entries = {entry["id"]: entry for entry in load_dataset()}

        for question_id in ("q-042", "q-044", "q-045"):
            entry = entries[question_id]
            assert entry["status"] == "needs_validation"
            assert "getAmendments" in entry["expected_behavior"] or "agent should" in entry["expected_behavior"]
            assert "agent" not in entry["answer"].get("text", "")

    def test_dataset_is_versioned(self):
        assert dataset_version() == "3.0"
        assert dataset_version(HELDOUT_PATH) == "3.0"
        assert "## v3.0" in (GOLDEN_DATASET_PATH.parent / "CHANGELOG.md").read_text()

    def test_every_paraphrase_inherits_its_key_from_a_golden_parent(self):
        golden = {entry["id"]: entry for entry in load_dataset()}
        raw = json.loads(HELDOUT_PATH.read_text())

        assert raw and not any(set(row) & set(INHERITED_FIELDS) for row in raw)
        for row in load_dataset(HELDOUT_PATH):
            parent = golden[row["paraphrase_of"]]
            assert row["question"] != parent["question"]
            assert all(row.get(key) == parent.get(key) for key in INHERITED_FIELDS)

    def test_a_paraphrase_cannot_carry_its_own_key_or_name_a_missing_parent(self, tmp_path):
        row = {"id": "h-001", "question": "A reworded question?", "paraphrase_of": "q-001"}
        path = tmp_path / "paraphrases.json"

        path.write_text(json.dumps([{**row, "answer": {"text": "Its own answer.", "confidence": "high"}}]))
        with pytest.raises(ValueError, match="must not carry its own answer"):
            load_dataset(path)
        path.write_text(json.dumps([{**row, "paraphrase_of": "q-999"}]))
        with pytest.raises(ValueError, match="not in the golden dataset"):
            load_dataset(path)


class TestValidateGoldenCommand:
    def run(self, tmp_path, monkeypatch, sections, entries=None):
        from pipeline.cli import cli

        dataset = tmp_path / "dataset.json"
        dataset.write_text(json.dumps(entries or [SAMPLE_ENTRY, UNVALIDATED]))
        args = ["eval-validate-golden", "--dataset", str(dataset)]
        monkeypatch.delenv("EVAL_IDENTITY_CATALOG", raising=False)
        if sections is not None:
            catalog = tmp_path / "catalog.json"
            catalog.write_text(json.dumps({"sections": [
                {"section_id": section_id, "content_text": text} for section_id, text in sections.items()
            ]}))
            args += ["--catalog", str(catalog)]
        return CliRunner().invoke(cli, args)

    def test_passes_when_every_quote_is_in_its_section(self, tmp_path, monkeypatch):
        result = self.run(tmp_path, monkeypatch, SECTION_TEXT)

        assert result.exit_code == 0, result.output
        assert "2 entries, 1 validated, 1 need validation" in result.output
        assert "Supporting quotes: PASS (1 quotes on 1 entries)" in result.output

    @pytest.mark.parametrize(
        "sections, failure",
        [
            ({}, "is missing"),
            ({"sec:doc:clinical_policy:1A:3.1": ""}, "is empty"),
            ({"sec:doc:clinical_policy:1A:3.1": "Something else entirely."}, "does not contain the quote"),
        ],
    )
    def test_fails_on_a_missing_empty_or_different_section(self, tmp_path, monkeypatch, sections, failure):
        result = self.run(tmp_path, monkeypatch, sections)

        assert result.exit_code != 0
        assert failure in result.output

    def test_fails_closed_without_section_text(self, tmp_path, monkeypatch):
        result = self.run(tmp_path, monkeypatch, None)

        assert result.exit_code != 0
        assert "No section text to check quotes against" in result.output
        assert "PASS" not in result.output

    def test_checks_quotes_recorded_on_entries_still_awaiting_review(self, tmp_path, monkeypatch):
        partial = {**UNVALIDATED, "supporting_quotes": [
            {"section_id": "sec:doc:clinical_policy:1A:3.1", "quote": "a sentence that is not there"}
        ]}
        result = self.run(tmp_path, monkeypatch, SECTION_TEXT, [SAMPLE_ENTRY, partial])

        assert result.exit_code != 0 and "q-009" in result.output
