"""Typed payloads for corpus graph writes."""

from dataclasses import dataclass
from typing import Literal


ReferenceEdgeType = Literal["REFERENCES", "REFERENCES_DOCUMENT"]
ConceptRelationshipType = Literal["COVERS", "DEFINES", "RESTRICTS"]


@dataclass(frozen=True)
class DocumentNode:
    id: str
    title: str
    document_type: str
    policy_number: str | None
    category: str | None
    status: str
    source_url: str
    local_path: str
    pdf_path: str
    page_count: int
    section_count: int
    effective_date: str | None
    source_modified_date: str | None = None
    retrieved_at: str | None = None
    authority_tier: str = "supporting"
    answer_role: str | None = None
    source_format: str | None = None
    answer_ready: bool = True
    corpus_bucket: str | None = None
    variant_group: str | None = None
    variant_date: str | None = None
    retrieval_ready: bool = True
    source_checked_at: str | None = None
    source_changed_at: str | None = None


@dataclass(frozen=True)
class SectionNode:
    id: str
    document_id: str
    section_number: str | None
    title: str | None
    level: int
    content_text: str
    content_length: int
    has_tables: bool
    has_definitions: bool
    parent_id: str | None = None
    prev_sibling_id: str | None = None
    # Federal Register citation history captured from eCFR `<CITA>` tags.
    # `federal_register_cite` is the full citation string (e.g. "[46 FR 48541,
    # Oct. 1, 1981, as amended at 50 FR 10026, Mar. 13, 1985; ...; 89 FR 40863,
    # May 10, 2024]"). `last_revised` is the ISO date of the most recent entry
    # in that list ("2024-05-10"). Both are None for non-CFR sections.
    federal_register_cite: str | None = None
    last_revised: str | None = None


@dataclass(frozen=True)
class DocumentBundle:
    document: DocumentNode
    sections: list[SectionNode]


@dataclass(frozen=True)
class ReferenceEdge:
    source_id: str
    target_id: str
    edge_type: ReferenceEdgeType
    reference_text: str
    extraction_method: str
    reference_type: str | None = None


@dataclass(frozen=True)
class AmendmentEdge:
    source_id: str
    target_id: str
    change_description: str


@dataclass(frozen=True)
class SupersessionEdge:
    """old Document --SUPERSEDED_BY--> new Document, with provenance."""
    source_id: str
    target_id: str
    effective: str | None
    reason: str | None


@dataclass(frozen=True)
class ConceptLink:
    section_id: str
    concept_id: str
    relationship_type: ConceptRelationshipType
