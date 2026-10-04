"""Semantic document revisions shared by loading and embedding transactions."""
import hashlib
import json


def document_source_epoch(bundle):
    """Bind bodies and complete heading ancestry; ignore retrieval timestamps."""
    digest = hashlib.sha256()
    digest.update(json.dumps([bundle.document.id, bundle.document.title], ensure_ascii=False).encode())
    for section in sorted(bundle.sections, key=lambda item: item.id):
        digest.update(json.dumps([
            section.id, section.title, section.parent_id,
            hashlib.sha256((section.content_text or "").encode()).hexdigest(),
        ], ensure_ascii=False).encode())
    return digest.hexdigest()
