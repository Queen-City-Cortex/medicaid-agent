from pipeline.eval import judge, judge_calibration


def test_meter_prices_measured_usage_and_reserves_the_full_output_budget(monkeypatch):
    monkeypatch.setattr(judge, "_post", lambda prompt: {"usage": {"input_tokens": 50_000, "output_tokens": 2_000}})
    meter = judge_calibration.Meter()
    monkeypatch.setattr(judge, "EVAL_JUDGE_MODEL", "claude-sonnet-5-5")
    meter.post("PROMPT")
    assert meter.spent_usd == (50_000 * 2.0 + 2_000 * 10.0) / 1e6
    # The reserve uses the largest input seen and each request's max_tokens.
    reserve = meter.row_reserve(("claude-sonnet-4-6", "claude-sonnet-5-5"))
    expected = 2 * (50_000 * 3.0 + 1024 * 15.0) / 1e6 + 2 * (50_000 * 2.0 + 16_000 * 10.0) / 1e6
    assert abs(reserve - expected) < 1e-9
