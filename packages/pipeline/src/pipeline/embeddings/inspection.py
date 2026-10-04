"""Offline measurements of the canonical pinned-token plan; no provider calls."""

from collections import Counter
import hashlib
import re

from pipeline.config import EMBEDDING_MODEL
from pipeline.embeddings.planner import plan_inputs, PLAN_VERSION
from pipeline.embeddings.chunker import MAX_CHUNK_CHARS
from pipeline.embeddings.tokenizer import count_tokens, CONTEXT_TOKENS, TOKENIZER_SHA256


def measure_embedding_plan(sections, model=EMBEDDING_MODEL, *, counter=count_tokens):
    totals = Counter(
        {
            key: 0
            for key in (
                "emptySections",
                "whitespaceOnlySections",
                "whitespaceOnlyUtf8Bytes",
                "whitespaceOnlyBodyInputs",
                "whitespaceOnlyNovelBodyInputs",
            )
        }
    )
    families = {}
    fingerprint = hashlib.sha256()
    for row in sections:
        body_text = row["body"]
        body = body_text.encode()
        if not row["body"].strip():
            if body:
                totals["whitespaceOnlySections"] += 1
                totals["whitespaceOnlyUtf8Bytes"] += len(body)
            totals["emptySections"] += 1
            continue
        family = families.setdefault(row["source_family"], Counter())
        totals["sections"] += 1
        family["sections"] += 1
        previous = 0
        rebuilt = hashlib.sha256()
        context_bytes = len((row["heading"] + "\n").encode())
        totals["maximumContextUtf8Bytes"] = max(
            totals["maximumContextUtf8Bytes"], context_bytes
        )
        family["rawBodyUtf8Bytes"] += len(body)
        family["nonWhitespaceNonPipeBodyBytesDiagnostic"] += len(
            re.sub(rb"[\s|]+", b"", body)
        )
        for index, part in enumerate(plan_inputs(row["heading"], body_text, model, counter=counter)):
            encoded = part.text.encode()
            source = encoded[context_bytes:]
            if (
                not part.body_start <= previous < part.body_end
                or source != body_text[part.body_start : part.body_end].encode()
                or len(part.text) > MAX_CHUNK_CHARS
                or part.tokens > CONTEXT_TOKENS
            ):
                raise ValueError(
                    f"Invalid lossless embedding plan: {row['section_id']}"
                )
            novel = body_text[previous:part.body_end].encode()
            totals["whitespaceOnlyBodyInputs"] += not source.decode().strip()
            totals["whitespaceOnlyNovelBodyInputs"] += not novel.decode().strip()
            rebuilt.update(novel)
            for bucket in (totals, family):
                bucket["embeddingInputs"] += 1
                bucket["inputCharacters"] += len(part.text)
                bucket["inputUtf8Bytes"] += len(encoded)
                bucket["overlapUtf8Bytes"] += len(body_text[part.body_start:previous].encode())
                bucket["localTokens"] += part.tokens
                bucket["repeatedContextUtf8Bytes"] += context_bytes
            totals["maximumInputUtf8Bytes"] = max(
                totals["maximumInputUtf8Bytes"], len(encoded)
            )
            totals["maximumInputCharacters"] = max(
                totals["maximumInputCharacters"], len(part.text)
            )
            totals["maximumInputTokens"] = max(totals["maximumInputTokens"], part.tokens)
            previous = part.body_end
            fingerprint.update(
                f"{row['section_id']}:{index}:".encode()
                + hashlib.sha256(encoded).digest()
            )
        if previous != len(body_text) or rebuilt.digest() != hashlib.sha256(body).digest():
            raise ValueError(f"Incomplete embedding plan: {row['section_id']}")
        totals["losslessPlanSections"] += 1
    return {
        **totals,
        "oversizedPlannedInputs": 0,
        "planVersion": PLAN_VERSION,
        "maximumAllowedInputCharacters": MAX_CHUNK_CHARS,
        "maximumAllowedInputTokens": CONTEXT_TOKENS,
        "planTextFingerprint": fingerprint.hexdigest(),
        "families": families,
        "tokenizerCalled": counter is count_tokens,
        "tokenizerSha256": TOKENIZER_SHA256 if counter is count_tokens else None,
        "embeddingsGenerated": False,
        "modelTokenLimitValidated": counter is count_tokens,
        "scope": "Exact stored section bodies with bounded repeated context and overlap",
    }
