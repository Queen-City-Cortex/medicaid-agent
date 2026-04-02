# Topic: pipeline_detection

## Overview
Describes the amendment detection process in packages/pipeline/src/pipeline/references/amendments.py, including signal section detection, improved sentence boundary handling, and AMENDS edge writing.

## Key Concepts
- MA-series and SPA regex extraction
- Signal vs. fallback section scanning
- Sentence boundary heuristics for MA references
- Batched AMENDS edge creation and document status marking

## Related Topics
- agent_architecture/neo4j_tool_output_validation - for validating graph writes
