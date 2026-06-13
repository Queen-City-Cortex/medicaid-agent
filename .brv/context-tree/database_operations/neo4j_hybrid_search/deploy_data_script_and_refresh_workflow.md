---
title: Deploy Data Script and Refresh Workflow
summary: deploy-data.sh targets a remote Neo4j instance with confirmed destructive reload behavior, requiring explicit confirmation and Railway connectivity setup.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T03:20:47.904Z'
updatedAt: '2026-06-13T03:20:47.904Z'
---
## Reason
Document the deployment script usage and its step-by-step workflow

## Raw Concept
**Task:**
Document the deploy-data.sh remote Neo4j deployment procedure

**Changes:**
- Added explicit TCP proxy setup prerequisites
- Enforced confirmation before destructive graph wipe
- Outlined the 10-step pipeline from schema creation to final stats

**Files:**
- scripts/deploy-data.sh

**Flow:**
configure NEO4J_HOST -> read NEO4J_AUTH -> confirm wipe -> schema -> load --reset -> ingest-cfr -> ingest-ssa -> extract-refs -> detect-amendments -> embed -> seed-concepts -> link-concepts -> stats

**Timestamp:** 2026-06-13T03:20:13.123Z

## Narrative
### Structure
The shell script validates NEO4J_HOST, sources the password from Railway, prints destructive warnings, and then runs a fixed ten-step pipeline.

### Dependencies
Requires Railway CLI login and an enabled TCP proxy in Railway dashboard before connection can succeed.

### Highlights
The script is intended for remote Neo4j deployment and explicitly warns that step 2 drops all nodes and relationships before reloading.

### Rules
1. If NEO4J_HOST is missing, exit with usage instructions.
2. Use railway variables to read NEO4J_AUTH.
3. Refuse to wipe the graph without confirmation in non-interactive shells.
4. Step 2 runs load --reset and is destructive.
5. Disable the TCP proxy after migration completes.

### Examples
Interactive use requires typing wipe at the prompt unless --yes is provided.
