"""Tests for text chunking logic."""

from pipeline.embeddings.chunker import chunk_text


class TestChunkText:
    def test_short_text_single_chunk(self):
        text = "Short paragraph."
        chunks = chunk_text(text, max_chars=12000)
        assert len(chunks) == 1
        assert chunks[0] == "Short paragraph."

    def test_long_text_splits_at_paragraphs(self):
        paragraphs = [f"Paragraph {i}. " * 50 for i in range(20)]
        text = "\n\n".join(paragraphs)
        chunks = chunk_text(text, max_chars=2000)
        assert len(chunks) > 1
        # All content should be present across chunks
        for p in paragraphs:
            assert any(p.strip() in c for c in chunks)

    def test_overlap_between_chunks(self):
        paragraphs = [f"Paragraph {i}. " * 50 for i in range(10)]
        text = "\n\n".join(paragraphs)
        chunks = chunk_text(text, max_chars=2000)
        if len(chunks) >= 2:
            # Last paragraph of chunk 0 should appear in chunk 1
            last_para_chunk0 = chunks[0].split("\n\n")[-1]
            assert last_para_chunk0 in chunks[1]

    def test_each_chunk_within_limit(self):
        paragraphs = [f"Paragraph {i}. " * 100 for i in range(30)]
        text = "\n\n".join(paragraphs)
        chunks = chunk_text(text, max_chars=5000)
        for chunk in chunks:
            assert len(chunk) <= 6000  # Allow some slack for overlap

    def test_single_huge_paragraph_not_lost(self):
        # A single paragraph larger than max_chars must still be included
        huge = "A" * 20000
        chunks = chunk_text(huge, max_chars=12000)
        total_text = "".join(chunks)
        assert "A" * 20000 in total_text or len(total_text) >= 20000
