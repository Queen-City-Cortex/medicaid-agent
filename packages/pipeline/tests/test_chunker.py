"""Exact reconstruction and size invariants, including real outlier scale."""

import random

import pytest

from pipeline.embeddings.chunker import MAX_INPUT_BYTES, plan_inputs


def assert_plan(body, context="", **kwargs):
    parts = list(plan_inputs(body, context, **kwargs))
    data = body.encode()
    if not body.strip():
        assert parts == []
        return parts
    previous = 0
    rebuilt = bytearray()
    for index, part in enumerate(parts):
        assert part.index == index
        assert len(part.text.encode()) <= kwargs.get("max_bytes", MAX_INPUT_BYTES)
        assert part.body_start <= previous < part.body_end
        assert part.overlap_bytes == previous - part.body_start
        assert part.overlap_bytes <= kwargs.get("overlap_bytes", 500)
        assert part.text == context + data[part.body_start : part.body_end].decode()
        rebuilt.extend(data[previous : part.body_end])
        previous = part.body_end
    assert bytes(rebuilt) == data
    assert previous == len(data)
    return parts


def test_direct_includes_heading_in_budget():
    assert assert_plan("a" * 8990, "Header\n")[0].kind == "section"
    assert assert_plan("a" * 8999, "Header\n")[0].kind == "chunk"
    assert list(plan_inputs("")) == []


@pytest.mark.parametrize(
    "body",
    [
        "A" * 38_489_172,
        "x " * 24677,
        ("First\n\n" + "é😀中 " * 400) * 20,
        " \n\t" * 9000,
    ],
    ids=[
        "giant-unbroken-paragraph",
        "many-words",
        "unicode-paragraphs",
        "whitespace-only",
    ],
)
def test_outliers_are_lossless_and_bounded(body):
    assert_plan(body, "Manual > Section\n")


def test_random_unicode_boundaries():
    rng = random.Random(407)
    for limit in range(10, 60):
        body = "".join(rng.choice("abé😀中\n\t ") for _ in range(400))
        parts = assert_plan(body, "C\n", max_bytes=limit, overlap_bytes=5)
        assert parts == list(plan_inputs(body, "C\n", max_bytes=limit, overlap_bytes=5))


def test_heading_cannot_consume_body_budget():
    with pytest.raises(ValueError, match="context"):
        list(plan_inputs("😀", "x" * 8999))
    # Small remaining budgets drop overlap and still progress.
    assert_plan("é😀abc" * 2000, "x" * 4499)


def test_bounded_overlap_is_not_a_whole_large_paragraph():
    parts = assert_plan(("Some sentence. " * 1500 + "\n\n") * 2)
    assert len(parts) > 2
    assert any(0 < p.overlap_bytes <= 500 for p in parts)


def test_fingerprint_changes_with_input_or_model():
    p = next(plan_inputs("body", "title\n"))
    assert p.fingerprint("model", 1024) == p.fingerprint("model", 1024)
    assert p.fingerprint("other", 1024) != p.fingerprint("model", 1024)
    assert next(plan_inputs("body", "new title\n")).fingerprint(
        "model", 1024
    ) != p.fingerprint("model", 1024)


def test_separator_only_first_chunk_is_avoided():
    parts = assert_plan("\n\n" + "A" * 20000, "Heading\n")
    assert all(p.text.removeprefix("Heading\n").strip() for p in parts)


def test_context_amplification_is_rejected():
    with pytest.raises(ValueError, match="half"):
        list(plan_inputs("A" * 10000, "X" * 8990))


def test_unicode_leading_separator_does_not_force_blank_split():
    parts = list(plan_inputs("\u00a0\n" + "x" * 100, max_bytes=40, overlap_bytes=0))
    assert parts[0].text.strip()
    assert "".join(p.text for p in parts) == "\u00a0\n" + "x" * 100
