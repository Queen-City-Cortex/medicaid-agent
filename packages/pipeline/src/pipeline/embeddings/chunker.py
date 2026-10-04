"""Lossless byte-bounded embedding input planning, shared with offline checks."""

from dataclasses import dataclass
import hashlib
import json
import re
from collections.abc import Iterator

EMBEDDING_INPUT_POLICY = "contextual-bytes-v1"
MAX_INPUT_BYTES = 9000
MAX_OVERLAP_BYTES = 500
MAX_CONTEXT_BYTES = MAX_INPUT_BYTES // 2
MAX_BATCH_BYTES = 60_000
_WHITESPACE = re.compile(rb"[ \t\r\f\v]")


@dataclass(frozen=True)
class PlannedInput:
    index: int
    kind: str
    text: str
    body_start: int  # UTF-8 byte offsets, including overlap
    body_end: int
    overlap_bytes: int
    split_kind: str

    def fingerprint(self, model: str, dimensions: int) -> str:
        config = json.dumps(
            {
                "policy": EMBEDDING_INPUT_POLICY,
                "model": model,
                "dimensions": dimensions,
                "input_type": "document",
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(config.encode() + b"\0" + self.text.encode()).hexdigest()


def _codepoint_boundary(data: bytes, offset: int) -> int:
    while 0 < offset < len(data) and data[offset] & 0xC0 == 0x80:
        offset -= 1
    return offset


def plan_inputs(
    body: str,
    context: str = "",
    *,
    max_bytes: int = MAX_INPUT_BYTES,
    overlap_bytes: int = MAX_OVERLAP_BYTES,
) -> Iterator[PlannedInput]:
    """Yield exact body slices; context, separators and overlap count toward the cap.

    Reconstruct body bytes by taking each input's slice after the previous end.
    Work and allocation are linear in body size; no repeated encoding of its tail.
    """
    if max_bytes < 4 or overlap_bytes < 0:
        raise ValueError("Invalid embedding byte limits")
    data = body.encode()
    if not body.strip():
        return
    if len(context.encode()) > min(MAX_CONTEXT_BYTES, max_bytes // 2):
        raise ValueError("Embedding context exceeds half of the input byte budget")
    budget = max_bytes - len(context.encode())
    if budget < len(body[0].encode()):
        raise ValueError("Embedding context leaves no room for body text")
    if len(data) <= budget:
        yield PlannedInput(0, "section", context + body, 0, len(data), 0, "direct")
        return
    overlap_limit = min(overlap_bytes, budget // 2)
    start = previous_end = index = 0
    while previous_end < len(data):
        end = _codepoint_boundary(data, min(len(data), start + budget))
        if end <= previous_end:
            start = previous_end  # drop overlap to fit the next codepoint
            end = _codepoint_boundary(data, min(len(data), start + budget))
        if end <= previous_end:
            raise ValueError("Embedding context leaves no room for the next codepoint")
        split_kind = "codepoint"
        if end == len(data):
            split_kind = "end"
        else:
            window = data[previous_end:end]
            for separator, kind in ((b"\n\n", "paragraph"), (b"\n", "newline")):
                found = window.rfind(separator)
                if found >= 0 and window[: found + len(separator)].strip():
                    end = previous_end + found + len(separator)
                    split_kind = kind
                    break
            else:
                matches = list(_WHITESPACE.finditer(window))
                if matches and window[: matches[-1].end()].strip():
                    end = previous_end + matches[-1].end()
                    split_kind = "whitespace"
        yield PlannedInput(
            index,
            "chunk",
            context + data[start:end].decode(),
            start,
            end,
            previous_end - start,
            split_kind,
        )
        previous_end = end
        index += 1
        start = _codepoint_boundary(data, max(0, end - overlap_limit))
        # Snap forward, never backward past the overlap bound.
        while start < end and end - start > overlap_limit:
            start += 1
            while start < end and data[start] & 0xC0 == 0x80:
                start += 1
        window = data[start:end]
        found = None
        for separator in (b"\n\n", b"\n"):
            pos = window.find(separator)
            if pos >= 0:
                found = start + pos + len(separator)
                break
        if found is None:
            match = _WHITESPACE.search(window)
            found = start + match.end() if match else end
        start = found
