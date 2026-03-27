from pathlib import Path
import os

# Project root is packages/pipeline/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Crawler paths (sibling package in monorepo)
CRAWLER_DATA_DIR = PROJECT_ROOT.parent / "crawler" / "data" / "documents"
CRAWLER_DB_PATH = PROJECT_ROOT.parent / "crawler" / "data" / "crawler.db"

# Pipeline output
PARSED_DATA_DIR = PROJECT_ROOT / "data" / "parsed"

# Neo4j
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "medicaid-dev")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

# Embedding
EMBEDDING_MODEL = "voyage-law-2"
EMBEDDING_DIMENSIONS = 1024
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")

# LLM (optional, for cross-reference extraction pass 2)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LLM_MODEL = "claude-haiku-4-5-20251001"

# Processing
PARSE_BATCH_SIZE = 10
EMBED_BATCH_SIZE = 128

# Source type directory mapping (must match crawler's SOURCE_TYPE_DIRS)
SOURCE_TYPE_DIRS = {
    "clinical_policy": "clinical-policies",
    "bulletin": "bulletins",
    "state_plan_amendment": "state-plan-amendments",
    "waiver": "waivers",
}
