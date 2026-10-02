---
title: Railway TCP Proxy Automation
summary: GraphQL v2 TCP proxy automation for Railway production Neo4j with create/delete/list operations, token handling, and cleanup guarantees.
tags: []
related: [agent_architecture/context/ws7_customer_readiness_weekly_refresh.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/railway_pr6_corpus_operations.md]
keywords: []
createdAt: '2026-07-10T19:05:11.484Z'
updatedAt: '2026-07-10T19:05:11.484Z'
---
## Reason
Document the GraphQL-based proxy lifecycle and authentication constraints used by the weekly refresh deploy path.

## Raw Concept
**Task:**
Document Railway TCP proxy automation for production Neo4j

**Changes:**
- Added create/delete/list shell commands around Railway GraphQL v2
- Added token fallback from ops.env to Railway CLI session config
- Added post-delete verification that no proxies remain

**Files:**
- scripts/ops/railway-tcp-proxy.sh

**Flow:**
create -> GraphQL mutation -> capture domain and port -> strip trailing dot -> use proxy -> delete -> confirm no proxies remain

**Timestamp:** 2026-07-10T19:03:07.746Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The script wraps Railway GraphQL v2 mutations in a small shell CLI with create, delete, and list subcommands. It centralizes auth token resolution and JSON parsing so the deploy flow can temporarily open bolt and then close it safely.

### Dependencies
Depends on curl and jq plus either RAILWAY_ACCESS_TOKEN or the Railway CLI config file. It targets the production environment and Neo4j service IDs used by the weekly refresh job.

### Highlights
The proxy is treated as a transient deployment aid rather than a persistent service. Deletion is defensive: it iterates every proxy ID, verifies each delete mutation succeeded, and then checks that the service has no remaining proxies.

### Rules
Usage: scripts/ops/railway-tcp-proxy.sh create   → prints "host:port" on stdout. Usage: scripts/ops/railway-tcp-proxy.sh delete   → removes ALL proxies on the service. Usage: scripts/ops/railway-tcp-proxy.sh list     → prints existing proxies.

### Examples
Example create output is host:port. Example delete flow logs each deleted proxy id and exits nonzero if any proxy remains.

## Facts
- **railway_graphql_endpoint**: The Railway GraphQL v2 endpoint is https://backboard.railway.com/graphql/v2. [environment]
- **railway_proxy_mutations**: tcpProxyCreate and tcpProxyDelete mutations are used to manage the proxy. [project]
- **railway_proxy_create_output**: The create command prints host:port on stdout. [project]
- **railway_proxy_delete_semantics**: The delete command removes all proxies on the service and post-checks that zero proxies remain. [project]
- **railway_proxy_list_semantics**: The list command prints existing proxies. [project]
- **railway_token_source_order**: Auth prefers RAILWAY_ACCESS_TOKEN from ops.env and falls back to ~/.railway/config.json .user.accessToken. [environment]
- **railway_proxy_domain_cleanup**: The proxy domain returned by Railway includes a trailing dot that must be stripped before use. [environment]
- **railway_proxy_exposure**: The proxy exposes bolt publicly and should exist only for the duration of deploy-data. [other]
