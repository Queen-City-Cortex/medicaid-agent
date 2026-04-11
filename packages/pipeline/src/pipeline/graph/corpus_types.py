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
    authority_tier: str = "supporting"
    answer_role: str | None = None
    source_format: str | None = None
    answer_ready: bool = True
    corpus_bucket: str | None = None
    variant_group: str | None = None
    variant_date: str | None = None
    retrieval_ready: bool = True


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
class ConceptLink:
    section_id: str
    concept_id: str
    relationship_type: ConceptRelationshipType
