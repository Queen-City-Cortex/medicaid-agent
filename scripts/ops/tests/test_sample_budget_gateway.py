import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "budget_gateway", Path(__file__).parents[1] / "sample-budget-gateway.py"
)
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


def test_gateway_caps_output_forces_standard_tier_and_reserves_before_transport(
    tmp_path,
):
    _, body, reserved, model, _bound = budget.prepare_request(
        "/v1/responses",
        {
            "model": "gpt-5.4",
            "input": "policy",
            "max_output_tokens": 100000,
            "service_tier": "priority",
            "stream": True,
        },
    )
    payload = json.loads(body)
    assert (
        payload["max_output_tokens"] == 8192
        and payload["service_tier"] == "default"
        and payload["stream"]
    )
    ledger = budget.Ledger(tmp_path / "ledger.json")
    call = ledger.reserve(reserved, {"model": model})
    assert json.loads(ledger.path.read_text())["committedUsd"] == reserved
    ledger.finish(call, "completed", {"input_tokens": 100, "output_tokens": 50})
    assert json.loads(ledger.path.read_text())["committedUsd"] < reserved


@pytest.mark.parametrize(
    "payload",
    [
        {"model": "unpriced"},
        {"model": "gpt-5.4", "previous_response_id": "old"},
        {"model": "gpt-5.4", "input": [{"type": "item_reference"}]},
        {"model": "gpt-5.4", "tools": [{"type": "web_search"}]},
        {"model": "gpt-5.4", "input": [{"type": "input_file"}]},
    ],
)
def test_unbounded_or_unpriced_inputs_never_reach_transport(payload):
    with pytest.raises(ValueError):
        budget.prepare_request("/v1/responses", payload)


def test_timeout_debit_is_retained_and_restart_cannot_reset_budget(tmp_path):
    path = tmp_path / "ledger.json"
    ledger = budget.Ledger(path)
    call = ledger.reserve(4.9, {"model": "gpt-5.4"})
    ledger.finish(call, "timeout")
    with pytest.raises(ValueError):
        ledger.reserve(0.2, {"model": "gpt-5.4"})
    with pytest.raises(FileExistsError):
        budget.Ledger(path)
    assert json.loads(path.read_text())["committedUsd"] == 4.9


def test_voyage_allows_only_priced_query_embedding():
    _, body, reserved, model, _ = budget.prepare_request(
        "/voyage/embeddings",
        {"model": "voyage-4", "input": ["query"], "input_type": "query"},
    )
    assert (
        model == "voyage-4" and reserved > 0 and json.loads(body)["truncation"] is False
    )
    with pytest.raises(ValueError):
        budget.prepare_request(
            "/voyage/embeddings",
            {"model": "voyage-4", "input": ["query"], "input_type": "document"},
        )


def test_stream_transport_accounts_terminal_usage_without_changing_sdk_protocol(
    tmp_path, monkeypatch
):
    import io

    upstream_calls = []

    def upstream(request, timeout):
        upstream_calls.append(json.loads(request.data))
        response = io.BytesIO(
            b'event: response.completed\ndata: {"response":{"usage":{"input_tokens":100,"output_tokens":20}}}\n\n'
        )
        response.status = 200
        return response

    gateway = budget.Gateway(tmp_path, {"OPENAI_API_KEY": "private-provider-key"})
    gateway.start()
    monkeypatch.setattr(budget.urllib.request, "urlopen", upstream)
    # Use http.client so patching upstream transport cannot intercept the client.
    import http.client

    connection = http.client.HTTPConnection("127.0.0.1", gateway.server.server_port)
    try:
        connection.request(
            "POST",
            "/v1/responses",
            json.dumps({"model": "gpt-5.4", "input": "policy", "stream": True}),
            {"Authorization": "Bearer " + gateway.nonce},
        )
        response = connection.getresponse()
        data = response.read()
        assert (
            response.status == 200
            and response.getheader("Content-Type") == "text/event-stream"
        )
        assert b"response.completed" in data and upstream_calls[0]["stream"] is True
        assert gateway.ledger.calls[0]["usage"]["input_tokens"] == 100
    finally:
        connection.close()
        gateway.close()


@pytest.mark.parametrize("limit", [0, -1, 1.5, True])
def test_invalid_output_limits_are_rejected(limit):
    with pytest.raises(ValueError):
        budget.prepare_request(
            "/v1/responses", {"model": "gpt-5.4", "max_output_tokens": limit}
        )


def test_concurrent_reservations_cannot_overspend(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    ledger = budget.Ledger(tmp_path / "ledger.json")

    def attempt(_):
        try:
            ledger.reserve(1, {"model": "gpt-5.4"})
            return True
        except ValueError:
            return False

    with ThreadPoolExecutor(max_workers=10) as pool:
        assert sum(pool.map(attempt, range(10))) == 5
    assert json.loads(ledger.path.read_text())["committedUsd"] == 5


def test_native_tsx_registration_preserves_fetch_guard_in_executing_process(tmp_path):
    import os
    import subprocess
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    received = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            received.append(dict(self.headers))
            self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checkout = Path(__file__).parents[3]
    script = tmp_path / "sample.ts"
    script.write_text(
        "const typed: string = 'https://api.openai.com/v1/responses'; fetch(typed,{method:'POST',body:'{}'}).then(r=>r.json()).then(()=>console.log('routed')); "
    )
    env = {
        **os.environ,
        "SAMPLE_GATEWAY_URL": "http://127.0.0.1:" + str(server.server_port),
        "SAMPLE_GATEWAY_NONCE": "test-only",
        "SAMPLE_QUESTION_ID": "fixture",
    }
    try:
        result = subprocess.run(
            [
                "node",
                "--import",
                "tsx",
                "--import",
                str(checkout / "scripts/ops/sample-budget-preload.mjs"),
                str(script),
            ],
            cwd=checkout,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        assert received[0]["Authorization"] == "Bearer test-only"
        assert received[0]["X-Sample-Question"] == "fixture"
    finally:
        server.shutdown()
        server.server_close()
