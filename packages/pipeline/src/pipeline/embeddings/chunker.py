"""Lossless bounded source windows with bounded overlap."""

MAX_CHUNK_CHARS = 9000
MAX_OVERLAP_CHARS = 512


def chunk_spans(text, max_chars=MAX_CHUNK_CHARS, overlap_chars=MAX_OVERLAP_CHARS):
    """Yield original offsets, preserving separators and whitespace."""
    if max_chars < 1 or overlap_chars < 0:
        raise ValueError("Chunk size must be positive and overlap nonnegative")
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            minimum = start + max(1, max_chars // 2)
            paragraph = text.rfind("\n\n", minimum, end)
            if paragraph >= minimum:
                end = paragraph + 2
            else:
                for position in range(end - 1, minimum - 1, -1):
                    if text[position].isspace():
                        end = position + 1
                        break
        yield start, end
        if end == len(text):
            break
        overlap = min(overlap_chars, max_chars // 8, end - start - 1)
        start = end - overlap
