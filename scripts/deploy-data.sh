#!/usr/bin/env bash
set -euo pipefail

# Load pipeline data into a remote Neo4j instance (e.g., Railway production).
#
# Usage:
#   NEO4J_HOST=<host:port> npm run deploy-data
#
# Prerequisites:
#   1. In Railway dashboard, go to neo4j service > Settings > Networking
#   2. Enable TCP Proxy — this gives you a public host:port
#   3. After migration completes, disable the TCP Proxy

if [ -z "${NEO4J_HOST:-}" ]; then
  echo "Usage: NEO4J_HOST=<railway-tcp-proxy-host:port> npm run deploy-data"
  echo ""
  echo "Steps:"
  echo "  1. In Railway dashboard, go to neo4j service > Settings > Networking"
  echo "  2. Enable TCP Proxy (this gives you a public host:port)"
  echo "  3. Run: NEO4J_HOST=<host:port> npm run deploy-data"
  echo "  4. After migration, disable the TCP Proxy"
  exit 1
fi

# Read production Neo4j password from Railway env vars
NEO4J_PASSWORD=$(railway variables -s neo4j --kv 2>/dev/null | grep '^NEO4J_AUTH=' | cut -d/ -f2-)
if [ -z "${NEO4J_PASSWORD:-}" ]; then
  echo "Error: Could not read NEO4J_AUTH from Railway. Are you logged in? (railway login)"
  exit 1
fi

cd packages/pipeline

export NEO4J_URI="bolt://${NEO4J_HOST}"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD

echo "==> Targeting Neo4j at $NEO4J_URI"
echo ""

echo "==> [1/10] Creating schema (constraints + indexes)..."
.venv/bin/python -m pipeline.cli schema

echo "==> [2/10] Loading parsed documents into Neo4j..."
.venv/bin/python -m pipeline.cli load --reset

echo "==> [3/10] Ingesting federal CFR regulations..."
.venv/bin/python -m pipeline.cli ingest-cfr

echo "==> [4/10] Ingesting Social Security Act titles..."
.venv/bin/python -m pipeline.cli ingest-ssa

echo "==> [5/10] Extracting cross-references..."
.venv/bin/python -m pipeline.cli extract-refs

echo "==> [6/10] Detecting amendment relationships..."
.venv/bin/python -m pipeline.cli detect-amendments

echo "==> [7/10] Generating vector embeddings (this takes a while)..."
.venv/bin/python -m pipeline.cli embed

echo "==> [8/10] Seeding policy concepts..."
.venv/bin/python -m pipeline.cli seed-concepts

echo "==> [9/10] Linking concepts to sections..."
.venv/bin/python -m pipeline.cli link-concepts

echo "==> [10/10] Final stats..."
.venv/bin/python -m pipeline.cli stats

echo ""
echo "==> Done! Remember to disable the TCP Proxy in Railway dashboard."
