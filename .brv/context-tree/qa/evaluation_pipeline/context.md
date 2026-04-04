# Topic: evaluation_pipeline

## Overview
Describes the pipelines that score agent answers against golden data and verify cross-reference relationships for the Medicaid navigator QA suite.

## Key Concepts
- End-to-end answer evaluation with HTTP/CLI agent invocation
- Evidence fetching from Neo4j to feed the judge
- Cross-reference resolution checks using REFERENCES_DOCUMENT, AMENDS, and section REFERENCES paths
- Aggregator rules for excluding judge errors from metrics

## Related Topics
- qa/hallucination_verifier - for hallucination verifier processor details
- qa/playwright_e2e - for e2e infrastructure coverage
