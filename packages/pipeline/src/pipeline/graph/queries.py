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
    d.authority_tier = $authority_tier,
    d.answer_role = $answer_role,
    d.source_format = $source_format,
    d.answer_ready = $answer_ready,
    d.corpus_bucket = $corpus_bucket,
    d.variant_group = $variant_group,
    d.variant_date = $variant_date,
    d.retrieval_ready = $retrieval_ready,
    d.last_indexed = datetime()
RETURN d
"""

MERGE_SECTION = """
MERGE (s:Section {id: $id})
SET s.document_id = $document_id,
    s.section_number = $section_number,
    s.title = $title,
    s.level = $level,
    s.content_text = $content_text,
    s.content_length = $content_length,
    s.has_tables = $has_tables,
    s.has_definitions = $has_definitions
RETURN s
"""

MERGE_SECTIONS_BATCH = """
UNWIND $sections AS section
MERGE (s:Section {id: section.id})
SET s.document_id = section.document_id,
    s.section_number = section.section_number,
    s.title = section.title,
    s.level = section.level,
    s.content_text = section.content_text,
    s.content_length = section.content_length,
    s.has_tables = section.has_tables,
    s.has_definitions = section.has_definitions,
    s.federal_register_cite = section.federal_register_cite,
    s.last_revised = section.last_revised
"""

MERGE_HAS_SECTION = """
MATCH (d:Document {id: $doc_id})
MATCH (s:Section {id: $sec_id})
MERGE (d)-[:HAS_SECTION]->(s)
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

CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH = """
UNWIND $section_ids AS section_id
MATCH (s:Section {id: section_id})
SET s.embedding = NULL
WITH s
OPTIONAL MATCH (s)-[:HAS_CHUNK]->(chunk:Chunk)
WITH collect(chunk) AS chunks
FOREACH (chunk IN chunks | DETACH DELETE chunk)
"""

MERGE_PARENT_OF = """
MATCH (parent:Section {id: $parent_id})
MATCH (child:Section {id: $child_id})
MERGE (parent)-[:PARENT_OF]->(child)
"""

MERGE_PARENT_OF_BATCH = """
UNWIND $pairs AS pair
MATCH (parent:Section {id: pair.parent_id})
MATCH (child:Section {id: pair.child_id})
MERGE (parent)-[:PARENT_OF]->(child)
"""

MERGE_NEXT_SIBLING = """
MATCH (prev:Section {id: $prev_id})
MATCH (next:Section {id: $next_id})
MERGE (prev)-[:NEXT_SIBLING]->(next)
"""

MERGE_NEXT_SIBLING_BATCH = """
UNWIND $pairs AS pair
MATCH (prev:Section {id: pair.prev_id})
MATCH (next:Section {id: pair.next_id})
MERGE (prev)-[:NEXT_SIBLING]->(next)
"""

MERGE_REFERENCES = """
MATCH (src:Section {id: $source_id})
MATCH (tgt:Section {id: $target_id})
MERGE (src)-[r:REFERENCES]->(tgt)
SET r.reference_text = $reference_text,
    r.reference_type = $reference_type,
    r.extraction_method = $extraction_method
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

MERGE_REFERENCES_DOCUMENT = """
MATCH (src:Section {id: $source_id})
MATCH (tgt:Document {id: $target_id})
MERGE (src)-[r:REFERENCES_DOCUMENT]->(tgt)
SET r.reference_text = $reference_text,
    r.extraction_method = $extraction_method
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

MERGE_CHUNK = """
MERGE (ch:Chunk {id: $id})
SET ch.section_id = $section_id,
    ch.chunk_index = $chunk_index,
    ch.content_text = $content_text,
    ch.content_length = $content_length
RETURN ch
"""

MERGE_CHUNKS_BATCH = """
UNWIND $chunks AS chunk
MERGE (ch:Chunk {id: chunk.id})
SET ch.section_id = chunk.section_id,
    ch.chunk_index = chunk.chunk_index,
    ch.content_text = chunk.content_text,
    ch.content_length = chunk.content_length
"""

MERGE_HAS_CHUNK = """
MATCH (s:Section {id: $section_id})
MATCH (ch:Chunk {id: $chunk_id})
MERGE (s)-[:HAS_CHUNK]->(ch)
"""

MERGE_HAS_CHUNK_BATCH = """
MATCH (s:Section {id: $section_id})
UNWIND $chunk_ids AS chunk_id
MATCH (ch:Chunk {id: chunk_id})
MERGE (s)-[:HAS_CHUNK]->(ch)
"""

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

FIND_DOCUMENT = """
MATCH (d:Document {policy_number: $policy_number})
RETURN d
"""

FIND_SECTIONS_BY_DOC = """
MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
RETURN s.id, s.section_number, s.title, s.level, s.content_length,
       collect(child.section_number) AS children
ORDER BY s.section_number
"""

MERGE_AMENDS = """
MATCH (src:Document {id: $source_id})
MATCH (tgt:Document {id: $target_id})
MERGE (src)-[:AMENDS]->(tgt)
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

SET_SECTION_EMBEDDINGS_BATCH = """
UNWIND $rows AS row
MATCH (s:Section {id: row.id})
SET s.embedding = row.embedding
"""

SET_CHUNK_EMBEDDINGS_BATCH = """
UNWIND $rows AS row
MATCH (ch:Chunk {id: row.id})
SET ch.embedding = row.embedding
"""
