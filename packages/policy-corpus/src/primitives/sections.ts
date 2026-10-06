import type {
  DocumentWithSectionsView,
  GetSectionOptions,
  SectionContextEntry,
  SectionContextView,
  SectionView,
  SessionExecutor,
  SessionRecordLike,
} from '../types.js';
import { documentMetadataReturn, mapDocumentMetadataRecord } from '../document-metadata.js';
import { CONTAINER_NOTE_LEAD } from '../internal/scoring-constants.js';
import {
  CONTAINER_SECTION_DEPTH,
  CONTAINER_SECTION_LIMIT,
  buildSectionView,
  compareSectionListing,
  mapDocumentSections,
  mapSectionContextEntry,
  sectionWindow,
  sectionWindowRequest,
  toCount,
} from '../internal/shared.js';

// getSectionContext returns a window, not the family: a flat federal part or
// a wide container has hundreds to thousands of siblings and children.
export const CONTEXT_SIBLING_WINDOW = 10;
// How far the sibling walk may travel to find that window. Federal loaders
// chain a whole document in reading order, so a statute section's subsections
// sit between it and the next section and must not use up the window.
export const CONTEXT_SIBLING_WALK_HOPS = 500;
export const CONTEXT_CHILD_LIMIT = 50;
// How many of a container's sections its note names before counting the rest.
const CONTAINER_LABELS_SHOWN = 20;

/** Maps a `{entries, total}` window row; no row means the section is unknown. */
function mapContextWindow(record: SessionRecordLike | undefined): { entries: SectionContextEntry[]; total: number } {
  if (!record) return { entries: [], total: 0 };
  const rows = (record.get('entries') as Array<{
    id: string;
    title: string | null;
    sectionNumber: string | null;
  }> | null) ?? [];
  return {
    entries: rows.map((row) => ({ id: row.id, title: row.title ?? null, sectionNumber: row.sectionNumber ?? null })),
    total: Math.max(0, toCount(record.get('total'))),
  };
}

/** One sub-section of a container heading: its "###" line and the size of its text. */
export interface ContainerPart {
  id: string;
  heading: string;
  chars: number;
}

export type ContainerPiece = { text: string } | { id: string; start: number; length: number };

/**
 * A container heading reads as one text: each part's "### heading" line, its
 * body and a blank line, in order. This cuts the window [offset, offset +
 * length) out of that text without holding any body: literal pieces are
 * sliced here and body pieces name the slice Neo4j must return. Positions
 * count Unicode characters, as `content_length` and Cypher `substring` do.
 */
export function planContainerWindow(
  parts: ContainerPart[],
  offset: number,
  length: number,
): { pieces: ContainerPiece[]; totalChars: number } {
  const pieces: ContainerPiece[] = [];
  const end = offset + length;
  let position = 0;
  const overlap = (size: number): { start: number; length: number } | null => {
    const from = Math.max(position, offset);
    const to = Math.min(position + size, end);
    const slice = to > from ? { start: from - position, length: to - from } : null;
    position += size;
    return slice;
  };
  const literal = (text: string) => {
    const characters = Array.from(text);
    const slice = overlap(characters.length);
    if (slice) pieces.push({ text: characters.slice(slice.start, slice.start + slice.length).join('') });
  };
  for (const part of parts) {
    literal(`### ${part.heading}\n`);
    const body = overlap(part.chars);
    if (body) pieces.push({ id: part.id, ...body });
    literal('\n\n');
  }
  return { pieces, totalChars: position };
}

/** One section of a document as the hierarchy sees it: no text, only its size. */
export interface HierarchySection {
  id: string;
  number: string | null;
  title: string | null;
  chars: number;
  /** The stored PARENT_OF link. */
  parentId: string | null;
}

/** "3.2.1" is [3, 2, 1]; a trailing ".0" marks a top-level section, so "3.0" is [3]. */
function numberPath(sectionNumber: string | null): string[] | null {
  if (!sectionNumber || !/^\d+(?:\.\d+)+$/.test(sectionNumber)) return null;
  const parts = sectionNumber.split('.');
  if (parts[parts.length - 1] === '0') parts.pop();
  return parts;
}

/**
 * The sections under a container, in reading order, from the stored links
 * and the section numbers together.
 *
 * Graphs loaded before the hierarchy fix parent each heading by Docling
 * depth, so an unnumbered heading such as "b. Reconstructive Surgery" adopted
 * the numbered sections after it: "4.2.2" hangs under it, not under "4.2".
 * The rules below read both graph shapes correctly:
 *  - a link from an unnumbered section to a numbered one is never followed;
 *  - a dotted-number section whose stored parent is missing, unnumbered or
 *    not a prefix of its number belongs to the one section in the document
 *    whose number is its nearest prefix, and to none when several share it
 *    (numbering that restarts in an attachment);
 *  - every other stored link is kept.
 * Sections with no text are passed through, not listed.
 */
export function containerDescendants(
  containerId: string,
  sections: HierarchySection[],
): { shown: HierarchySection[]; omitted: number; detachedHeadings: boolean; ambiguous: boolean } {
  const byId = new Map<string, HierarchySection>();
  for (const section of sections) if (!byId.has(section.id)) byId.set(section.id, section);
  const byNumber = new Map<string, HierarchySection[]>();
  for (const section of byId.values()) {
    const path = numberPath(section.number);
    if (path) byNumber.set(path.join('.'), [...(byNumber.get(path.join('.')) ?? []), section]);
  }

  // Numbered sections taken back from an unnumbered heading that adopted them.
  const reclaimed = new Set<string>();
  // A number that restarts (an attachment repeating 1.0) leaves a section with
  // two possible parents: it is given neither, and the read says so.
  let ambiguous = false;
  const parentOf = (section: HierarchySection): string | null => {
    const stored = section.parentId ? byId.get(section.parentId) : undefined;
    const path = numberPath(section.number);
    if (!path) return stored && !(section.number && !stored.number) ? stored.id : null;
    const storedPath = stored ? numberPath(stored.number) : null;
    if (stored && storedPath) {
      if (storedPath.length < path.length && storedPath.every((part, index) => part === path[index])) return stored.id;
    } else if (stored?.number) {
      return stored.id;
    }
    for (let length = path.length - 1; length >= 1; length -= 1) {
      const candidates = byNumber.get(path.slice(0, length).join('.'));
      if (!candidates) continue;
      if (candidates.length !== 1) {
        ambiguous = true;
        return null;
      }
      if (stored && !stored.number) reclaimed.add(section.id);
      return candidates[0].id;
    }
    // No section holds a prefix of this number: nothing better is known than
    // the stored link (a document whose headings are titled, not numbered,
    // above its dotted sections).
    return stored?.id ?? null;
  };

  const children = new Map<string, HierarchySection[]>();
  for (const section of byId.values()) {
    const parentId = parentOf(section);
    if (parentId) children.set(parentId, [...(children.get(parentId) ?? []), section]);
  }

  // Unnumbered headings sort first: one hangs under the numbered section it
  // follows, so it comes before that section's numbered sub-sections.
  const shown: HierarchySection[] = [];
  let omitted = 0;
  let detachedHeadings = false;
  const seen = new Set<string>([containerId]);
  const walk = (parentId: string, depth: number) => {
    for (const child of [...(children.get(parentId) ?? [])].sort(compareSectionListing)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (reclaimed.has(child.id)) detachedHeadings = true;
      if (child.chars > 0) {
        if (depth <= CONTAINER_SECTION_DEPTH && shown.length < CONTAINER_SECTION_LIMIT) shown.push(child);
        else omitted += 1;
      }
      walk(child.id, depth + 1);
    }
  };
  walk(containerId, 1);
  return { shown, omitted, detachedHeadings, ambiguous };
}

export function createSectionPrimitiveService({ withSession }: { withSession: SessionExecutor }) {
  const getSection = async (sectionId: string, options: GetSectionOptions = {}): Promise<SectionView | null> => {
    const { offset, length } = sectionWindowRequest(options);
    return withSession(async (session) => {
      // The window is cut in Neo4j so a long body (some exceed 38 MB) never
      // leaves it. The driver sends a JavaScript number as a float and
      // substring() takes integers, hence toInteger(). The whole text is
      // returned only to check a stored Jev annotation against it.
      const result = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         OPTIONAL MATCH (release:CorpusRelease {id: 'current'})
         OPTIONAL MATCH (annotation:JevAnnotation {id: 'current'})
         WITH s, d, release, annotation, coalesce(size(s.content_text), 0) AS totalChars
         RETURN
           release.release_id AS releaseId,
           release.jev_annotation_digest AS annotationDigest,
           annotation.digest AS liveAnnotationDigest,
           s.id AS id,
           s.title AS title,
           s.section_number AS sectionNumber,
           CASE
             WHEN toInteger($offset) < totalChars
               THEN substring(s.content_text, toInteger($offset), toInteger($length))
             ELSE left(s.content_text, 0)
           END AS content,
           totalChars,
           CASE
             WHEN $withRoles AND s.jev_section_roles IS NOT NULL THEN s.content_text
             ELSE null
           END AS roleContent,
           s.jev_section_roles AS sectionRoles,
           s.last_revised AS lastRevised,
           s.federal_register_cite AS federalRegisterCite,
           d.id AS documentId,
           d.title AS documentTitle,
           d.document_type AS documentType,
           d.policy_number AS policyNumber,
           d.effective_date AS effectiveDate,
           d.source_modified_date AS sourceModifiedDate,
           d.retrieved_at AS retrievedAt,
           d.source_url AS url,
           d.status AS status,
           d.authority_tier AS authorityTier,
           d.answer_role AS answerRole,
           d.source_format AS sourceFormat,
           d.answer_ready AS answerReady,
           d.corpus_bucket AS corpusBucket,
           d.variant_group AS variantGroup,
           d.variant_date AS variantDate,
           d.retrieval_ready AS retrievalReady`,
        { id: sectionId, offset, length, withRoles: process.env.JEV_SECTION_ROLES_ENABLED === 'true' },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const content = (record.get('content') as string | null | undefined) ?? null;
      const totalChars = Math.max(0, toCount(record.get('totalChars')));

      // An empty window is not an empty section: only a section with no text
      // of its own is read as a container.
      if (totalChars > 0) return buildSectionView(record, content, sectionWindow(offset, length, totalChars));

      // The whole document's sections, without text: which of them belong
      // under this heading is decided from numbers and links together.
      const outlineResult = await session.run(
        `MATCH (d:Document)-[:HAS_SECTION]->(:Section {id: $id})
         MATCH (d)-[:HAS_SECTION]->(other:Section)
         OPTIONAL MATCH (parent:Section)-[:PARENT_OF]->(other)
         RETURN
           other.id AS id,
           other.title AS title,
           other.section_number AS sectionNumber,
           coalesce(other.content_length, 0) AS chars,
           parent.id AS parentId`,
        { id: sectionId },
      );
      const { shown, omitted, detachedHeadings, ambiguous } = containerDescendants(
        sectionId,
        outlineResult.records.map((other) => ({
          id: other.get('id') as string,
          number: (other.get('sectionNumber') as string | null | undefined) ?? null,
          title: (other.get('title') as string | null | undefined) ?? null,
          chars: Math.max(0, toCount(other.get('chars'))),
          parentId: (other.get('parentId') as string | null | undefined) ?? null,
        })),
      );
      if (shown.length === 0) {
        // Say so: an empty read with no note looks like a section that says nothing.
        return buildSectionView(record, content, {
          ...sectionWindow(offset, length, 0),
          note: ambiguous
            ? `${CONTAINER_NOTE_LEAD} Section numbers repeat in this document, so the sections under it could not be identified; getDocument lists every section of the document, to read by id.`
            : null,
        });
      }

      const { pieces, totalChars: combinedChars } = planContainerWindow(
        shown.map((child) => ({ id: child.id, heading: child.title || child.number || '(untitled)', chars: child.chars })),
        offset,
        length,
      );
      const bodyPieces = pieces.filter((piece): piece is Extract<ContainerPiece, { id: string }> => 'id' in piece);
      const bodies = new Map<string, string>();
      if (bodyPieces.length > 0) {
        const bodyResult = await session.run(
          `UNWIND $pieces AS piece
           MATCH (s:Section {id: piece.id})
           RETURN
             piece.id AS id,
             substring(s.content_text, toInteger(piece.start), toInteger(piece.length)) AS text`,
          { pieces: bodyPieces },
        );
        for (const body of bodyResult.records) {
          bodies.set(body.get('id') as string, (body.get('text') as string | null | undefined) ?? '');
        }
      }
      const window = sectionWindow(offset, length, combinedChars);
      const labels = shown.map((child) => child.number ?? child.title ?? '(untitled)');
      const note = [
        `${CONTAINER_NOTE_LEAD} The text is that of the ${shown.length} section${shown.length === 1 ? '' : 's'} under it, each below a "###" line with its title:`,
        `${labels.slice(0, CONTAINER_LABELS_SHOWN).join('; ')}${labels.length > CONTAINER_LABELS_SHOWN ? `; and ${labels.length - CONTAINER_LABELS_SHOWN} more` : ''}.`,
        ...(omitted > 0
          ? [`${omitted} more section${omitted === 1 ? '' : 's'} under it ${omitted === 1 ? 'is' : 'are'} not included; getDocument lists every section of the document, to read by id.`]
          : []),
        ...(detachedHeadings
          ? ['Lettered or unnumbered headings between these sections are stored apart from them and may be missing here; find them in the section list getDocument returns.']
          : []),
        ...(window.note ? [window.note] : []),
      ].join(' ');
      return buildSectionView(
        record,
        pieces.map((piece) => ('id' in piece ? (bodies.get(piece.id) ?? '') : piece.text)).join(''),
        { ...window, note },
      );
    });
  };

  const getDocument = async (documentId: string): Promise<DocumentWithSectionsView | null> => {
    return withSession(async (session) => {
      const result = await session.run(
        `MATCH (d:Document {id: $id})
         OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:Section)
         WHERE s.content_length > 0
         RETURN
           ${documentMetadataReturn('d')},
           collect({id: s.id, number: s.section_number, title: s.title, chars: s.content_length}) AS sections`,
        { id: documentId },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      return {
        ...mapDocumentMetadataRecord(record),
        sections: mapDocumentSections(
          (record.get('sections') as Array<{
            id: string | null;
            number: string | null;
            title: string | null;
            chars?: number | { toNumber(): number } | null;
          }>) ?? [],
        ),
      };
    });
  };

  const getSectionContext = async (sectionId: string): Promise<SectionContextView> => {
    return withSession(async (session) => {
      const ancestorResult = await session.run(
        `MATCH (s:Section {id: $id})
         MATCH path = (ancestor:Section)-[:PARENT_OF*1..10]->(s)
         RETURN ancestor.id AS id, ancestor.title AS title, ancestor.section_number AS sectionNumber
         ORDER BY length(path) DESC`,
        { id: sectionId },
      );

      const childResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
         WITH child
         ORDER BY child.section_number
         WITH [node IN collect(child) | {id: node.id, title: node.title, sectionNumber: node.section_number}] AS rows
         RETURN size(rows) AS total, rows[0..${CONTEXT_CHILD_LIMIT}] AS entries`,
        { id: sectionId },
      );

      // NEXT_SIBLING is a strict chain, so the nearest siblings are a bounded
      // walk from the section in each direction, linear in the hops taken.
      // Expanding the whole family from its head was quadratic (4.5 s under a
      // 2,364-child parent). The chain can leave the family (see
      // CONTEXT_SIBLING_WALK_HOPS), so each endpoint is checked against the
      // section's own family (the same parent, or for a root section the
      // parent-less sections of the same document) and the window is the
      // nearest family members, not the nearest hops.
      const siblingResult = await session.run(
        `MATCH (s:Section {id: $id})
         OPTIONAL MATCH (parent:Section)-[:PARENT_OF]->(s)
         OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
         WITH s, parent, d
         LIMIT 1
         CALL {
           WITH s, parent, d
           OPTIONAL MATCH path = (before:Section)-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->(s)
           WHERE (parent IS NOT NULL AND EXISTS { MATCH (parent)-[:PARENT_OF]->(before) })
              OR (parent IS NULL
                  AND EXISTS { MATCH (d)-[:HAS_SECTION]->(before) }
                  AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(before) })
           WITH before, length(path) AS hops
           ORDER BY hops
           LIMIT ${CONTEXT_SIBLING_WINDOW}
           RETURN before AS sibling, -hops AS offset
           UNION
           WITH s, parent, d
           OPTIONAL MATCH path = (s)-[:NEXT_SIBLING*1..${CONTEXT_SIBLING_WALK_HOPS}]->(after:Section)
           WHERE (parent IS NOT NULL AND EXISTS { MATCH (parent)-[:PARENT_OF]->(after) })
              OR (parent IS NULL
                  AND EXISTS { MATCH (d)-[:HAS_SECTION]->(after) }
                  AND NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(after) })
           WITH after, length(path) AS hops
           ORDER BY hops
           LIMIT ${CONTEXT_SIBLING_WINDOW}
           RETURN after AS sibling, hops AS offset
         }
         WITH parent, d, sibling, offset
         ORDER BY offset
         WITH parent, d,
              [node IN collect(sibling) | {id: node.id, title: node.title, sectionNumber: node.section_number}] AS entries
         RETURN
           entries,
           CASE
             WHEN parent IS NOT NULL THEN COUNT { MATCH (parent)-[:PARENT_OF]->(:Section) }
             ELSE COUNT {
               MATCH (d)-[:HAS_SECTION]->(root:Section)
               WHERE NOT EXISTS { MATCH (:Section)-[:PARENT_OF]->(root) }
             }
           END - 1 AS total`,
        { id: sectionId },
      );

      const children = mapContextWindow(childResult.records[0]);
      const siblings = mapContextWindow(siblingResult.records[0]);

      return {
        ancestors: ancestorResult.records.map(mapSectionContextEntry),
        siblings: siblings.entries,
        siblingCount: siblings.total,
        siblingsTruncated: siblings.total > siblings.entries.length,
        children: children.entries,
        childCount: children.total,
        childrenTruncated: children.total > children.entries.length,
      } satisfies SectionContextView;
    });
  };

  return {
    getSection,
    getDocument,
    getSectionContext,
  };
}
