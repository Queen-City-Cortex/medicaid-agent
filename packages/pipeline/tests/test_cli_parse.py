"""CLI regressions for resumable, fail-closed corpus parsing."""

from click.testing import CliRunner
import pytest

from pipeline.cli import cli
from pipeline.cli.release import _parse_strict, _require_parse_inventory_unchanged


def test_parse_cli_forwards_recovery_selectors(monkeypatch):
    captured = {}

    def fake_parse_all(**kwargs):
        captured.update(kwargs)
        return {
            "parsed": 0,
            "skipped": 0,
            "errors": 0,
            "timed_out": 0,
            "remaining_failures": 0,
            "terminal_state": "completed",
        }

    monkeypatch.setattr("pipeline.parse.converter.parse_all", fake_parse_all)

    result = CliRunner().invoke(
        cli,
        [
            "parse",
            "--retry-failures",
            "--limit",
            "7",
            "--max-runtime-seconds",
            "120",
            "--max-consecutive-timeouts",
            "3",
        ],
    )

    assert result.exit_code == 0, result.output
    assert captured == {
        "source_type": None,
        "force": False,
        "file_path": None,
        "retry_failures": True,
        "limit": 7,
        "max_runtime_seconds": 120,
        "max_consecutive_timeouts": 3,
    }


def test_parse_cli_strict_fails_on_cached_inventory_failure(monkeypatch):
    monkeypatch.setattr(
        "pipeline.parse.converter.parse_all",
        lambda **_kwargs: {
            "parsed": 0,
            "skipped": 1,
            "errors": 0,
            "timed_out": 0,
            "remaining_failures": 1,
            "remaining_required_failures": 1,
            "terminal_state": "completed",
        },
    )

    result = CliRunner().invoke(cli, ["parse", "--strict"])

    assert result.exit_code != 0
    assert "Strict parse failed" in result.output


def test_parse_cli_strict_required_allows_only_optional_failures(monkeypatch):
    monkeypatch.setattr(
        "pipeline.parse.converter.parse_all",
        lambda **_kwargs: {
            "parsed": 0,
            "skipped": 1,
            "errors": 1,
            "timed_out": 1,
            "remaining_failures": 1,
            "remaining_required_failures": 0,
            "remaining_optional_failures": 1,
            "terminal_state": "completed",
        },
    )

    result = CliRunner().invoke(cli, ["parse", "--strict-required"])

    assert result.exit_code == 0, result.output


def test_parse_cli_strict_required_blocks_required_or_incomplete(monkeypatch):
    results = [
        {
            "parsed": 0,
            "skipped": 0,
            "errors": 0,
            "timed_out": 0,
            "remaining_failures": 1,
            "remaining_required_failures": 1,
            "terminal_state": "completed",
        },
        {
            "parsed": 0,
            "skipped": 0,
            "errors": 0,
            "timed_out": 0,
            "remaining_failures": 0,
            "remaining_required_failures": 0,
            "terminal_state": "max_runtime_reached",
        },
    ]
    monkeypatch.setattr(
        "pipeline.parse.converter.parse_all", lambda **_kwargs: results.pop(0)
    )

    for _ in range(2):
        result = CliRunner().invoke(cli, ["parse", "--strict-required"])
        assert result.exit_code != 0
        assert "Strict parse failed" in result.output


def test_parse_cli_rejects_both_strict_modes(monkeypatch):
    monkeypatch.setattr(
        "pipeline.parse.converter.parse_all",
        lambda **_kwargs: {
            "parsed": 0,
            "skipped": 0,
            "errors": 0,
            "timed_out": 0,
            "remaining_failures": 0,
            "remaining_required_failures": 0,
            "terminal_state": "completed",
        },
    )

    result = CliRunner().invoke(cli, ["parse", "--strict", "--strict-required"])

    assert result.exit_code != 0
    assert "either --strict or --strict-required" in result.output


def test_release_parse_strict_matches_required_family_policy(monkeypatch):
    optional_only = {
        "errors": 3,
        "timed_out": 2,
        "remaining_required_failures": 0,
        "remaining_optional_failures": 3,
        "terminal_state": "completed",
    }
    monkeypatch.setattr("pipeline.parse.converter.parse_all", lambda: optional_only)

    assert _parse_strict() == optional_only


def test_release_parse_strict_blocks_required_failure_or_incomplete_run(monkeypatch):
    results = [
        {
            "errors": 1,
            "timed_out": 0,
            "remaining_required_failures": 1,
            "terminal_state": "completed",
        },
        {
            "errors": 0,
            "timed_out": 0,
            "remaining_required_failures": 0,
            "terminal_state": "max_runtime_reached",
        },
    ]
    monkeypatch.setattr("pipeline.parse.converter.parse_all", lambda: results.pop(0))

    for _ in range(2):
        with pytest.raises(RuntimeError):
            _parse_strict()


def test_release_validation_rejects_parse_inventory_mutation(monkeypatch):
    release = {
        "stageResults": {
            "parse": {
                "result": {"inventory_evidence": {"inventory_hash": "sha256:prepared"}}
            }
        }
    }
    monkeypatch.setattr(
        "pipeline.parse.converter.build_parse_inventory_evidence",
        lambda: {"inventory_hash": "sha256:changed"},
    )

    with pytest.raises(RuntimeError, match="changed after release preparation"):
        _require_parse_inventory_unchanged(release)
