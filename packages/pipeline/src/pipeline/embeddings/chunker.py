"""Split large text into chunks at paragraph boundaries with overlap."""

MAX_CHUNK_CHARS = 9000  # ~3K tokens, well within voyage-law-2's 16K context


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split text into chunks at paragraph boundaries with overlap.

    - Splits on double newlines (paragraph boundaries)
    - Accumulates paragraphs until adding the next would exceed max_chars
    - Overlaps by carrying the last paragraph of the previous chunk into the next
    - If a single paragraph exceeds max_chars, it is included as its own chunk
    """
    paragraphs = text.split("\n\n")

    # Strip empty paragraphs but keep track of content
    paragraphs = [p for p in paragraphs if p.strip()]

    if not paragraphs:
        return [text] if text.strip() else []

    chunks: list[str] = []
    current: list[str] = []
    current_len: int = 0

    for para in paragraphs:
        para_len = len(para)
        # Separator cost: "\n\n" between existing content and new paragraph
        sep_cost = 2 if current else 0
        would_be = current_len + sep_cost + para_len

        if current and would_be > max_chars:
            # Flush current chunk
            chunks.append("\n\n".join(current))
            # Overlap: start next chunk with the last paragraph of previous
            overlap = [current[-1]]
            current = overlap
            current_len = len(overlap[0])

        # If even a single paragraph exceeds max_chars, it must still be added
        sep_cost = 2 if current else 0
        current.append(para)
        current_len = current_len + sep_cost + para_len

    if current:
        chunks.append("\n\n".join(current))

    return chunks
