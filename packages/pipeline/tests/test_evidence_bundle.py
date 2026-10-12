"""Tests for the judge evidence bundle builder."""

from pipeline.eval.evidence import build_judge_evidence, EvidenceBundle


def _golden(section_id: str, text: str) -> dict:
    return {"section_id": section_id, "text": text}


def _source(tool: str, key: str, text: str) -> dict:
    return {"toolName": tool, "key": key, "text": text}


def test_empty_inputs_return_empty_bundle():
    bundle = build_judge_evidence([], [])
    assert isinstance(bundle, EvidenceBundle)
    assert bundle.blocks == []
    assert bundle.sources_used == 0
    assert bundle.golden_blocks_used == 0
    assert bundle.bytes_in_prompt == 0
    assert bundle.budget_trimmed is False


def test_only_golden_preserves_order():
    bundle = build_judge_evidence(
        [_golden("sec:a", "Alpha content"), _golden("sec:b", "Beta content")],
        [],
    )
    assert bundle.blocks == [
        "--- Golden section: sec:a ---\nAlpha content",
        "--- Golden section: sec:b ---\nBeta content",
    ]
    assert bundle.golden_blocks_used == 2
    assert bundle.sources_used == 0


def test_only_agent_sources_ordered_by_priority():
    sources = [
        _source("followReferences", "fr-1", "Ref block"),
        _source("getSection", "sec:x", "Section X content"),
        _source("getAmendments", "cn-04-26", "Amendment block"),
    ]
    bundle = build_judge_evidence([], sources)
    # Priority order: getSection > getAmendments > followReferences.
    assert len(bundle.blocks) == 3
    assert "getSection" in bundle.blocks[0]
    assert "getAmendments" in bundle.blocks[1]
    assert "followReferences" in bundle.blocks[2]
    assert bundle.sources_used == 3


def test_golden_comes_before_agent_sources():
    bundle = build_judge_evidence(
        [_golden("sec:a", "Golden A")],
        [_source("getSection", "sec:x", "Agent X")],
    )
    assert bundle.blocks[0] == "--- Golden section: sec:a ---\nGolden A"
    assert "Agent X" in bundle.blocks[1]
    assert bundle.blocks[1].startswith("--- Evidence: getSection → sec:x ---")


def test_dedup_agent_getSection_when_golden_has_same_id():
    bundle = build_judge_evidence(
        [_golden("sec:shared", "Golden shared text")],
        [
            _source("getSection", "sec:shared", "Agent-read copy"),
            _source("getSection", "sec:unique", "Agent-unique read"),
        ],
    )
    # Only the unique agent section survives; the duplicate is dropped.
    assert any("Agent-unique read" in b for b in bundle.blocks)
    assert not any("Agent-read copy" in b for b in bundle.blocks)
    assert bundle.golden_blocks_used == 1
    assert bundle.sources_used == 1


def test_non_getSection_sources_are_never_deduped_against_golden():
    bundle = build_judge_evidence(
        [_golden("cn:04-26", "Golden notice body")],
        [_source("getAmendments", "cn:04-26", "[getAmendments]\nAppendix B changed...")],
    )
    # Amendments carry different info than section content — always keep.
    assert bundle.sources_used == 1
    assert any("Appendix B" in b for b in bundle.blocks)


def test_amendment_source_with_change_summary_survives(q_044_style=True):
    """q-044 regression case: agent calls getAmendments → changeSummary is the
    only source of 'Appendix B' / 'Section 3.3b' fact. Must appear in bundle."""
    sources = [
        _source(
            "getAmendments",
            "clinical_policy:3K-2",
            "[getAmendments]\nAmendments (2):\n"
            "  - clinical_policy:3K-2:amend:2024-11-15 | Policy 3K-2 Revision — 2024-11-15 | 2024-11-15\n"
            "    Summary: Appendix B: New information was added to provide clarity.\n"
            "  - clinical_policy:3K-2:amend:2025-09-01 | Policy 3K-2 Revision — 2025-09-01 | 2025-09-01\n"
            "    Summary: Section 3.3b: Added 'birth' to 'month'.",
        ),
    ]
    bundle = build_judge_evidence([], sources)
    joined = "\n".join(bundle.blocks)
    assert "2024-11-15" in joined
    assert "2025-09-01" in joined
    assert "Appendix B" in joined
    assert "Section 3.3b" in joined


def test_budget_trims_lowest_priority_agent_source_first():
    big = "X" * 5_000
    sources = [
        _source("followReferences", "fr-1", big),
        _source("resolveAnswerFrame", "raf-1", big),
        _source("getSection", "sec:keep", big),
        _source("getAmendments", "cn:keep", big),
    ]
    # Budget fits two sources + headers, not four.
    bundle = build_judge_evidence([], sources, budget_chars=12_000)
    joined = "\n".join(bundle.blocks)
    assert "sec:keep" in joined
    assert "cn:keep" in joined
    assert "fr-1" not in joined
    assert "raf-1" not in joined
    assert bundle.budget_trimmed is True
    assert bundle.sources_used == 2


def test_budget_never_trims_golden():
    # 20 KB of golden + 5 KB budget → golden still included (golden is
    # mandatory; budget applies only to agent sources).
    golden = [_golden("sec:a", "G" * 20_000)]
    bundle = build_judge_evidence(golden, [], budget_chars=5_000)
    assert bundle.golden_blocks_used == 1
    assert bundle.blocks[0].startswith("--- Golden section: sec:a ---\nG")
    # No agent sources to trim → budget_trimmed stays False.
    assert bundle.budget_trimmed is False


def test_golden_text_is_not_charged_against_the_agent_budget():
    # q-010 / q-015 / q-043: golden alone exceeded the 80 KB budget, so every
    # agent source was dropped and the judge called supported facts fabricated.
    golden = [_golden("sec:a", "G" * 100_000)]
    sources = [_source("getAmendments", "cn:keep", "small amendment block")]
    bundle = build_judge_evidence(golden, sources)
    assert bundle.golden_blocks_used == 1
    assert bundle.sources_used == 1
    assert bundle.budget_trimmed is False
    assert "small amendment block" in bundle.blocks[-1]


def test_frame_section_bodies_outrank_the_routing_hint():
    big = "X" * 5_000
    sources = [
        _source("resolveAnswerFrame", "raf-hint", big),
        _source("mysteryTool", "m-1", "mystery text"),
        _source("searchSections", "search-1", big),
        _source("resolveAnswerFrame:section", "sec:frame", big),
    ]
    ordered = build_judge_evidence([], sources)
    assert [b.splitlines()[0] for b in ordered.blocks] == [
        "--- Evidence: resolveAnswerFrame:section → sec:frame ---",
        "--- Evidence: searchSections → search-1 ---",
        "--- Evidence: resolveAnswerFrame → raf-hint ---",
        "--- Evidence: mysteryTool → m-1 ---",
    ]
    # With room for one large block, the section body claims it.
    trimmed = build_judge_evidence([], sources, budget_chars=6_000)
    joined = "\n".join(trimmed.blocks)
    assert "sec:frame" in joined
    assert "raf-hint" not in joined
    assert trimmed.budget_trimmed is True


def test_section_entries_already_covered_are_skipped():
    bundle = build_judge_evidence(
        [_golden("sec:shared", "Golden shared text")],
        [
            _source("resolveAnswerFrame:section", "sec:shared", "Frame copy of golden"),
            _source("resolveAnswerFrame:section", "sec:both", "Frame read"),
            _source("getSection", "sec:both", "Second read of the same section"),
        ],
    )
    joined = "\n".join(bundle.blocks)
    assert "Frame copy of golden" not in joined
    assert "Frame read" in joined
    assert "Second read of the same section" not in joined
    assert bundle.sources_used == 1


def test_budget_trimmed_true_when_agent_source_overflows():
    golden = [_golden("sec:a", "small")]
    sources = [_source("getSection", "sec:big", "X" * 10_000)]
    bundle = build_judge_evidence(golden, sources, budget_chars=1_000)
    # Golden survived; agent source didn't.
    assert bundle.golden_blocks_used == 1
    assert bundle.sources_used == 0
    assert bundle.budget_trimmed is True


def test_empty_text_sources_are_skipped():
    sources = [
        _source("getSection", "sec:empty", ""),
        _source("getSection", "sec:real", "actual content"),
    ]
    bundle = build_judge_evidence([], sources)
    assert bundle.sources_used == 1
    assert any("actual content" in b for b in bundle.blocks)


def test_stats_reflect_final_byte_count():
    bundle = build_judge_evidence(
        [_golden("sec:a", "hello")],
        [_source("getSection", "sec:x", "world")],
    )
    # Two blocks joined by "\n\n" separator in the count.
    assert bundle.bytes_in_prompt > 0
    assert bundle.bytes_in_prompt == sum(
        len(b.encode("utf-8")) for b in bundle.blocks
    ) + len("\n\n") * (len(bundle.blocks) - 1)


def test_unknown_tool_is_ranked_last_not_dropped():
    sources = [
        _source("mysteryTool", "m-1", "mystery text"),
        _source("getSection", "sec:x", "section text"),
    ]
    bundle = build_judge_evidence([], sources)
    assert bundle.sources_used == 2
    # getSection is priority 0; unknown tool is 99 → getSection first.
    assert "section text" in bundle.blocks[0]
    assert "mystery text" in bundle.blocks[1]


def test_non_dict_agent_sources_are_skipped_safely():
    sources = [None, "a string", {"toolName": "getSection", "key": "sec:x", "text": "ok"}]
    bundle = build_judge_evidence([], sources)  # type: ignore[arg-type]
    assert bundle.sources_used == 1


def test_a_window_of_a_golden_section_is_not_added_beside_it():
    bundle = build_judge_evidence(
        [_golden("sec:a", "Alpha content")],
        [
            _source("getSection", "sec:a#chars=0-6000", "A window of alpha"),
            _source("getSection", "sec:b#chars=0-6000", "A window of beta"),
        ],
    )
    assert bundle.golden_blocks_used == 1
    assert bundle.sources_used == 1
    assert not any("A window of alpha" in block for block in bundle.blocks)
    assert any("A window of beta" in block for block in bundle.blocks)


def test_the_default_budget_holds_what_the_verifier_reads():
    from pipeline.eval.evidence import JUDGE_AGENT_EVIDENCE_BUDGET_CHARS

    # A long revision history beside the section bodies: about what the
    # verifier saw (94,000 characters) on the two questions the old budget cut.
    sources = [
        {"toolName": "getSection", "key": "sec:a:1", "text": "s" * 25_000},
        {"toolName": "getAmendments", "key": "policy-10a", "text": "a" * 68_000},
    ]
    assert JUDGE_AGENT_EVIDENCE_BUDGET_CHARS == 120_000
    bundle = build_judge_evidence([], sources)
    assert bundle.sources_used == 2 and bundle.budget_trimmed is False
    assert build_judge_evidence([], sources, budget_chars=80_000).budget_trimmed is True
    # Counted in characters, like the verifier: two-byte text is not charged double.
    wide = [{"toolName": "getSection", "key": "sec:b:1", "text": "§" * 70_000}]
    assert build_judge_evidence([], wide).budget_trimmed is False
