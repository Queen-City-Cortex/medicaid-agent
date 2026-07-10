---
children_hash: a48bbea68bb9dbe5b941383a5c4a0862d124b615cc11e8c612623c8014d81efe
compression_ratio: 0.3174454828660436
condensation_order: 1
covers: [context.md, curated_context.abstract.md, curated_context.md, curated_context.overview.md, curated_context_extraction_notes.abstract.md, curated_context_extraction_notes.overview.md, curated_operational_knowledge.abstract.md, curated_operational_knowledge.md, curated_operational_knowledge.overview.md, epsdt_exception_completeness_workstream_e.abstract.md, epsdt_exception_completeness_workstream_e.md, epsdt_exception_completeness_workstream_e.overview.md, mastra_upgrade_type_and_runtime_boundaries.md, policy_corpus_embedding_client_and_verifier_flow.md]
covers_token_total: 3210
summary_level: d1
token_count: 1019
type: summary
---
# d1 Structural Summary

## Context curation and operational knowledge
The `context` cluster documents the agent’s **single-pass RLM curation workflow** for turning compact context snapshots into durable knowledge. The shared pattern across `context.md`, `curated_context.md`, `curated_context_extraction_notes.md`, and `curated_operational_knowledge.md` is:

- **recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths**
- Prefer **single-pass processing** when the recon result indicates the context is small enough.
- **Do not print raw source text**; verification should rely on `result.applied[].filePath` instead of rereading files.
- Preserve context in the `.brv/context-tree` structure with **max depth 2** and domain/topic markdown organization.

Key drill-down entries:
- `curated_context_extraction_notes.*` — formalizes the RLM curation workflow and operational guardrails.
- `curated_operational_knowledge.*` — captures session-level workflow metadata, including facts like `curation_mode: single-pass` and `context_size: 5100 characters across 124 lines`.
- `curated_context.*` — records a concrete single-pass curation of a provided context snapshot into durable knowledge.

## EPSDT exception completeness
`epsdt_exception_completeness_workstream_e.*` preserves operational context for **EPSDT exception completeness (Workstream E)** as durable recall material.

Structural pattern:
- **source context -> fact extraction -> durable knowledge entry**
- Single curated knowledge entry, not a multi-part analysis
- Depends on the original context text supplied in the curation payload

This entry is primarily a stable reference point for later recall of the Workstream E context.

## Mastra upgrade and runtime boundaries
`mastra_upgrade_type_and_runtime_boundaries.md` documents a shared fix pattern for the **Mastra upgrade across tools, routes, and middleware**.

Core decisions and relationships:
- `Tool.execute` was adjusted to return `Promise<void | TOutput>`.
- Route and middleware handlers should use **`ContextWithMastra`** rather than the plain Hono `Context`.
- **Resource binding middleware runs after auth** so the authenticated user id can be copied into `MASTRA_RESOURCE_ID_KEY`.
- The fix pattern emphasizes keeping **vendored Hono types** from `@mastra/core` separate from the standalone `hono` package.

Drill-down facts:
- `packages/agent/tests/helpers/run-tool.ts` is the referenced file.
- The operational sequence is: **tool execution -> validation guard -> route handling with ContextWithMastra -> auth middleware sets user -> resource binding middleware copies user id**.

## Policy corpus embedding and verification pipeline
`policy_corpus_embedding_client_and_verifier_flow.md` captures the **policy-corpus embedding client plus answer verification flow**.

Important architecture:
- `createNeo4jPolicyCorpus` provides the client, with `embedQuery` built on `embedQueries`, and `policyCorpus` exposed as a singleton.
- Query batches are posted to **Voyage** using `VOYAGE_API_URL` and `VOYAGE_MODEL`.
- Verification produces a **single JSON telemetry line** after a `---VERIFIER---` marker.
- Outgoing text always undergoes **deterministic URL and quote sanitization**.

Verification behavior:
- Rewrite decisions are triggered for **unsupported**, **irrelevant**, **major relevance issue**, or **incomplete citations**.
- If verification is unavailable, a disclaimer is appended and critical details should be checked against **NC DHHS**.
- Telemetry uses stable snake_case fields such as `supported`, `relevant`, `citations_complete`, `confidence`, `severity`, and `verifier_unavailable`.

Referenced implementation files:
- `packages/agent/src/policy-corpus.ts`
- `packages/agent/src/processors/verifier/run.ts`

## Overall pattern
Across these entries, the main architectural theme is **durable operational knowledge capture**: compact context is curated into structured markdown, while implementation topics preserve **type boundaries, runtime sequencing, verification rules, and telemetry conventions**.