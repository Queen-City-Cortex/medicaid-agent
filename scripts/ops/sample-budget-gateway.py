#!/usr/bin/env python3
"""A finite diagnostic gateway; reserve cost durably before every paid request."""

import hashlib
import json
import math
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RATES = {
    "gpt-5.4": (2.5, 15, 0.25),
    "gpt-5.6-terra": (2, 12, 0.2),
    "gpt-5-mini": (0.25, 2, 0.025),
    "gpt-5.4-mini": (0.75, 4.5, 0.075),
}
CAP_USD = 5
MAX_REQUESTS = 64
MAX_OUTPUT = 8192
MAX_BODY = 180000


def prepare_request(path, payload):
    if path == "/v1/responses":
        model = payload.get("model")
        if model not in RATES:
            raise ValueError("Model outside priced sample allowlist")
        if payload.get("previous_response_id") or payload.get("conversation"):
            raise ValueError(
                "Stored conversation inputs cannot be bounded by this gateway"
            )
        if "item_reference" in json.dumps(payload):
            raise ValueError("Stored item references cannot be bounded by this gateway")
        if any(t.get("type") != "function" for t in payload.get("tools", [])):
            raise ValueError("Built-in tools are outside this sample budget")
        requested_output = payload.get("max_output_tokens", MAX_OUTPUT)
        if requested_output is None:
            requested_output = MAX_OUTPUT
        if type(requested_output) is not int or requested_output < 1:
            raise ValueError("Positive integer output token limit required")
        payload = {
            **payload,
            "max_output_tokens": min(requested_output, MAX_OUTPUT),
            "store": False,
            "service_tier": "default",
        }
        body = json.dumps(payload).encode()
        if len(body) > MAX_BODY:
            raise ValueError("Request exceeds conservative sample input ceiling")
        # No stored context, images or built-in tools: bytes plus a generous
        # framing reserve bound text BPE tokens; 25% also covers rate premiums.
        if "input_image" in body.decode() or "input_file" in body.decode():
            raise ValueError("Only explicit text inputs are budgeted")
        input_bound = len(body) + 16384
        price = RATES[model]
        reserved = (
            (input_bound * price[0] + payload["max_output_tokens"] * price[1])
            / 1e6
            * 1.25
        )
        return "https://api.openai.com/v1/responses", body, reserved, model, input_bound
    if path == "/voyage/embeddings":
        if payload.get("model") != "voyage-4" or payload.get("input_type") != "query":
            raise ValueError("Only Voyage 4 query embeddings are authorized")
        values = payload.get("input")
        if (
            not isinstance(values, list)
            or not values
            or not all(isinstance(v, str) for v in values)
        ):
            raise ValueError("Explicit nonempty query strings required")
        body = json.dumps({**payload, "truncation": False}).encode()
        if len(body) > MAX_BODY:
            raise ValueError("Query body too large")
        input_bound = sum(len(v.encode()) + 256 for v in values)
        return (
            "https://api.voyageai.com/v1/embeddings",
            body,
            input_bound * 0.06 / 1e6 * 1.25,
            "voyage-4",
            input_bound,
        )
    raise ValueError("Endpoint outside sample allowlist")


def measured_cost(model, usage):
    if model == "voyage-4":
        return usage["total_tokens"] * 0.06 / 1e6
    input_tokens = usage["input_tokens"]
    output_tokens = usage["output_tokens"]
    cached = usage.get("input_tokens_details", {}).get("cached_tokens", 0)
    price = RATES[model]
    # Terra cache writes can add 25% to uncached input. Keep that upper bound
    # when provider usage does not expose write tokens independently.
    uncached_rate = price[0] * (1.25 if model == "gpt-5.6-terra" else 1)
    return (
        (input_tokens - cached) * uncached_rate
        + cached * price[2]
        + output_tokens * price[1]
    ) / 1e6


class Ledger:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.calls = []
        if path.exists():
            raise FileExistsError(
                "Use a fresh sample ledger; never reset a spent budget"
            )
        self.persist()

    def persist(self):
        data = {
            "capUsd": CAP_USD,
            "maxRequests": MAX_REQUESTS,
            "committedUsd": sum(c["debitUsd"] for c in self.calls),
            "knownUsageCostUsd": sum(c.get("usageCostUsd", 0) for c in self.calls),
            "calls": self.calls,
        }
        tmp = self.path.with_suffix(".tmp")
        with tmp.open("w") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(self.path)

    def reserve(self, reserved, metadata):
        with self.lock:
            if reserved <= 0 or not math.isfinite(reserved):
                raise ValueError("Invalid cost reservation")
            if (
                len(self.calls) >= MAX_REQUESTS
                or sum(c["debitUsd"] for c in self.calls) + reserved > CAP_USD
            ):
                raise ValueError("Sample budget exhausted before transport")
            call = {
                "id": len(self.calls) + 1,
                "debitUsd": reserved,
                "reservedUsd": reserved,
                "status": "reserved",
                **metadata,
            }
            self.calls.append(call)
            self.persist()
            return call

    def finish(self, call, status, usage=None):
        with self.lock:
            call["status"] = status
            if usage:
                cost = measured_cost(call["model"], usage)
                if cost > call["reservedUsd"]:
                    raise RuntimeError(
                        "Usage exceeded reservation; stop diagnostic immediately"
                    )
                call.update(usage=usage, usageCostUsd=cost, debitUsd=cost)
            self.persist()


class Gateway:
    def __init__(self, root, keys):
        self.ledger = Ledger(root / "budget-ledger.json")
        self.keys = keys
        self.nonce = secrets.token_urlsafe(32)
        gateway = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                call = None
                try:
                    if self.headers.get("Authorization") != "Bearer " + gateway.nonce:
                        raise ValueError("Sample authorization required")
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= MAX_BODY:
                        raise ValueError("Sample body size rejected")
                    payload = json.loads(self.rfile.read(length))
                    url, body, reserved, model, bound = prepare_request(
                        self.path, payload
                    )
                    call = gateway.ledger.reserve(
                        reserved,
                        {
                            "model": model,
                            "questionId": self.headers.get(
                                "X-Sample-Question", "unknown"
                            ),
                            "inputTokenUpperBound": bound,
                            "payloadSha256": hashlib.sha256(body).hexdigest(),
                            "startedAt": time.time(),
                        },
                    )
                    key = gateway.keys[
                        "VOYAGE_API_KEY" if model == "voyage-4" else "OPENAI_API_KEY"
                    ]
                    request = urllib.request.Request(
                        url,
                        data=body,
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + key,
                        },
                    )
                    with urllib.request.urlopen(request, timeout=90) as response:
                        data = response.read(16 * 1024 * 1024 + 1)
                        status = response.status
                    if len(data) > 16 * 1024 * 1024:
                        raise ValueError("Provider response exceeds diagnostic bound")
                    if payload.get("stream"):
                        usage = None
                        for line in data.decode().splitlines():
                            if line.startswith("data: ") and line[6:] != "[DONE]":
                                event = json.loads(line[6:])
                                usage = event.get("response", {}).get("usage") or usage
                    else:
                        usage = json.loads(data).get("usage")
                    gateway.ledger.finish(
                        call, "completed" if usage else "completed_usage_unknown", usage
                    )
                except urllib.error.HTTPError as error:
                    data = error.read(1024 * 1024)
                    status = error.code
                    if call:
                        gateway.ledger.finish(call, "provider_http_" + str(status))
                except (
                    ValueError,
                    KeyError,
                    TypeError,
                    OSError,
                    RuntimeError,
                ) as error:
                    if call:
                        gateway.ledger.finish(
                            call, "uncertain_failure_reservation_retained"
                        )
                    data = json.dumps(
                        {
                            "error": {
                                "message": str(error),
                                "type": "sample_budget_guard",
                            }
                        }
                    ).encode()
                    status = 429
                self.send_response(status)
                self.send_header(
                    "Content-Type",
                    "text/event-stream"
                    if status == 200 and payload.get("stream")
                    else "application/json",
                )
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                try:
                    self.wfile.write(data)
                except BrokenPipeError:
                    pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)

    def start(self):
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return "http://127.0.0.1:" + str(self.server.server_port)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
