"""Failed federal imports must stop dependent operator commands."""

from click.testing import CliRunner
import pytest

from pipeline.cli import cli
from pipeline.federal import loader


@pytest.mark.parametrize("command,function,count", [("ingest-ssa", "load_ssa", "titles_loaded"), ("ingest-cfr", "load_all_cfr", "parts_loaded")])
@pytest.mark.parametrize("errors", [0, 1])
def test_federal_import_exit_status_matches_errors(monkeypatch, command, function, count, errors):
    monkeypatch.setattr(loader, function, lambda **kwargs: {count: 1, "sections_total": 5, "errors": errors})
    result = CliRunner().invoke(cli, [command])
    assert result.exit_code == (1 if errors else 0)
    if errors:
        assert "ingestion failed" in result.output
