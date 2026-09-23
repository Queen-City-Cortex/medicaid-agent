"""Guarded first cutover, including exact legacy restoration after interruption."""

from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from urllib.request import Request, urlopen
from datetime import UTC, datetime
from pathlib import Path

from pipeline.release import REPO_ROOT, atomic_write_json

TARGET_KEYS = (
    "NEO4J_URI",
    "NEO4J_PASSWORD",
    "CORPUS_RELEASE_ID",
    "ACTIVE_CORPUS_COLOR",
)


class RailwayTarget:
    def __init__(self):
        self.project = os.environ["RAILWAY_PROJECT_ID"]
        self.environment = os.environ["RAILWAY_ENVIRONMENT_ID"]
        self.service = os.environ["RAILWAY_AGENT_SERVICE_ID"]

    def run(self, args: list[str], *, stdin: str | None = None) -> str:
        env = {k: v for k, v in os.environ.items() if k != "RAILWAY_API_TOKEN"}
        result = subprocess.run(
            ["railway", *args],
            input=stdin,
            text=True,
            capture_output=True,
            env=env,
            timeout=120,
        )
        if result.returncode:
            # CLI output can contain variable values; never echo it.
            raise RuntimeError("Railway operation failed: " + args[0])
        return result.stdout

    def api(self, query: str, variables: dict) -> dict:
        token = os.environ.get("RAILWAY_TOKEN")
        if not token:
            raise RuntimeError("A project-scoped RAILWAY_TOKEN is required")
        request = Request(
            "https://backboard.railway.com/graphql/v2",
            data=json.dumps({"query": query, "variables": variables}).encode(),
            headers={
                "Content-Type": "application/json",
                "Project-Access-Token": token,
                "User-Agent": "nc-medicaid-corpus-release/1",
            },
        )
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.load(response)
        except (OSError, ValueError):
            raise RuntimeError("Railway API request failed") from None
        if payload.get("errors"):
            raise RuntimeError("Railway API rejected the operation")
        return payload["data"]

    def variables(self) -> dict:
        return self.api(
            "query($p:String!,$e:String!,$s:String!){variables(projectId:$p,environmentId:$e,serviceId:$s,unrendered:true)}",
            {"p": self.project, "e": self.environment, "s": self.service},
        )["variables"]

    def set_target(self, values: dict) -> str:
        # Read current unrendered values so rollback removes absent target keys
        # while retaining other settings and reference expressions.
        variables = self.variables()
        for key in TARGET_KEYS:
            if values.get(key) is None:
                variables.pop(key, None)
            else:
                variables[key] = values[key]
        self.api(
            "mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}",
            {
                "input": {
                    "projectId": self.project,
                    "environmentId": self.environment,
                    "serviceId": self.service,
                    "variables": variables,
                    "replace": True,
                    "skipDeploys": True,
                }
            },
        )
        deployment = json.loads(
            self.run(
                [
                    "redeploy",
                    "--project",
                    self.project,
                    "--service",
                    self.service,
                    "--environment",
                    self.environment,
                    "--yes",
                    "--json",
                ]
            )
        )["id"]
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            deployments = json.loads(
                self.run(
                    [
                        "deployment",
                        "list",
                        "--project",
                        self.project,
                        "--service",
                        self.service,
                        "--environment",
                        self.environment,
                        "--limit",
                        "20",
                        "--json",
                    ]
                )
            )
            status = next(
                (d["status"] for d in deployments if d["id"] == deployment), None
            )
            if status in {"SUCCESS", "SLEEPING"}:
                return deployment
            if status in {"FAILED", "CRASHED", "REMOVED", "REMOVING"}:
                raise RuntimeError("Agent deployment failed")
            time.sleep(5)
        raise RuntimeError("Agent deployment timed out")

    def verify(self, release_id: str) -> None:
        from urllib.request import urlopen

        ready = os.environ["AGENT_PUBLIC_URL"].rstrip("/") + "/readyz"
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            try:
                with urlopen(ready, timeout=20) as response:
                    data = json.load(response)
                if data.get("status") == "ok" and data.get("releaseId") == release_id:
                    break
            except (OSError, ValueError):
                pass
            time.sleep(5)
        else:
            raise RuntimeError("Expected graph-backed release did not become ready")
        result = subprocess.run(
            ["node", str(REPO_ROOT / "scripts/ops/release-smoke.mjs"), release_id],
            capture_output=True,
            text=True,
            timeout=330,
        )
        if result.returncode:
            raise RuntimeError("Authenticated verified-answer smoke failed")


def wait_browser_receipt(path: Path, release_id: str, nonce: str) -> dict:
    deadline = time.monotonic() + 600
    print(
        json.dumps(
            {
                "status": "awaiting_browser_smoke",
                "releaseId": release_id,
                "nonce": nonce,
                "receiptPath": str(path),
            }
        ),
        flush=True,
    )
    while time.monotonic() < deadline:
        if path.exists():
            receipt = json.loads(path.read_text())
            if (
                receipt.get("releaseId") != release_id
                or receipt.get("activationNonce") != nonce
                or receipt.get("outcome") not in {"passed", "corrected"}
                or receipt.get("checks") != ["thread_switch", "reload"]
            ):
                raise RuntimeError("Browser receipt does not verify this activation")
            return receipt
        time.sleep(2)
    raise RuntimeError("Browser verification timed out")


def activate(
    *,
    state_path: Path,
    release_id: str,
    target: dict,
    railway,
    preflight,
    publish,
    browser_check=wait_browser_receipt,
    restore_record=lambda: None,
    baseline_release_id: str | None = None,
) -> dict:
    state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state_path.parent, 0o700)

    def save(state):
        atomic_write_json(state_path, state)
        os.chmod(state_path, 0o600)

    def restore(state):
        state["status"] = "recovery_pending"
        save(state)
        for attempt in range(3):
            try:
                railway.set_target(state["previous"])
                railway.verify(state["previous"]["CORPUS_RELEASE_ID"])
                restore_record()
                state["status"] = "restored"
                save(state)
                return
            except Exception:
                if attempt == 2:
                    raise RuntimeError(
                        "Legacy restoration failed; recovery checkpoint retained"
                    ) from None

    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state["releaseId"] != release_id:
            raise ValueError("Activation checkpoint belongs to another release")
        if state["status"] == "promoted":
            railway.verify(release_id)
            return {"releaseId": release_id, "status": "already_promoted"}
        if state["status"] != "restored":
            restore(state)
            return {"releaseId": release_id, "status": "restored_interrupted_cutover"}

    current = railway.variables()
    previous = {key: current.get(key) for key in TARGET_KEYS}
    if previous["ACTIVE_CORPUS_COLOR"] not in {None, ""}:
        raise ValueError("Bootstrap activation requires the legacy target")
    if (
        baseline_release_id is not None
        and previous["CORPUS_RELEASE_ID"] != baseline_release_id
    ):
        raise ValueError("Baseline does not describe the current legacy release")
    if (
        not all(previous[key] for key in TARGET_KEYS[:3])
        or previous["NEO4J_URI"] == target["NEO4J_URI"]
    ):
        raise ValueError("A distinct, restorable legacy target is required")
    preflight()
    state = {
        "status": "prepared",
        "releaseId": release_id,
        "previous": previous,
        "nonce": uuid.uuid4().hex,
        "startedAt": datetime.now(UTC).isoformat(),
    }
    save(state)
    try:
        state_path.with_name("browser-receipt.json").unlink(missing_ok=True)
        state["status"] = "switching"
        save(state)
        state["deploymentId"] = railway.set_target(target)
        railway.verify(release_id)
        state["status"] = "awaiting_browser_smoke"
        save(state)
        receipt = browser_check(
            state_path.with_name("browser-receipt.json"), release_id, state["nonce"]
        )
        preflight()
        publish(receipt)
        state["status"] = "promoted"
        save(state)
        return {
            "releaseId": release_id,
            "status": "promoted",
            "deploymentId": state["deploymentId"],
        }
    except BaseException:
        restore(state)
        raise
