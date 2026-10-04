"""Shared pure embedding inputs for generation and offline inspection."""
from dataclasses import dataclass
import hashlib
from pipeline.embeddings.chunker import chunk_spans, MAX_CHUNK_CHARS
from pipeline.embeddings.tokenizer import count_tokens, CONTEXT_TOKENS, TOKENIZER_SHA256

PLAN_VERSION = 2


@dataclass(frozen=True)
class EmbeddingInput:
    text: str
    body_start: int
    body_end: int
    tokens: int

    @property
    def input_hash(self):
        return hashlib.sha256(self.text.encode()).hexdigest()


def plan_inputs(heading, body, model, counter=count_tokens):
    prefix = heading + "\n"
    capacity = MAX_CHUNK_CHARS - len(prefix)
    if capacity < 1 or counter(prefix, model) >= CONTEXT_TOKENS:
        raise ValueError("Context heading exceeds embedding input capacity")
    if not body:
        return

    def bounded(start, end):
        text = prefix + body[start:end]
        tokens = counter(text, model)
        if tokens <= CONTEXT_TOKENS:
            yield EmbeddingInput(text, start, end, tokens)
        elif end - start > 1:
            middle = start + (end - start) // 2
            yield from bounded(start, middle)
            yield from bounded(middle, end)
        else:
            raise ValueError("One source character exceeds embedding token capacity")

    for start, end in chunk_spans(body, capacity):
        yield from bounded(start, end)


def plan_hash(inputs, model, dimensions):
    digest = hashlib.sha256(f"{PLAN_VERSION}:{model}:{dimensions}:{TOKENIZER_SHA256}".encode())
    for item in inputs:
        digest.update(f"{item.body_start}:{item.body_end}:{item.input_hash}".encode())
    return digest.hexdigest()
