"""CLI tests for mixed-corpus build and eval orchestration."""

from click.testing import CliRunner

import pipeline.cli as cli_module
from pipeline.cli import cli


def test_build_mixed_corpus_uses_expected_defaults(monkeypatch):
    calls: list[dict] = []

    def fake_build(**kwargs):
        calls.append(kwargs)
        return {}

    monkeypatch.setattr(cli_module, "_run_mixed_corpus_build", fake_build)

    result = CliRunner().invoke(cli, ["build-mixed-corpus"])

    assert result.exit_code == 0
    assert calls == [
        {
            "reset": True,
            "parse": True,
            "embed": True,
            "with_concepts": False,
            "refresh_federal": False,
            "llm_assist": False,
        }
    ]
    assert "Mixed-corpus build complete!" in result.output


def test_build_mixed_corpus_respects_flags(monkeypatch):
    calls: list[dict] = []

    def fake_build(**kwargs):
        calls.append(kwargs)
        return {}

    monkeypatch.setattr(cli_module, "_run_mixed_corpus_build", fake_build)

    result = CliRunner().invoke(
        cli,
        [
            "build-mixed-corpus",
            "--no-reset",
            "--skip-parse",
            "--no-embed",
            "--with-concepts",
            "--refresh-federal",
            "--llm-assist",
        ],
    )

    assert result.exit_code == 0
    assert calls == [
        {
            "reset": False,
            "parse": False,
            "embed": False,
            "with_concepts": True,
            "refresh_federal": True,
            "llm_assist": True,
        }
    ]


def test_eval_mixed_corpus_runs_both_levels_by_default(monkeypatch):
    calls: list[tuple[list[str], dict]] = []

    def fake_run(levels: list[str], **kwargs):
        calls.append((levels, kwargs))
        return {}

    monkeypatch.setattr(cli_module, "_run_eval_levels", fake_run)

    result = CliRunner().invoke(
        cli,
        ["eval-mixed-corpus", "--top-k", "12", "--difficulty", "complex"],
    )

    assert result.exit_code == 0
    assert calls == [
        (
            ["retrieval", "cross-ref"],
            {
                "top_k": 12,
                "category": None,
                "difficulty": "complex",
                "question": None,
            },
        )
    ]


def test_eval_command_still_defaults_to_retrieval(monkeypatch):
    calls: list[tuple[list[str], dict]] = []

    def fake_run(levels: list[str], **kwargs):
        calls.append((levels, kwargs))
        return {}

    monkeypatch.setattr(cli_module, "_run_eval_levels", fake_run)

    result = CliRunner().invoke(cli, ["eval"])

    assert result.exit_code == 0
    assert calls == [
        (
            ["retrieval"],
            {
                "top_k": None,
                "category": None,
                "difficulty": None,
                "question": None,
                "from_result": None,
                "legacy_evidence": False,
                "dataset": None,
            },
        )
    ]


def test_eval_answer_stability_defaults_to_recent_full_runs(monkeypatch):
    loaded = {
        "full-new.json": {
            "run_id": "2026-04-11T05:55:38",
            "level": "answer",
            "config": {"dataset_count": 25},
            "per_question": [{"id": "q-001"}],
        },
        "targeted.json": {
            "run_id": "2026-04-11T05:42:21",
            "level": "answer",
            "config": {"dataset_count": 1},
            "per_question": [{"id": "q-018"}],
        },
        "full-old.json": {
            "run_id": "2026-04-11T05:40:42",
            "level": "answer",
            "config": {"dataset_count": 25},
            "per_question": [{"id": "q-001"}],
        },
    }
    captured: dict = {}

    def fake_list_results(level=None, last=None):
        assert level == "answer"
        assert last is None
        return list(loaded.keys())

    def fake_summary(runs, **kwargs):
        captured["run_ids"] = [run["run_id"] for run in runs]
        captured["kwargs"] = kwargs
        return {"run_count": len(runs), "questions": []}

    def fake_print(summary):
        captured["summary"] = summary

    monkeypatch.setattr("pipeline.eval.results.list_results", fake_list_results)
    monkeypatch.setattr("pipeline.eval.results.load_result", lambda path: loaded[path])
    monkeypatch.setattr("pipeline.eval.metrics.summarize_answer_stability", fake_summary)
    monkeypatch.setattr("pipeline.eval.reports.print_answer_stability_report", fake_print)

    result = CliRunner().invoke(cli, ["eval-answer-stability", "--last", "2"])

    assert result.exit_code == 0
    assert captured["run_ids"] == ["2026-04-11T05:55:38", "2026-04-11T05:40:42"]
    assert captured["kwargs"]["pass_threshold"] == 3
    assert captured["summary"]["run_count"] == 2


def test_eval_runs_recomputes_answer_overall_for_older_runs(monkeypatch):
    loaded = {
        "answer.json": {
            "run_id": "2026-04-11T05:55:38",
            "level": "answer",
            "aggregate": {"precision_at_k": 0.92, "recall_at_k": 0.92, "primary_hit_rate": 1.0},
            "config": {"dataset_count": 2},
            "per_question": [
                {"scores": {"overall": 2}},
                {"scores": {"overall": 3}},
            ],
        }
    }

    monkeypatch.setattr("pipeline.eval.results.list_results", lambda level=None, last=None: ["answer.json"])
    monkeypatch.setattr("pipeline.eval.results.load_result", lambda path: loaded[path])

    result = CliRunner().invoke(cli, ["eval-runs", "--level", "answer", "--last", "1"])

    assert result.exit_code == 0
    assert "(answer)" in result.output
    assert "Overall=2.50/3.00" in result.output


def test_fee_schedule_backlog_command_uses_expected_defaults(monkeypatch):
    calls: list[dict] = []

    def fake_run(**kwargs):
        calls.append(kwargs)
        return {
            "markdown": "# Fee Schedule Backlog\n",
            "json_path": "/tmp/backlog.json",
            "markdown_path": "/tmp/backlog.md",
        }

    monkeypatch.setattr(cli_module, "_run_fee_schedule_backlog", fake_run)

    result = CliRunner().invoke(cli, ["fee-schedule-backlog"])

    assert result.exit_code == 0
    assert calls == [
        {
            "json_output_path": None,
            "markdown_output_path": None,
            "group_limit": 25,
            "candidate_limit": 50,
        }
    ]
    assert "Fee Schedule Backlog" in result.output


def test_fee_schedule_backlog_command_respects_flags(monkeypatch, tmp_path):
    calls: list[dict] = []

    def fake_run(**kwargs):
        calls.append(kwargs)
        return {
            "markdown": "# Fee Schedule Backlog\n",
            "json_path": str(tmp_path / "backlog.json"),
            "markdown_path": str(tmp_path / "backlog.md"),
        }

    monkeypatch.setattr(cli_module, "_run_fee_schedule_backlog", fake_run)

    result = CliRunner().invoke(
        cli,
        [
            "fee-schedule-backlog",
            "--group-limit",
            "10",
            "--candidate-limit",
            "12",
            "--json-out",
            str(tmp_path / "custom.json"),
            "--markdown-out",
            str(tmp_path / "custom.md"),
        ],
    )

    assert result.exit_code == 0
    assert calls == [
        {
            "json_output_path": tmp_path / "custom.json",
            "markdown_output_path": tmp_path / "custom.md",
            "group_limit": 10,
            "candidate_limit": 12,
        }
    ]
