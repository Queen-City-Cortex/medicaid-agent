"""CLI tests for the embed command's error handling."""

import pytest
from click.testing import CliRunner

import pipeline.cli as cli_module
from pipeline.cli import cli


def _patch_embed_stage(monkeypatch, stats: dict):
    monkeypatch.setattr(
        "pipeline.embeddings.generator.embed_all",
        lambda model=None: stats,
    )
    monkeypatch.setattr(
        "pipeline.embeddings.indexer.ensure_vector_index",
        lambda: None,
    )


def test_embed_command_exits_zero_when_no_errors(monkeypatch):
    _patch_embed_stage(monkeypatch, {"embedded": 10, "errors": 0, "chunks_created": 0})

    result = CliRunner().invoke(cli, ["embed"])

    assert result.exit_code == 0
    assert "10 embedded" in result.output


def test_embed_command_exits_nonzero_when_batches_failed(monkeypatch):
    _patch_embed_stage(monkeypatch, {"embedded": 5, "errors": 128, "chunks_created": 0})

    result = CliRunner().invoke(cli, ["embed"])

    assert result.exit_code == 1
    assert "128 errors" in result.output


def test_fail_on_embed_errors_raises_only_when_errors_present():
    cli_module._fail_on_embed_errors({"embedded": 3, "errors": 0})  # no raise

    with pytest.raises(SystemExit) as exc_info:
        cli_module._fail_on_embed_errors({"embedded": 3, "errors": 2})
    assert exc_info.value.code == 1
