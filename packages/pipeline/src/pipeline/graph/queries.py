"""Reusable Cypher query templates."""

MERGE_DOCUMENT = """
MERGE (d:Document {id: $id})
SET d.title = $title,
    d.document_type = $document_type,
    d.policy_number = $policy_number,
    d.category = $category,
    d.status = $status,
    d.source_url = $source_url,
    d.local_path = $local_path,
    d.pdf_path = $pdf_path,
    d.page_count = $page_count,
    d.section_count = $section_count,
    d.effective_date = $effective_date,
    d.source_modified_date = $source_modified_date,
    d.retrieved_at = $retrieved_at,
    d.authority_tier = $authority_tier,
    d.answer_role = $answer_role,
    d.source_format = $source_format,
    d.answer_ready = $answer_ready,
    d.corpus_bucket = $corpus_bucket,
    d.variant_group = $variant_group,
    d.variant_date = $variant_date,
    d.retrieval_ready = $retrieval_ready,
    d.archived = $archived,
    d.source_checked_at = CASE
      WHEN $source_checked_at IS NULL THEN NULL
      ELSE datetime($source_checked_at)
    END,
    d.source_changed_at = CASE
      WHEN $source_changed_at IS NULL THEN NULL
      ELSE datetime($source_changed_at)
    END,
    d.last_indexed = datetime()
RETURN d
"""

DELETE_DOCUMENT = """
MATCH (d:Document {id: $doc_id})
OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
OPTIONAL MATCH (s)-[:HAS_CHUNK]->(chunk:Chunk)
WITH d, collect(DISTINCT s) AS sections, collect(DISTINCT chunk) AS chunks
FOREACH (item IN chunks | DETACH DELETE item)
FOREACH (item IN sections | DETACH DELETE item)
DETACH DELETE d
"""

MERGE_SECTIONS_BATCH = """
UNWIND $sections AS section
MERGE (s:Section {id: section.id})
WITH s,section,s.embedding_source_epoch = $source_epoch AS same_epoch
SET s.embedding = CASE WHEN same_epoch THEN s.embedding ELSE NULL END,
    s.embedding_plan_hash = CASE WHEN same_epoch THEN s.embedding_plan_hash ELSE NULL END,
    s.embedding_input_count = CASE WHEN same_epoch THEN s.embedding_input_count ELSE NULL END,
    s.embedding_plan_source_epoch = CASE WHEN same_epoch THEN s.embedding_plan_source_epoch ELSE NULL END,
    s.embedding_source_epoch = $source_epoch,
    s.document_id = section.document_id,
    s.section_number = section.section_number,
    s.title = section.title,
    s.level = section.level,
    s.content_text = section.content_text,
    s.content_length = section.content_length,
    s.has_tables = section.has_tables,
    s.has_definitions = section.has_definitions,
    s.federal_register_cite = section.federal_register_cite,
    s.last_revised = section.last_revised,
    s.jev_section_roles = null
WITH s,same_epoch
OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
WITH s,same_epoch,collect(ch) AS chunks
FOREACH (stale IN CASE WHEN same_epoch THEN [] ELSE chunks END | DETACH DELETE stale)
"""

MERGE_HAS_SECTION_BATCH = """
MATCH (d:Document {id: $doc_id})
UNWIND $section_ids AS sec_id
MATCH (s:Section {id: sec_id})
MERGE (d)-[:HAS_SECTION]->(s)
"""

DELETE_STALE_DOCUMENT_SECTIONS = """
MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
WHERE NOT s.id IN $section_ids
OPTIONAL MATCH (s)-[:HAS_CHUNK]->(chunk:Chunk)
WITH s, collect(chunk) AS chunks
FOREACH (chunk IN chunks | DETACH DELETE chunk)
DETACH DELETE s
"""

CLEAR_DOCUMENT_SECTION_STRUCTURE = """
MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
MATCH (s)-[r:PARENT_OF|NEXT_SIBLING]-(:Section)
DELETE r
"""

GET_SECTION_CONTENT_BATCH = """
UNWIND $section_ids AS section_id
MATCH (s:Section {id: section_id})
RETURN s.id AS id, s.content_text AS content_text
"""

CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH = """
UNWIND $section_ids AS section_id
MATCH (s:Section {id: section_id})
SET s.embedding = NULL,s.embedding_plan_hash=NULL,
    s.embedding_input_count=NULL,s.embedding_plan_source_epoch=NULL
WITH s
OPTIONAL MATCH (s)-[:HAS_CHUNK]->(chunk:Chunk)
WITH collect(chunk) AS chunks
FOREACH (chunk IN chunks | DETACH DELETE chunk)
"""

MERGE_PARENT_OF_BATCH = """
UNWIND $pairs AS pair
MATCH (parent:Section {id: pair.parent_id})
MATCH (child:Section {id: pair.child_id})
MERGE (parent)-[:PARENT_OF]->(child)
"""

MERGE_NEXT_SIBLING_BATCH = """
UNWIND $pairs AS pair
MATCH (prev:Section {id: pair.prev_id})
MATCH (next:Section {id: pair.next_id})
MERGE (prev)-[:NEXT_SIBLING]->(next)
"""

# Reference resolution is recomputed from section text on every run, so edges a
# corrected resolver no longer produces must not survive a re-merge.
DELETE_REGEX_REFERENCE_EDGES = """
MATCH (:Section)-[r:REFERENCES|REFERENCES_DOCUMENT {extraction_method: 'regex'}]->()
DELETE r
"""

MERGE_REFERENCES_BATCH = """
UNWIND $edges AS edge
MATCH (src:Section {id: edge.source_id})
MATCH (tgt:Section {id: edge.target_id})
MERGE (src)-[r:REFERENCES]->(tgt)
SET r.reference_text = edge.reference_text,
    r.reference_type = edge.reference_type,
    r.extraction_method = edge.extraction_method
"""

MERGE_REFERENCES_DOCUMENT_BATCH = """
UNWIND $edges AS edge
MATCH (src:Section {id: edge.source_id})
MATCH (tgt:Document {id: edge.target_id})
MERGE (src)-[r:REFERENCES_DOCUMENT]->(tgt)
SET r.reference_text = edge.reference_text,
    r.extraction_method = edge.extraction_method
"""

MERGE_CONCEPT = """
MERGE (c:PolicyConcept {id: $id})
SET c.name = $name,
    c.aliases = $aliases,
    c.category = $category
RETURN c
"""

# Note: Concept-section edges use dynamic Cypher in linker.py (relationship type varies)

# Stats queries
COUNT_NODES = """
MATCH (n)
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt ORDER BY label
"""

COUNT_EDGES = """
MATCH ()-[r]->()
WITH type(r) AS rel_type, count(r) AS cnt
RETURN rel_type, cnt ORDER BY rel_type
"""

MERGE_SUPERSEDED_BY_BATCH = """
UNWIND $edges AS edge
MATCH (old:Document {id: edge.source_id})
MATCH (new:Document {id: edge.target_id})
MERGE (old)-[r:SUPERSEDED_BY]->(new)
SET r.effective = edge.effective,
    r.reason = edge.reason
"""

MERGE_AMENDS_BATCH = """
UNWIND $pairs AS pair
MATCH (src:Document {id: pair.source_id})
MATCH (tgt:Document {id: pair.target_id})
MERGE (src)-[r:AMENDS]->(tgt)
SET r.change_description = pair.change_description
"""

SET_DOCUMENT_STATUS_BATCH = """
UNWIND $doc_ids AS doc_id
MATCH (d:Document {id: doc_id})
SET d.status = $status
"""

# Serialize source rewrites, enrichment and release stamping on one graph.
LOCK_CORPUS_MUTATION = "MERGE (lock:CorpusMutationLock {id: 'current'}) SET lock.sequence = coalesce(lock.sequence, 0) + 1"
CHECK_ANNOTATED_RELEASE = "MATCH (r:CorpusRelease {id: 'current'}) WHERE r.jev_annotation_digest IS NOT NULL RETURN r.release_id AS release_id"
INVALIDATE_JEV_ANNOTATION = "MATCH (m:JevAnnotation {id: 'current'}) REMOVE m.digest"
