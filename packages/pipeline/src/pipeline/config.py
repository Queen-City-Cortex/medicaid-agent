from pathlib import Path
import os

from dotenv import load_dotenv
from pipeline.corpus_manifest import CORPUS_MANIFEST

# Project root is packages/pipeline/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Monorepo root is two levels above PROJECT_ROOT (packages/pipeline/ → packages/ → root)
_MONOREPO_ROOT = PROJECT_ROOT.parent.parent
load_dotenv(_MONOREPO_ROOT / ".env", override=False)

_CORPUS_DATA_ROOT_VALUE = os.environ.get("CORPUS_DATA_ROOT", "").strip()
CORPUS_DATA_ROOT = (
    Path(_CORPUS_DATA_ROOT_VALUE).expanduser().resolve()
    if _CORPUS_DATA_ROOT_VALUE
    else None
)

# Crawler paths (sibling package in monorepo)
_CRAWLER_ROOT = (
    CORPUS_DATA_ROOT / "crawler"
    if CORPUS_DATA_ROOT
    else PROJECT_ROOT.parent / "crawler" / "data"
)
CRAWLER_DATA_DIR = _CRAWLER_ROOT / "documents"
CRAWLER_DB_PATH = _CRAWLER_ROOT / "crawler.db"

# Pipeline output
PIPELINE_DATA_DIR = (
    CORPUS_DATA_ROOT / "pipeline"
    if CORPUS_DATA_ROOT
    else PROJECT_ROOT / "data"
)
PARSED_DATA_DIR = PIPELINE_DATA_DIR / "parsed"
AUDIT_DATA_DIR = PIPELINE_DATA_DIR / "audits"

# Neo4j
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "medicaid-dev")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

# Embedding
# Overridable via env so the A/B eval harness can build a candidate corpus
# (e.g. voyage-4-large at 2048 dims) in an isolated Neo4j container without
# editing source. The query side (agent VOYAGE_MODEL) MUST match EMBEDDING_MODEL
# or cosine scores are meaningless. EMBEDDING_DIMENSIONS drives index creation
# in indexer.ensure_vector_index(), so it must match the model's output width.
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "voyage-4")
EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "1024"))
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")

# LLM (optional, for cross-reference extraction pass 2)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LLM_MODEL = "claude-haiku-4-5-20251001"

# Processing
EMBED_BATCH_SIZE = 128
LLM_REF_BATCH_SIZE = 30
GRAPH_BATCH_SIZE = 500
EMBED_WRITE_BATCH_SIZE = 100

# Source type directory mapping (must match crawler's SOURCE_TYPE_DIRS)
SOURCE_TYPE_DIRS = {
    family.source_type: family.directory_name
    for family in CORPUS_MANIFEST.source_families
}
PARSE_SUPPORTED_FILE_FORMATS = frozenset(
    {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx", ".html"}
)

# eCFR (Federal Regulations)
ECFR_API_BASE = "https://www.ecfr.gov/api/versioner/v1"
ECFR_CACHE_DIR = PIPELINE_DATA_DIR / "ecfr-cache"
ECFR_CACHE_MAX_AGE_DAYS = 7
SSA_CACHE_MAX_AGE_DAYS = 30
# Agent (sibling package in monorepo)
AGENT_DIR = PROJECT_ROOT.parent / "agent"

# Evaluation harness
# Golden inputs are versioned with the image/commit. Only generated eval
# outputs belong on the persistent corpus-job volume.
GOLDEN_DATASET_PATH = PROJECT_ROOT / "data" / "golden" / "dataset.json"
GOLDEN_DATASET_SCHEMA = PROJECT_ROOT / "data" / "golden" / "dataset.schema.json"
EVAL_RESULTS_DIR = PIPELINE_DATA_DIR / "eval-results"
EVAL_DEFAULT_TOP_K = 10
EVAL_REGRESSION_THRESHOLD = 0.05  # 5% drop = regression flag
EVAL_JUDGE_MODEL = "claude-sonnet-4-6"

CFR_PARTS = [
    # 2 CFR — OMB / federal-wide grants. Part 200 is the Uniform Guidance
    # (Uniform Administrative Requirements, Cost Principles, and Audit
    # Requirements for Federal Awards) that Medicaid cross-references via
    # 42 CFR § 430.30(e). It replaces the former 45 CFR Part 75 / pre-2014
    # Part 74 codification, both of which are now [Reserved] in Title 45.
    *[(2, p) for p in [200]],
    # 42 CFR — Medicaid, CHIP, Medicare (referenced by NC Medicaid policies)
    *[(42, p) for p in [
        405, 409, 410, 411, 412, 413, 418,
        430, 431, 432, 433, 434, 435, 436, 438,
        440, 441, 442, 447, 455, 456, 457,
        460, 482, 483, 484, 485, 488, 489,
    ]],
    # 45 CFR — HHS administrative rules, nondiscrimination, health insurance.
    # Parts 74 and 75 are both [Reserved] as of late 2025 (HHS replaced its
    # Uniform Guidance implementation with cross-references to 2 CFR Part 200).
    # Part 248 doesn't exist.
    *[(45, p) for p in [
        16, 92, 95,
        144, 146, 147, 155, 156, 158, 164, 170, 171,
        233,
    ]],
]
