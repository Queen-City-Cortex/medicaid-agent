#!/usr/bin/env python3
"""Run six private diagnostic CLI questions behind the finite cost gateway."""

import argparse
import hashlib
import importlib.util
import json
import os
import signal
import subprocess
import time
from pathlib import Path


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--private-settings", type=Path, required=True)
    args = parser.parse_args()
    if not args.checkout.is_absolute() or not args.output.is_absolute():
        raise ValueError("Absolute isolated paths required")
    if (
        (args.checkout / ".git").exists()
        or args.checkout.name != "checkout"
        or args.checkout.parent != args.output.parent
    ):
        raise ValueError(
            "Use a private archived checkout beside the new output directory"
        )
    args.output.mkdir(mode=0o700, exist_ok=False)
    settings = json.loads(args.private_settings.read_text())
    if settings.get("AGENT_MODEL") != "gpt-5.4":
        raise ValueError("This sample is priced for the observed GPT-5.4 deployment")
    spec = importlib.util.spec_from_file_location(
        "sample_gateway", Path(__file__).with_name("sample-budget-gateway.py")
    )
    gateway_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gateway_module)
    gateway = gateway_module.Gateway(args.output, settings)
    url = gateway.start()
    ids = ["q-001", "q-004", "q-006", "q-012", "q-030", "q-048"]
    dataset = json.loads(
        (args.checkout / "packages/pipeline/data/golden/dataset.json").read_text()
    )
    entries = {entry["id"]: entry for entry in dataset}
    index = args.checkout / "packages/agent/src/index.ts"
    index_before = hashlib.sha256(index.read_bytes()).hexdigest()
    marker = "const result = await agent.generate(CLI_QUESTION, {"
    content = index.read_text()
    if content.count(marker) != 1:
        raise ValueError("Unknown CLI entry point; refuse to patch the private sample")
    index.write_text(
        content.replace(
            marker, marker + "\n      providerOptions: { openai: { store: false } },", 1
        )
    )
    source_files = [
        args.checkout / "packages/agent/src/index.ts",
        args.checkout / "packages/agent/src/prompt.ts",
        args.checkout / "packages/agent/src/processors/verifier/verify.ts",
        args.checkout / "package-lock.json",
    ]
    receipt = {
        "mode": "Private live-legacy CLI cost diagnostic, not qualification or a browser/memory evaluation",
        "questionIds": ids,
        "sampleOnlyServerStorageDisabled": True,
        "unmodifiedIndexSha256": index_before,
        "approvedTask": "Proceed with audit and sample",
        "chosenMaximumSpendUsd": gateway_module.CAP_USD,
        "agentModel": "gpt-5.4",
        "verifierModel": "gpt-5.6-terra",
        "judgeInvoked": False,
        "generationOutputTokenLimit": gateway_module.MAX_OUTPUT,
        "sourceHashes": {
            str(p.relative_to(args.checkout)): hashlib.sha256(
                p.read_bytes()
            ).hexdigest()
            for p in source_files
        },
        "startedAt": time.time(),
        "results": [],
    }
    (args.output / "sample-manifest.json").write_text(json.dumps(receipt, indent=2))
    try:
        for qid in ids:
            diagnostics = args.output / (qid + "-diagnostics")
            diagnostics.mkdir(mode=0o700)
            env = {
                k: v
                for k, v in os.environ.items()
                if k in ["PATH", "HOME", "LANG", "LC_ALL"]
            }
            env.update(
                NODE_ENV="test",
                OPENAI_API_KEY="sample-placeholder",
                VOYAGE_API_KEY="sample-placeholder",
                ANTHROPIC_API_KEY="sample-placeholder",
                EXA_API_KEY="",
                SENTRY_DSN="",
                WORKOS_API_KEY="sk_sample_placeholder",
                WORKOS_CLIENT_ID="client_sample_placeholder",
                WORKOS_REDIRECT_URI="http://localhost:3000/auth/callback",
                WORKOS_SIGNOUT_URI="http://localhost:3000/",
                OPENAI_BASE_URL=url + "/v1",
                SAMPLE_GATEWAY_URL=url,
                SAMPLE_GATEWAY_NONCE=gateway.nonce,
                SAMPLE_QUESTION_ID=qid,
                AGENT_MODEL="gpt-5.4",
                VERIFIER_MODEL="gpt-5.6-terra",
                VERIFIER_ENABLED="true",
                TRACE_STORE="off",
                MASTRA_OBSERVABILITY_PATH=":memory:",
                DATABASE_URL="file:" + str(args.output / (qid + ".db")),
                VERIFIER_PRIVATE_DIAGNOSTICS_DIR=str(diagnostics),
                NEO4J_IDLE_CLOSE_MS="0",
                CORPUS_RELEASE_ID=settings.get("CORPUS_RELEASE_ID", ""),
            )
            for key in ["NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"]:
                env[key] = settings[key]
            command = [
                "node",
                "--import",
                "tsx",
                "--import",
                str(args.checkout / "scripts/ops/sample-budget-preload.mjs"),
                "src/index.ts",
                entries[qid]["question"],
            ]
            started = time.monotonic()
            with (args.output / (qid + ".log")).open("wb") as log:
                child = subprocess.Popen(
                    command,
                    cwd=args.checkout / "packages/agent",
                    env=env,
                    stdout=log,
                    stderr=log,
                    start_new_session=True,
                )
                try:
                    code = child.wait(timeout=180)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                    code = -9
            text = (args.output / (qid + ".log")).read_text(errors="replace")
            outcome = None
            if "\n---VERIFIER---\n" in text:
                try:
                    outcome = json.loads(
                        text.split("\n---VERIFIER---\n")[-1].strip().splitlines()[0]
                    )
                except (ValueError, IndexError):
                    pass
            calls = [c for c in gateway.ledger.calls if c["questionId"] == qid]
            result = {
                "questionId": qid,
                "exitCode": code,
                "elapsedSeconds": time.monotonic() - started,
                "providerRequests": len(calls),
                "knownUsageCostUsd": sum(c.get("usageCostUsd", 0) for c in calls),
                "committedUsd": sum(c["debitUsd"] for c in calls),
                "verifier": outcome,
            }
            receipt["results"].append(result)
            (args.output / "sample-manifest.json").write_text(
                json.dumps(receipt, indent=2)
            )
            print(
                qid,
                "exit",
                code,
                "requests",
                len(calls),
                "usage cost",
                round(result["knownUsageCostUsd"], 5),
                flush=True,
            )
            if (
                not calls
                or gateway.ledger.calls
                and sum(c["debitUsd"] for c in gateway.ledger.calls)
                >= gateway_module.CAP_USD
            ):
                break
    finally:
        gateway.close()
        receipt["finishedAt"] = time.time()
        receipt["completeQuestionCount"] = len(receipt["results"])
        (args.output / "sample-manifest.json").write_text(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
