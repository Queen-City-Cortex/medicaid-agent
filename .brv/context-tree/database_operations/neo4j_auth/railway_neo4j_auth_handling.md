---
title: Railway Neo4j Auth Handling
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T02:22:29.007Z'
updatedAt: '2026-04-02T02:22:29.007Z'
related: [database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md, database_operations/neo4j_auth/context.md]
---
## Raw Concept
**Task:**
Document the Neo4j authentication failure on Railway caused by a URL-encoded password and how it was remediated.

**Changes:**
- Rotated the Neo4j password to an alphanumeric-only value (***REDACTED***).
- Ran ALTER CURRENT USER SET PASSWORD through the bolt TCP proxy to apply the new password to the running instance.
- Captured that NEO4J_AUTH only sets the password on the first volume initialization.

**Flow:**
Railway deploy injects env vars -> + in NEO4J_PASSWORD becomes space -> connection fails -> switch to alphanumeric password -> run ALTER CURRENT USER SET PASSWORD via bolt proxy -> confirm connections succeed

**Timestamp:** 2026-04-02

## Narrative
### Structure
Railway always URL-decodes incoming environment variables, so characters such as "+" are interpreted as spaces before they reach Neo4j, which rejects the malformed password during authentication.

### Dependencies
Solution depends on the bolt TCP proxy for ALTER CURRENT USER SET PASSWORD because changing NEO4J_AUTH only affects brand-new volumes.

### Highlights
Rotated to an alphanumeric password that survives Railway decoding and applied it directly through Neo4j lifecycle commands so existing databases accepted the new credentials.

## Facts
- **railway_env_encoding**: Railway URL-decodes '+' characters in environment variables when injecting them into containers. [environment]
- **neo4j_auth_env**: NEO4J_AUTH env var only sets the password on first volume init and has no effect on existing databases. [environment]
- **neo4j_password_rotation**: Rotated Neo4j password via ALTER CURRENT USER SET PASSWORD through the bolt TCP proxy to the alphanumeric value ***REDACTED***. [project]
