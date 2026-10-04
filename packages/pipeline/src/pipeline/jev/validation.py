"""Fail-closed transport metering for full answer/retrieval validation campaigns.

All providers share the same ledger. Model rates and output bounds must be
explicitly confirmed in a local pricing file. Unknown endpoints/models never
execute. Unreadable or streaming usage retains the full reservation.
"""
import json
import os
from pathlib import Path

from pipeline.jev.budget import Ledger
from pipeline.jev.client import canonical, digest


def reserve_transport(url: str, body: dict, *, ledger_path: Path, pricing_path: Path) -> dict:
    from urllib.parse import urlparse
    host = urlparse(url).hostname
    providers = {"api.openai.com": "openai", "api.anthropic.com": "anthropic",
                 "api.voyageai.com": "voyage", "api.typesafe.ai": "typesafe"}
    if host not in providers:
        raise ValueError("pending_pricing: unknown paid transport")
    provider = providers[host]
    prices = json.loads(pricing_path.read_text())
    if prices.get("confirmed") is not True:
        raise ValueError("pending_pricing: current provider pricing must be confirmed")
    model = body.get("model")
    rate = prices.get("models", {}).get(model)
    if not isinstance(rate, dict) or rate.get("provider") != provider:
        raise ValueError("pending_pricing: unknown model")
    for key in ("inputPerMillion", "outputPerMillion"):
        value = rate.get(key)
        if type(value) not in (int, float) or not 0 <= value < 1_000_000:
            raise ValueError("Invalid model pricing")
    bounded_body = dict(body)
    output_bound = 0
    if provider in {"openai", "anthropic"}:
        output_bound = rate.get("maxOutputTokens")
        if type(output_bound) is not int or not 1 <= output_bound <= 128_000:
            raise ValueError("pending_budget: model requires an enforced output bound")
        key = "max_output_tokens" if "/responses" in url else ("max_completion_tokens" if "max_completion_tokens" in body else "max_tokens")
        configured = body.get(key, body.get("max_completion_tokens", output_bound))
        if type(configured) is not int or configured < 1:
            raise ValueError("pending_budget: invalid output limit")
        output_bound = min(output_bound, configured)
        bounded_body[key] = output_bound
    tools = bounded_body.get("tools", [])
    if any(isinstance(t, dict) and t.get("type") != "function" for t in tools):
        raise ValueError("pending_pricing: hosted tools are unbounded")
    if any(token in canonical(bounded_body) for token in ('"image_url"', '"file_id"', '"web_search"', '"code_interpreter"', '"file_search"')):
        raise ValueError("pending_pricing: hosted tools and nontext inputs are unbounded")
    input_bound = (64_000 * (len(body.get("questions", {})) + 1) + 4096) if provider == "typesafe" else len(canonical(bounded_body).encode()) + 4096
    ceiling = rate.get("maxInputTokens")
    if ceiling is not None and (type(ceiling) is not int or ceiling < 1 or input_bound > ceiling):
        raise ValueError("pending_pricing: request exceeds confirmed input price tier")
    multiplier = rate.get("inputMultiplier", 1.25 if provider == "anthropic" else 1)
    if type(multiplier) not in (int, float) or not 1 <= multiplier <= 100:
        raise ValueError("Invalid conservative input pricing multiplier")
    if provider == "anthropic" and '"ttl":"1h"' in canonical(body):
        raise ValueError("pending_pricing: hourly cache writes require separate confirmed pricing")
    input_rate = rate["inputPerMillion"] * multiplier
    bound = (input_bound * input_rate + output_bound * rate["outputPerMillion"]) / 1_000_000
    ledger = Ledger(ledger_path)
    try:
        reservation = ledger.reserve(provider, model, digest(bounded_body), bound)
        return {"id": reservation, "body": bounded_body, "rate": rate, "boundUsd": bound}
    finally:
        ledger.close()


def settle_transport(reservation: dict, usage: dict, ledger_path: Path) -> None:
    input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", usage.get("total_tokens")))
    output_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))
    if type(input_tokens) is not int or type(output_tokens) is not int or min(input_tokens, output_tokens) < 0:
        return  # Unknown usage retains full charge.
    rate = reservation["rate"]
    input_tokens += usage.get("cache_read_input_tokens", 0) + usage.get("cache_creation_input_tokens", 0)
    input_rate = rate["inputPerMillion"] * rate.get("inputMultiplier", 1.25 if rate["provider"] == "anthropic" else 1)
    cost = (input_tokens * input_rate + output_tokens * rate["outputPerMillion"]) / 1_000_000
    ledger = Ledger(ledger_path)
    try:
        ledger.settle(reservation["id"], cost, canonical(usage))
    finally:
        ledger.close()


def install_httpx_budget() -> None:
    """Install only inside explicitly budgeted validation commands."""
    import httpx
    if getattr(httpx.Client.send, "_jev_metered", False):
        return
    original = httpx.Client.send
    ledger_path = Path(os.environ["JEV_VALIDATION_LEDGER"])
    pricing_path = Path(os.environ["JEV_VALIDATION_PRICING"])

    def metered_send(client, request, **kwargs):
        reservation = reserve_transport(str(request.url), json.loads(request.content),
                                        ledger_path=ledger_path, pricing_path=pricing_path)
        headers = dict(request.headers)
        headers.pop("content-length", None)
        bounded = httpx.Request(request.method, request.url, headers=headers,
                                content=canonical(reservation["body"]).encode(), extensions=request.extensions)
        response = original(client, bounded, **kwargs)
        if response.is_success and not kwargs.get("stream"):
            try:
                usage = response.json().get("usage")
            except (ValueError, AttributeError):
                usage = None
            if usage:
                settle_transport(reservation, usage, ledger_path)
        return response
    metered_send._jev_metered = True
    httpx.Client.send = metered_send


def run_answer_validation(output: Path, ledger_path: Path, pricing_path: Path) -> dict:
    """Three paired full runs, or explicit pending status; never weaken checks."""
    from pipeline.jev.benchmarks import freeze
    output.mkdir(parents=True, exist_ok=True)
    ledger = Ledger(ledger_path)
    ledger.close()
    if not pricing_path.exists() or json.loads(pricing_path.read_text()).get("confirmed") is not True:
        return {"status": "pending_pricing"}
    from pipeline.jev.reports import PendingQualification, compare_answers, reviewed_role_configuration
    try:
        qualification = reviewed_role_configuration(output)
    except PendingQualification as error:
        return {"status": error.status}
    frames_path = output / "section-frames.json"
    from pipeline.jev.benchmarks import read_frozen
    if not frames_path.exists():
        return {"status": "pending_frame_evidence"}
    frames = read_frozen(frames_path)
    if frames.get("qualificationHash") != qualification["qualificationHash"]:
        raise ValueError("Frame evidence qualification mismatch")
    if frames.get("status") != "frame_gates_passed":
        return {"status": "failed_frame_gate"}
    from pipeline.jev.reports import require_qualification_corpus
    require_qualification_corpus(output)
    os.environ["JEV_VALIDATION_LEDGER"] = str(ledger_path.resolve())
    os.environ["JEV_VALIDATION_PRICING"] = str(pricing_path.resolve())
    os.environ["JEV_SECTION_ROLE_ALLOWLIST"] = ",".join(sorted(qualification["qualifiedRoles"]))
    freeze(output / "answer-campaign.json", {"version": 1, "pricingHash": digest(json.loads(pricing_path.read_text())),
                                            "ledger": str(ledger_path.resolve()), "pairs": 3, "qualificationHash": qualification["qualificationHash"]})
    install_httpx_budget()
    from pipeline.eval.runner import run_eval
    from pipeline.evaluation_evidence import evaluation_fingerprint, require_complete_results
    arms = {"baseline": [], "candidate": []}
    for attempt in range(3):
        for arm in arms:
            os.environ["JEV_SECTION_ROLES_ENABLED"] = "true" if arm == "candidate" else "false"
            path = output / f"{arm}-{attempt + 1}.json"
            fingerprint = evaluation_fingerprint()
            if path.exists():
                saved = json.loads(path.read_text())
                if saved["fingerprint"] != fingerprint or saved.get("qualificationHash") != qualification["qualificationHash"]:
                    raise ValueError("Saved answer evidence configuration mismatch")
            else:
                try:
                    retrieval = run_eval("retrieval")
                    answer = run_eval("answer")
                    require_complete_results(retrieval, answer)
                except (ValueError, RuntimeError):
                    return {"status": "pending_budget_or_infrastructure", "completedPairs": attempt}
                if fingerprint != evaluation_fingerprint():
                    raise ValueError("Validation configuration changed during run")
                saved = {"schemaVersion": 1, "qualificationHash": qualification["qualificationHash"], "fingerprint": fingerprint, "retrieval": retrieval, "answer": answer}
                path.write_text(canonical(saved) + "\n")
            arms[arm].append(saved)
    result = compare_answers(arms["baseline"], arms["candidate"])
    freeze(output / "answer-comparison.json", result)
    return result
