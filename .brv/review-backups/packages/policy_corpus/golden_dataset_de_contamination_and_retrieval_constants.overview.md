- Describes a de-contamination pass on policy-corpus retrieval to remove memorized answer fragments and eval-specific shortcuts.
- Main changes include replacing HCWD limit history terms with topical HCWD income rule terms, removing a “01-14” document bonus, and dropping a hardcoded “5.4.3” section-number match from prior-auth quantity detection.
- Preserves legitimate domain knowledge, especially WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS for HCBS regulations, while distinguishing it from contamination.
- Explains the retrieval flow as query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking, emphasizing that Neo4j queryNodes(k) returns a global top-k and must be overscanned for coverage.
- Captures important constants such as VECTOR_OVERSCAN_FACTOR = 8, VECTOR_OVERSCAN_MAX = 200, and content/frame limits like MAX_CONTENT_CHARS and MAX_COMBINED_CHARS at 6000.
- Notes that the eval baseline (2.45) may have been partly memorized routing and should be re-baselined on a held-out slice before trusting deltas.

Structure / sections summary:
- Front matter with title/summary metadata.
- “Reason” states the purpose: capture anti-contamination changes and retrieval constants.
- “Raw Concept” summarizes the task, changes, files touched, retrieval flow, and timestamp.
- “Narrative” covers structure, dependencies, highlights, rules, and examples.
- “Facts” lists concrete constants, term sets, section numbers, and design decisions.

Notable entities, patterns, or decisions:
- Files referenced: packages/policy-corpus/src/internal/shared.ts and packages/policy-corpus/src/frame/context/routing.ts.
- Key term sets: HCWD_INCOME_RULE_TERMS, PRIOR_AUTH_QUANTITY_TERMS, and WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS.
- Pattern: topical-only scoring with overscan-based retrieval rather than verbatim answer matching.
- Decision: remove hardcoded policy-specific anchors that leak golden answers into retrieval logic.