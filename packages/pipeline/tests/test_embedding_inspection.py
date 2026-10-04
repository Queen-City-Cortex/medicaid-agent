import pytest
from pipeline.embeddings.inspection import measure_embedding_plan


def test_measures_exact_lossless_inputs_without_provider():
    report = measure_embedding_plan(
        iter(
            [
                {
                    "section_id": "s",
                    "source_family": "fee_schedule",
                    "body": "中 |  " * 5000,
                    "context": "Fee schedule\n",
                },
                {
                    "section_id": "empty",
                    "source_family": "fee_schedule",
                    "body": "",
                    "context": "X\n",
                },
            ]
        )
    )
    assert report["sections"] == report["losslessPlanSections"] == 1
    assert report["emptySections"] == 1
    assert (
        report["maximumInputUtf8Bytes"] <= 9000
        and report["oversizedPlannedInputs"] == 0
    )
    assert report["families"]["fee_schedule"]["rawBodyUtf8Bytes"] == 35000
    assert report["tokenizerCalled"] is False and report["embeddingsGenerated"] is False


def test_invalid_context_is_a_failure_not_a_skipped_section():
    with pytest.raises(ValueError, match="context"):
        measure_embedding_plan(
            [
                {
                    "section_id": "s",
                    "source_family": "x",
                    "body": "é",
                    "context": "x" * 9000,
                }
            ]
        )


def test_blank_input_diagnostics_preserve_lossless_body():
    report = measure_embedding_plan(
        [
            {
                "section_id": "s",
                "source_family": "x",
                "body": "x" * 9000 + "\n",
                "context": "",
            }
        ]
    )
    assert report["whitespaceOnlyNovelBodyInputs"] == 1
    assert report["emptySections"] == report["whitespaceOnlySections"] == 0
    assert report["losslessPlanSections"] == 1
