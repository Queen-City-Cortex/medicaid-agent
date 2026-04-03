---
children_hash: efad9d1546114c6c1a64076f2022a143561803ee585628c0a0cb1b1f6de00ad7
compression_ratio: 0.5066666666666667
condensation_order: 1
covers: [hallucination_verifier_processor.md]
covers_token_total: 975
summary_level: d1
token_count: 494
type: summary
---
## Hallucination Verifier Processor (qa/hallucination_verifier_processor.md)
- **Purpose & Task**: Documents the HallucinationVerifier processor that intercepts final NC Medicaid answers and runs a structured two-step verification—first relevance to the original question, then factual accuracy against retrieved policy sources—before optionally rewriting the assistant response.
- **Key Behavioral Flow**: `getConfig()` enables the verifier with model/limit settings → `processOutputStep` triggers only on the final assistant message with `finishReason: stop`, no pending tool calls, and non-empty text → extract the user question and tool-based sources → buildSourceText (cited sources prioritized, uncited appended, truncated at `maxSourceChars` with notice) → call `verifyAnswer(question, text, sourceText)` using the extended schema → apply `verification.correctedAnswer` through `writer.custom` immediately when verification flags relevance issues, unsupported claims, or unsupported verification.
- **Structural Components**: Defines verifier configuration, evidence-source interfaces, metadata formatters, dedicated SourceEntry builders for each evidence tool (getSection, getDocument, getAmendments, lookupPolicy, followReferences), a buildSourceText helper, the Zod schema extension, and the `HallucinationVerifier` implementation of `Processor.processOutputStep`.
- **Dependencies**: Leverages `generateObject` (ai), `createOpenAI` (@ai-sdk/openai), Zod validation, Mastra core processors/memory types, and `writer.custom` for emitting `data-verification-rewrite`.
- **Highlights & Rules**: Emphasizes the two-stage relevance+fact check, schema fields (`supported`, `relevant`, `unsupportedClaims`, `relevanceIssues`, `correctedAnswer`), char-limited prioritized source summary, and policy of applying corrections immediately without retrying. Verification is strictly limited to final responses, stopping further processing if the check is not supported or fails.