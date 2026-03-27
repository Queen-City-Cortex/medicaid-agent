def test_pipeline_package_imports():
    import pipeline
    assert pipeline is not None


def test_docling_imports():
    from docling.document_converter import DocumentConverter
    assert DocumentConverter is not None
