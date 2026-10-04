"""Offline plan measurements; never persist chunks or call a provider/tokenizer."""

from collections import Counter
import hashlib
import re

from pipeline.embeddings.chunker import (
    EMBEDDING_INPUT_POLICY,
    MAX_INPUT_BYTES,
    plan_inputs,
)


def measure_embedding_plan(sections):
    totals = Counter()
    families = {}
    splits = Counter()
    fingerprint = hashlib.sha256()
    for row in sections:
        body = row["body"].encode()
        if not body:
            totals["emptySections"] += 1
            continue
        family = families.setdefault(row["source_family"], Counter())
        totals["sections"] += 1
        family["sections"] += 1
        previous = 0
        rebuilt = hashlib.sha256()
        context_bytes = len(row["context"].encode())
        totals["maximumContextUtf8Bytes"] = max(
            totals["maximumContextUtf8Bytes"], context_bytes
        )
        family["rawBodyUtf8Bytes"] += len(body)
        family["nonWhitespaceNonPipeBodyBytesDiagnostic"] += len(
            re.sub(rb"[\s|]+", b"", body)
        )
        for part in plan_inputs(row["body"], row["context"]):
            encoded = part.text.encode()
            source = encoded[context_bytes:]
            if (
                not part.body_start <= previous < part.body_end
                or source != body[part.body_start : part.body_end]
                or len(encoded) > MAX_INPUT_BYTES
            ):
                raise ValueError(
                    f"Invalid lossless embedding plan: {row['section_id']}"
                )
            rebuilt.update(source[previous - part.body_start :])
            previous = part.body_end
            for bucket in (totals, family):
                bucket["embeddingInputs"] += 1
                bucket["inputCharacters"] += len(part.text)
                bucket["inputUtf8Bytes"] += len(encoded)
                bucket["overlapUtf8Bytes"] += part.overlap_bytes
                bucket["repeatedContextUtf8Bytes"] += context_bytes
            totals["maximumInputUtf8Bytes"] = max(
                totals["maximumInputUtf8Bytes"], len(encoded)
            )
            totals["maximumInputCharacters"] = max(
                totals["maximumInputCharacters"], len(part.text)
            )
            splits[part.split_kind] += 1
            fingerprint.update(
                f"{row['section_id']}:{part.index}:".encode()
                + hashlib.sha256(encoded).digest()
            )
        if previous != len(body) or rebuilt.digest() != hashlib.sha256(body).digest():
            raise ValueError(f"Incomplete embedding plan: {row['section_id']}")
        totals["losslessPlanSections"] += 1
    return {
        **totals,
        "oversizedPlannedInputs": 0,
        "policy": EMBEDDING_INPUT_POLICY,
        "maximumAllowedInputUtf8Bytes": MAX_INPUT_BYTES,
        "planTextFingerprint": fingerprint.hexdigest(),
        "families": families,
        "splitKinds": splits,
        "estimatedTokensAtThreeCharactersPerToken": totals["inputCharacters"] / 3,
        "estimatedTokensAtFiveCharactersPerToken": totals["inputCharacters"] / 5,
        "tokenizerCalled": False,
        "embeddingsGenerated": False,
        "modelTokenLimitValidated": False,
        "scope": "Exact stored section bodies with bounded repeated context and overlap",
    }
