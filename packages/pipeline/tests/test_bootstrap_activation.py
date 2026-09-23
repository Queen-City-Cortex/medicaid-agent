import json
import stat

import pytest

from pipeline.bootstrap_activation import activate


class FakeRailway:
    def __init__(self, failure=None):
        self.current = {
            "NEO4J_URI": "bolt://legacy",
            "NEO4J_PASSWORD": "private",
            "CORPUS_RELEASE_ID": "legacy",
            "UNRELATED": "keep",
        }
        self.failure = failure
        self.targets = []

    def variables(self):
        return dict(self.current)

    def set_target(self, target):
        self.targets.append(dict(target))
        for key, value in target.items():
            if value is None:
                self.current.pop(key, None)
            else:
                self.current[key] = value
        if self.failure == "deploy" and target["CORPUS_RELEASE_ID"] == "new":
            raise RuntimeError("deploy failed")
        return "deployment"

    def verify(self, release):
        if self.failure == "smoke" and release == "new":
            raise RuntimeError("withheld smoke")
        assert self.current["CORPUS_RELEASE_ID"] == release


def args(tmp_path, railway):
    return {
        "state_path": tmp_path / "private/state.json",
        "release_id": "new",
        "target": {
            "NEO4J_URI": "bolt://blue",
            "NEO4J_PASSWORD": "new-private",
            "CORPUS_RELEASE_ID": "new",
            "ACTIVE_CORPUS_COLOR": "blue",
        },
        "railway": railway,
        "preflight": lambda: None,
        "publish": lambda receipt: None,
        "browser_check": lambda *args: {"releaseId": "new"},
    }


def test_success_and_repeated_activation_do_not_redeploy(tmp_path):
    railway = FakeRailway()
    options = args(tmp_path, railway)
    assert activate(**options)["status"] == "promoted"
    assert activate(**options)["status"] == "already_promoted"
    assert len(railway.targets) == 1
    assert stat.S_IMODE(options["state_path"].stat().st_mode) == 0o600
    assert stat.S_IMODE(options["state_path"].parent.stat().st_mode) == 0o700


@pytest.mark.parametrize("failure", ["deploy", "smoke", "browser", "publish"])
def test_failure_restores_exact_legacy_configuration(tmp_path, failure):
    railway = FakeRailway(failure)
    original = railway.variables()
    options = args(tmp_path, railway)

    def fail(*args):
        raise RuntimeError("failure")

    if failure == "browser":
        options["browser_check"] = fail
    if failure == "publish":
        options["publish"] = fail
    with pytest.raises(RuntimeError):
        activate(**options)
    assert railway.variables() == original
    assert "ACTIVE_CORPUS_COLOR" not in railway.variables()
    assert json.loads(options["state_path"].read_text())["status"] == "restored"


def test_failed_preflight_does_not_mutate_target(tmp_path):
    railway = FakeRailway()
    options = args(tmp_path, railway)

    def fail():
        raise ValueError("source changed")

    options["preflight"] = fail
    with pytest.raises(ValueError):
        activate(**options)
    assert railway.targets == []


def test_interrupted_cutover_restores_before_attempting_new_work(tmp_path):
    railway = FakeRailway()
    options = args(tmp_path, railway)
    previous = railway.variables()
    previous.pop("UNRELATED")
    previous["ACTIVE_CORPUS_COLOR"] = None
    railway.set_target(options["target"])
    state = options["state_path"]
    state.parent.mkdir()
    state.write_text(
        json.dumps({"releaseId": "new", "status": "switching", "previous": previous})
    )
    assert activate(**options)["status"] == "restored_interrupted_cutover"
    assert railway.current["CORPUS_RELEASE_ID"] == "legacy"
    assert "ACTIVE_CORPUS_COLOR" not in railway.current


def test_failed_restoration_keeps_recovery_checkpoint(tmp_path):
    railway = FakeRailway("smoke")
    options = args(tmp_path, railway)

    def fail():
        raise RuntimeError("unable to upload restoration record")

    options["restore_record"] = fail
    with pytest.raises(RuntimeError, match="checkpoint retained"):
        activate(**options)
    assert json.loads(options["state_path"].read_text())["status"] == "recovery_pending"


def test_wrong_baseline_release_cannot_switch_target(tmp_path):
    railway = FakeRailway()
    with pytest.raises(ValueError, match="Baseline"):
        activate(**args(tmp_path, railway), baseline_release_id="different-legacy")
    assert railway.targets == []


def test_railway_waits_for_exact_deployment_and_restores_absent_keys(monkeypatch):
    from pipeline.bootstrap_activation import RailwayTarget

    for key in [
        "RAILWAY_PROJECT_ID",
        "RAILWAY_ENVIRONMENT_ID",
        "RAILWAY_AGENT_SERVICE_ID",
    ]:
        monkeypatch.setenv(key, key)
    target = RailwayTarget()
    mutations, deployments = [], []

    def api(query, variables):
        if query.startswith("query"):
            return {
                "variables": {
                    "NEO4J_URI": "blue",
                    "ACTIVE_CORPUS_COLOR": "blue",
                    "OTHER": "${{shared.VALUE}}",
                }
            }
        mutations.append(variables["input"])
        return {"variableCollectionUpsert": True}

    def run(args, **kwargs):
        if args[0] == "redeploy":
            deployments.append("new-deploy")
            return json.dumps({"id": "new-deploy"})
        if deployments == ["new-deploy"]:
            deployments.append("polled")
            return json.dumps(
                [
                    {"id": "old-deploy", "status": "SUCCESS"},
                    {"id": "new-deploy", "status": "BUILDING"},
                ]
            )
        return json.dumps([{"id": "new-deploy", "status": "SUCCESS"}])

    monkeypatch.setattr(target, "api", api)
    monkeypatch.setattr(target, "run", run)
    monkeypatch.setattr("pipeline.bootstrap_activation.time.sleep", lambda _: None)
    assert (
        target.set_target(
            {
                "NEO4J_URI": "legacy",
                "NEO4J_PASSWORD": "private",
                "CORPUS_RELEASE_ID": "legacy",
                "ACTIVE_CORPUS_COLOR": None,
            }
        )
        == "new-deploy"
    )
    assert deployments == ["new-deploy", "polled"]
    assert len(mutations) == 1
    assert mutations[0]["skipDeploys"] is True
    assert mutations[0]["replace"] is True
    assert "ACTIVE_CORPUS_COLOR" not in mutations[0]["variables"]
    assert mutations[0]["variables"]["OTHER"] == "${{shared.VALUE}}"


def test_ready_200_for_stale_release_does_not_run_smoke(monkeypatch):
    import io
    from pipeline.bootstrap_activation import RailwayTarget

    for key in [
        "RAILWAY_PROJECT_ID",
        "RAILWAY_ENVIRONMENT_ID",
        "RAILWAY_AGENT_SERVICE_ID",
    ]:
        monkeypatch.setenv(key, key)
    monkeypatch.setenv("AGENT_PUBLIC_URL", "https://agent.invalid")
    times = iter([0, 1, 301])
    monkeypatch.setattr(
        "pipeline.bootstrap_activation.time.monotonic", lambda: next(times)
    )
    monkeypatch.setattr("pipeline.bootstrap_activation.time.sleep", lambda _: None)
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *a, **k: io.BytesIO(b'{"status":"ok","releaseId":"old"}'),
    )
    monkeypatch.setattr(
        "pipeline.bootstrap_activation.subprocess.run",
        lambda *a, **k: pytest.fail("smoke ran against stale deployment"),
    )
    with pytest.raises(RuntimeError, match="Expected graph-backed"):
        RailwayTarget().verify("new")


def test_api_uses_project_auth_without_cli_api_or_exposing_secret(monkeypatch):
    import io
    from pipeline.bootstrap_activation import RailwayTarget

    for key in [
        "RAILWAY_PROJECT_ID",
        "RAILWAY_ENVIRONMENT_ID",
        "RAILWAY_AGENT_SERVICE_ID",
    ]:
        monkeypatch.setenv(key, key)
    monkeypatch.setenv("RAILWAY_TOKEN", "private-project-token")
    seen = []

    def request(req, timeout):
        seen.append(req)
        return io.BytesIO(b'{"data":{"ok":true}}')

    monkeypatch.setattr("pipeline.bootstrap_activation.urlopen", request)
    assert RailwayTarget().api("query {ok}", {}) == {"ok": True}
    assert seen[0].get_header("Project-access-token") == "private-project-token"
    assert seen[0].get_header("User-agent") == "nc-medicaid-corpus-release/1"
    assert json.loads(seen[0].data) == {"query": "query {ok}", "variables": {}}
