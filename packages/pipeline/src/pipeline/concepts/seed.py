"""Seed PolicyConcept nodes into Neo4j."""

from pipeline.graph.connection import get_session
from pipeline.graph import queries


def slugify(name: str) -> str:
    """Convert a concept name to a slug for the ID."""
    return name.lower().replace("/", "-").replace(" ", "-").replace("(", "").replace(")", "")


SEED_CONCEPTS = [
    # Programs
    {"name": "CAP/DA", "aliases": ["Community Alternatives Program for Disabled Adults", "CAP DA", "CAPDA"], "category": "program"},
    {"name": "CAP/C", "aliases": ["Community Alternatives Program for Children"], "category": "program"},
    {"name": "NC Innovations Waiver", "aliases": ["Innovations", "1915(c) Innovations"], "category": "program"},
    {"name": "TBI Waiver", "aliases": ["Traumatic Brain Injury Waiver"], "category": "program"},
    {"name": "PACE", "aliases": ["Program of All-Inclusive Care for the Elderly"], "category": "program"},

    # Services
    {"name": "Personal Care Services", "aliases": ["PCS"], "category": "service"},
    {"name": "Private Duty Nursing", "aliases": ["PDN"], "category": "service"},
    {"name": "Home Health Services", "aliases": ["HHS"], "category": "service"},
    {"name": "Durable Medical Equipment", "aliases": ["DME"], "category": "service"},
    {"name": "Home Modifications", "aliases": [], "category": "service"},
    {"name": "Assistive Technology", "aliases": ["AT"], "category": "service"},
    {"name": "Respite Care", "aliases": ["respite"], "category": "service"},
    {"name": "Community Living and Supports", "aliases": ["CLS"], "category": "service"},

    # Processes
    {"name": "Prior Authorization", "aliases": ["prior approval", "PA", "pre-authorization"], "category": "process"},
    {"name": "Medical Necessity", "aliases": ["medically necessary"], "category": "process"},
    {"name": "Level of Care Determination", "aliases": ["LOC", "level of care"], "category": "process"},
    {"name": "Individual Support Plan", "aliases": ["ISP", "plan of care", "POC", "service plan"], "category": "process"},
    {"name": "EPSDT", "aliases": ["Early and Periodic Screening, Diagnostic and Treatment", "Health Check"], "category": "process"},
    {"name": "Fair Hearing", "aliases": ["appeal", "due process"], "category": "process"},

    # Eligibility
    {"name": "Institutional Level of Care", "aliases": ["nursing facility level of care", "ICF/IID level of care"], "category": "eligibility"},
    {"name": "Financial Eligibility", "aliases": ["income limits", "resource limits"], "category": "eligibility"},
    {"name": "Functional Eligibility", "aliases": ["functional criteria", "ADL limitations"], "category": "eligibility"},

    # Entities
    {"name": "LME-MCO", "aliases": ["Local Management Entity-Managed Care Organization"], "category": "entity"},
    {"name": "MCO", "aliases": ["Managed Care Organization"], "category": "entity"},
    {"name": "DHHS", "aliases": ["Department of Health and Human Services", "NC DHHS"], "category": "entity"},
    {"name": "CMS", "aliases": ["Centers for Medicare and Medicaid Services"], "category": "entity"},
]


def seed_concepts() -> int:
    """Load seed concepts into Neo4j. Returns count of concepts created."""
    count = 0
    with get_session() as session:
        for concept in SEED_CONCEPTS:
            concept_id = f"concept:{slugify(concept['name'])}"
            session.run(queries.MERGE_CONCEPT, {
                "id": concept_id,
                "name": concept["name"],
                "aliases": concept["aliases"],
                "category": concept["category"],
            })
            count += 1
    return count
