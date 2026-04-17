"""Tests for the blind citation-support detector."""

from pipeline.eval.citation import score_citation_support


GOLDEN_EVIDENCE = [
    "Policy 3K-2 governs Community Alternatives Program for Disabled Adults (CAP/DA). "
    "Eligibility requires age 18 or older, Medicaid-eligible, and an assessed need for "
    "skilled nursing services.",
    "Enrollment in the CAP/DA waiver is limited to 12,000 slots statewide. "
    "Beneficiaries must reside in their own home or that of a family caregiver.",
]


def test_empty_answer_returns_perfect_scores_with_no_claims():
    result = score_citation_support("", [])
    assert result["total_claims"] == 0
    assert result["cited_claims"] == 0
    assert result["citation_ratio"] == 1.0
    assert result["groundedness_ratio"] == 1.0
    assert result["uncited_claims"] == []


def test_narrative_sentences_are_not_counted_as_claims():
    answer = (
        "I searched the clinical policies for CAP/DA. "
        "Let me check the amendments. "
        "Here is what I found."
    )
    result = score_citation_support(answer, GOLDEN_EVIDENCE)
    assert result["total_claims"] == 0


def test_uncited_factual_claim_is_detected():
    answer = (
        "CAP/DA enrollment is limited to 12,000 slots statewide. "
        "Beneficiaries must be age 18 or older."
    )
    result = score_citation_support(answer, GOLDEN_EVIDENCE)
    assert result["total_claims"] == 2
    assert result["cited_claims"] == 0
    assert result["citation_ratio"] == 0.0
    assert result["grounded_claims"] == 2
    assert result["groundedness_ratio"] == 1.0
    assert len(result["uncited_claims"]) == 2


def test_properly_cited_claim_counts_as_cited():
    answer = (
        "CAP/DA enrollment is limited to 12,000 slots statewide "
        "[Policy 3K-2 § 2.1](https://medicaid.ncdhhs.gov/policy-3K-2). "
        "Beneficiaries must be age 18 or older "
        "[Policy 3K-2 § 3.1](https://medicaid.ncdhhs.gov/policy-3K-2)."
    )
    result = score_citation_support(answer, GOLDEN_EVIDENCE)
    assert result["total_claims"] == 2
    assert result["cited_claims"] == 2
    assert result["citation_ratio"] == 1.0
    assert result["total_citations"] == 2
    assert len(result["unique_citation_urls"]) == 1


def test_ungrounded_claim_is_flagged():
    answer = (
        "The dental benefit limit is 4 exams per year "
        "[Policy 1H § 2.1](https://medicaid.ncdhhs.gov/policy-1H)."
    )
    result = score_citation_support(answer, GOLDEN_EVIDENCE)
    assert result["total_claims"] >= 1
    # No dental/exam/1H overlap with the CAP/DA evidence blob.
    assert result["grounded_claims"] == 0


def test_partial_cite_partial_ground():
    answer = (
        "CAP/DA enrollment is limited to 12,000 slots statewide "
        "[Policy 3K-2 § 2.1](https://medicaid.ncdhhs.gov/policy-3K-2). "
        "The crawl cadence is monthly and the audit happens weekly."
    )
    result = score_citation_support(answer, GOLDEN_EVIDENCE)
    assert result["total_claims"] >= 1
    assert 0 < result["citation_ratio"] <= 1.0
