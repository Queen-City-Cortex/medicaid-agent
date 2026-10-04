"""Lossless hard bounds, including pathological source paragraphs."""
import pytest
from pipeline.embeddings.chunker import chunk_spans
from pipeline.embeddings.planner import plan_inputs, plan_hash


@pytest.mark.parametrize("body", ["a" * 100003, "  αβ\n\n" * 3000, "😀" * 24000, "x\n y\t" * 5000], ids=["unbroken", "unicode-spaces", "emoji", "mixed-separators"])
def test_original_body_reconstructs_without_gaps(body):
    spans = list(chunk_spans(body))
    cursor = 0
    reconstructed = ""
    for start, end in spans:
        assert 0 <= start <= cursor < end <= len(body)
        assert end - start <= 9000
        assert cursor - start <= 512
        reconstructed += body[cursor:end]
        cursor = end
    assert reconstructed == body
    assert cursor == len(body)


def test_context_heading_is_in_every_input_and_consumes_budget():
    heading, body = "Title " * 300, "Content\n" * 5000
    inputs = list(plan_inputs(heading, body, "voyage-4", counter=lambda text, _: len(text)))
    assert len(inputs) > 1
    assert all(item.text.startswith(heading + "\n") and len(item.text) <= 9000 for item in inputs)
    assert all(item.text == heading + "\n" + body[item.body_start:item.body_end] for item in inputs)
    assert inputs[-1].body_end == len(body)


def test_high_token_density_is_split_without_truncation():
    inputs = list(plan_inputs("h", "x" * 8500, "voyage-4", counter=lambda text, _: len(text) * 6))
    assert len(inputs) > 1
    assert all(item.tokens <= 32000 for item in inputs)
    assert "".join(item.text[2:] for item in inputs) == "x" * 8500


def test_unusable_heading_is_rejected():
    with pytest.raises(ValueError, match="heading"):
        list(plan_inputs("x" * 9000, "body", "voyage-4", counter=lambda *_: 1))


def test_plan_identity_binds_model_dimensions_heading_and_body():
    def digest(heading="h", body="body", model="voyage-4", dimensions=1024):
        return plan_hash(list(plan_inputs(heading, body, model, counter=lambda *_: 1)), model, dimensions)
    original = digest()
    assert all(original != changed for changed in [digest(heading="other"), digest(body="changed"),
                digest(model="voyage-4-large"), digest(dimensions=512)])


def test_empty_and_invalid_limits():
    assert list(chunk_spans("")) == []
    with pytest.raises(ValueError):
        list(chunk_spans("x", max_chars=0))


def test_whitespace_only_body_has_no_plan():
    assert list(plan_inputs("h", " \n\t", "voyage-4", counter=lambda *_: 1)) == []


def test_context_amplification_is_rejected():
    with pytest.raises(ValueError, match="heading"):
        list(plan_inputs("h" * 4500, "body", "voyage-4", counter=lambda *_:1))
