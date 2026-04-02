---
children_hash: d63ec10a408705d155c4c509490cc6a105fef9c009ae0f2108e1222a3ea0dbc0
compression_ratio: 0.6864406779661016
condensation_order: 1
covers: [context.md, neo4j_tool_output_validation.md]
covers_token_total: 826
summary_level: d1
token_count: 567
type: summary
---
# Neo4j Tool Output Validation (Level d1 Structural Summary)

- **Purpose & Scope**
  - Documents tooling in `packages/agent/src/tools/read.ts` that back Neo4j-backed agents reading policy sections/documents.
  - Focuses on normalization of numeric metadata and structural context navigation to keep downstream Zod validation reliable.

- **Key Architectural Decisions**
  - **Integer Normalization**: Every numeric property returned from Neo4j (e.g., `content_length`, `chars`) is converted from Neo4j `Integer` to plain JavaScript numbers via `toNumber()` before zod validation, ensuring `DocumentMetadataSchema` and section schemas accept the payload without silent retries (`neo4j_integer_return` / `neo4j_integer_conversion`).
  - **Container Heading Expansion**: `getSection` now checks if a section node lacks textual content; if so, it aggregates up to 6,000 characters from its child sections and appends a truncation note when more children remain, preventing agents from receiving empty sections (`section_container_expansion`).
  - **Structural Context Queries**: `getSectionContext` executes ordered queries for ancestors (by path length), children (by `section_number`), and siblings (following `NEXT_SIBLING` chains), documenting relationships so clients can navigate the document hierarchy confidently.

- **Flow Summary**
  - Inputs (`sectionId`/`documentId`) → `withSession` → Neo4j `session.run` queries → record collection → integer-to-number conversion → container/structural logic → schema validation → agent-facing payload.

- **Dependencies & Constraints**
  - Relies on `withSession`, `DocumentMetadataSchema`, `documentMetadataReturn`, and `mapDocumentMetadataRecord`.
  - Zod validation enforces numeric fields to be JS numbers, mandating the new conversion step.

- **Outcome Highlights**
  - Resolves previously silent validation errors caused by Neo4j `Integer` objects.
  - Improves agent experience on container headings by surface child text even when the heading itself is blank.
  - Provides clear structural navigation through documented ancestor/sibling/child ordering in `getSectionContext`.

Drill down into `context.md` for conceptual overview and `neo4j_tool_output_validation.md` for raw concept, flow, and fact-level details.