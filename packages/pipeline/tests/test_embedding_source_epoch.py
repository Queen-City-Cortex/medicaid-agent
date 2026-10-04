from dataclasses import replace
from pipeline.embeddings.source_epoch import document_source_epoch
from tests.test_corpus_writer import _make_bundle


def test_source_epoch_binds_body_heading_and_ancestry_but_ignores_refresh_time():
    bundle = _make_bundle()
    original = document_source_epoch(bundle)
    assert document_source_epoch(replace(bundle, sections=list(reversed(bundle.sections)))) == original
    assert document_source_epoch(replace(bundle, document=replace(bundle.document,retrieved_at="2030-01-01"))) == original
    variants = [replace(bundle, document=replace(bundle.document,title="Renamed"))]
    for key,value in [("title","Other heading"),("parent_id",None),("content_text","new body")]:
        variants.append(replace(bundle, sections=[bundle.sections[0],replace(bundle.sections[1], **{key:value})]))
    assert all(document_source_epoch(variant) != original for variant in variants)
