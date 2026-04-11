# Policy Number Grounding Check — Design Spec

## Context

The NC Medicaid Navigator agent can cite policy numbers that don't exist in any retrieved evidence (e.g., MA-2265, MA-1200). The existing HallucinationVerifier relies on a GPT-5.4-mini critic to catch unsupported claims, but this model fails at absence detection — noticing that a policy number is *not* in 120K chars of source text. This is a known limitation: the HalluGraph paper (arXiv 2512.01659) found deterministic entity matching achieves AUC 0.84–0.94 on legal tasks vs 0.54–0.60 for semantic similarity baselines.

For a legal-aid tool, fabricated policy citations are among the most dangerous hallucinations. This fix adds a deterministic pre-scan that identifies ungrounded policy numbers and injects them into the verifier prompt so the LLM can act on them reliably.

## Design

### Single file change

`packages/agent/src/processors/hallucination-verifier.ts`

### New exported functions

#### `extractPolicyNumbers(text: string): Set<string>`

Regex-extracts and normalizes policy numbers from any text. Patterns:

| Document type | Regex | Normalization | Examples |
|---|---|---|---|
| DHHS policies | `\bMA-\d{3,4}\b` | as-is | MA-2250, MA-2280 |
| Federal regulations | `\b(\d{1,2})\s*CFR\s*(?:Part\s*)?(\d+)` | `{title}-CFR-{part}` | 42-CFR-440 |
| Clinical policies | `(?:Clinical Coverage Policy\|CCP)\s*([\dA-Z][\w-]*)` | captured group | 3K-2, 1F, 10A |
| Federal statutes | `SSA[\s-]*Title[\s-]*([IVXLC]+\|\d+)` | `SSA-Title-{num}` | SSA-Title-XIX |

Case-insensitive matching. All results normalized to uppercase.

#### `findUngroundedPolicyNumbers(answerText: string, sourceText: string): string[]`

1. Calls `extractPolicyNumbers` on both texts
2. Returns the set difference: policy numbers in the answer but not in the sources
3. Returns a sorted array for deterministic output

### Integration point

Inside `verifyAnswer`, before the `generateObject` call. If `findUngroundedPolicyNumbers` returns a non-empty list, append to the user message:

```
## UNGROUNDED POLICY REFERENCES
The following policy numbers appear in the ANSWER but NOT in any SOURCE DOCUMENT: MA-2265, MA-1200.
These references have no supporting evidence and must be flagged as unsupported in your verification.
```

### What doesn't change

- `VerificationSchema` — same fields
- `VERIFIER_PROMPT` — same text
- `processOutputStep` flow — same lifecycle
- Correction/rewrite path — same behavior

The verifier LLM naturally includes ungrounded policy numbers in `unsupportedClaims` and wraps them with `[unverified: ...]` in `correctedAnswer` because the prompt already instructs it to flag unsupported claims.

### Edge cases

- **Partial number matches**: `MA-225` inside `MA-2250` — word boundary `\b` in regex prevents this
- **Policy numbers in disclaimers**: "I could not find MA-2265" — the verifier LLM handles this contextually (disclaimers are not factual claims)
- **Cross-referenced policy numbers in content**: If MA-2250's retrieved content says "Refer to MA-2230", `extractPolicyNumbers` runs on the full source text including section content, so MA-2230 is in the source set. This is correct: a cross-reference in retrieved evidence grounds the mention.
- **Empty answer or sources**: Returns empty array, no augmentation — existing flow proceeds unchanged

## Testing

Unit tests for `extractPolicyNumbers`:
- Each pattern type (MA, CFR, CCP, SSA)
- Case insensitivity
- No partial matches
- Multiple occurrences deduplicated

Unit tests for `findUngroundedPolicyNumbers`:
- All grounded → empty array
- Some ungrounded → correct delta
- None in answer → empty array
- Empty source text → all answer policy numbers returned

Integration test:
- Mock `verifyAnswer` with an answer containing MA-2265 (fabricated) alongside MA-2250 (grounded) and source text that only mentions MA-2250
- Verify the augmented prompt includes the UNGROUNDED POLICY REFERENCES section with MA-2265
- Verify MA-2265 appears in `unsupportedClaims`

## References

- HalluGraph (arXiv 2512.01659): Entity Grounding metric validates deterministic entity matching for legal RAG
- Stanford Legal RAG study: Documents 17–33% hallucination rates in Lexis/Westlaw despite RAG, including fabricated provisions of law
- Two-Level Verification pattern (Sattar 2026): Level 1 deterministic checks before Level 2 critic LLM
