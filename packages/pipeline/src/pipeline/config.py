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

# eCFR (Federal Regulations)
ECFR_API_BASE = "https://www.ecfr.gov/api/versioner/v1"
ECFR_CACHE_DIR = PROJECT_ROOT / "data" / "ecfr-cache"
ECFR_CACHE_MAX_AGE_DAYS = 90
CFR_PARTS = [
    # 42 CFR — Medicaid, CHIP, Medicare (referenced by NC Medicaid policies)
    *[(42, p) for p in [
        405, 409, 410, 411, 412, 413, 418,
        430, 431, 432, 433, 434, 435, 436, 438,
        440, 441, 442, 447, 455, 456, 457,
        460, 482, 483, 484, 485, 488, 489,
    ]],
    # 45 CFR — HHS administrative rules, nondiscrimination, health insurance
    # Note: Part 74 is [Reserved] (superseded by Part 75 in 2014).
    # Part 75 also not available via eCFR API. Part 248 doesn't exist in Title 45.
    *[(45, p) for p in [
        16, 92, 95,
        144, 146, 147, 155, 156, 158, 164, 170, 171,
        233,
    ]],
]
