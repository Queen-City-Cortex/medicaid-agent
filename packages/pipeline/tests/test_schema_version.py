"""Tests for the SchemaVersion helpers."""

import json
from contextlib import contextmanager


from pipeline.graph import schema_version as sv


class StubSession:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict | None = None):
        self.calls.append((query, params or {}))
        return _StubResult()


class _StubResult:
    def single(self):
        return None


@contextmanager
def _stub_session_context():
    session = StubSession()
    yield session
    _stub_session_context.last_session = session  # type: ignore[attr-defined]


def test_compute_manifest_hash_changes_with_content(tmp_path, monkeypatch):
    manifest = tmp_path / "m.json"
    manifest.write_text(json.dumps({"a": 1}))
    first = sv.compute_manifest_hash(manifest)

    manifest.write_text(json.dumps({"a": 2}))
    second = sv.compute_manifest_hash(manifest)

    assert first != second
    assert len(first) == 64  # SHA-256 hex


def test_compute_manifest_hash_missing_file_returns_empty_string(tmp_path):
    assert sv.compute_manifest_hash(tmp_path / "does-not-exist.json") == ""


def test_write_schema_version_upserts_merge_query(monkeypatch):
    captured = {}

    class Session:
        def run(self, query, params):
            captured["query"] = query
            captured["params"] = params

    @contextmanager
    def fake_session():
        yield Session()

    monkeypatch.setattr(sv, "get_session", fake_session)

    info = sv.write_schema_version(
        manifest_hash="abc123",
        pipeline_version="9.9.9",
    )

    assert "MERGE (v:SchemaVersion {id: 'current'})" in captured["query"]
    assert captured["params"]["manifest_hash"] == "abc123"
    assert captured["params"]["pipeline_version"] == "9.9.9"
    assert info["manifest_hash"] == "abc123"
    assert info["pipeline_version"] == "9.9.9"
    # loaded_at should be a well-formed ISO-8601 string
    assert info["loaded_at"].endswith("+00:00") or "T" in info["loaded_at"]


def test_read_schema_version_returns_none_when_missing(monkeypatch):
    class Session:
        def run(self, query, params=None):
            class Result:
                def single(self):
                    return None
            return Result()

    @contextmanager
    def fake_session():
        yield Session()

    monkeypatch.setattr(sv, "get_session", fake_session)
    assert sv.read_schema_version() is None
