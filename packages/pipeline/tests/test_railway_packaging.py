import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_railway_corpus_image_delegates_storage_to_platform_volume() -> None:
    dockerfile = (REPO_ROOT / "packages/pipeline/Dockerfile").read_text()

    assert not any(
        line.lstrip().upper().startswith("VOLUME ")
        for line in dockerfile.splitlines()
    )
    assert "CORPUS_DATA_ROOT=/data" in dockerfile


def test_railway_corpus_job_exposes_guarded_bootstrap_mode() -> None:
    entrypoint = (
        REPO_ROOT / "scripts/ops/railway-corpus-job.sh"
    ).read_text()
    release_script = (REPO_ROOT / "scripts/ops/corpus-release.sh").read_text()

    assert 'bootstrap) "$REPO_ROOT/scripts/ops/corpus-release.sh" bootstrap' in (
        entrypoint
    )
    assert "HC_URL=\"${HC_URL_CORPUS_JOB:-}\"" in entrypoint
    assert "hc_trap" in entrypoint
    assert "\nhc_ok\n" in entrypoint
    assert "bootstrap) exec " not in entrypoint
    assert 'expected_confirmation="$target_service"' in release_script
    assert (
        '[[ "${BOOTSTRAP_RESET_CONFIRM:-}" == "$expected_confirmation" ]]'
        in release_script
    )
    assert (
        '[[ "$current_uri" != "$target_uri" ]]'
        in release_script
    )
    assert "Refusing to bootstrap the graph currently serving the agent" in (
        release_script
    )
    bootstrap = release_script.split("bootstrap() {", 1)[1].split(
        "\npromote() {", 1
    )[0]
    assert "release-retention-check" in bootstrap
    assert bootstrap.index("release-retention-check") < bootstrap.index(
        "redeploy_graph"
    )
    assert "redeploy_graph" in bootstrap


def run_release_shell(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        text=True,
    )


def test_deployment_wait_tracks_the_redeploy_id_until_success(tmp_path: Path) -> None:
    marker = tmp_path / "deployment-polled"
    result = run_release_shell(
        f"""
        source scripts/ops/corpus-release.sh
        railway_cli() {{
          if [[ -f "{marker}" ]]; then
            printf '[{{"id":"new-deployment","status":"SUCCESS"}}]\\n'
          else
            touch "{marker}"
            printf '[{{"id":"new-deployment","status":"DEPLOYING"}}]\\n'
          fi
        }}
        sleep() {{ :; }}
        wait_for_railway_deployment neo4j-blue new-deployment
        """
    )
    assert result.returncode == 0, result.stderr


def test_deployment_wait_propagates_terminal_failure() -> None:
    result = run_release_shell(
        """
        source scripts/ops/corpus-release.sh
        railway_cli() {
          printf '[{"id":"new-deployment","status":"CRASHED"}]\\n'
        }
        sleep() { :; }
        wait_for_railway_deployment neo4j-blue new-deployment
        """
    )
    assert result.returncode == 1
    assert "ended as CRASHED" in result.stderr


def test_deployment_wait_times_out_when_id_never_appears() -> None:
    result = run_release_shell(
        """
        source scripts/ops/corpus-release.sh
        railway_cli() { printf '[]\\n'; }
        sleep() { :; }
        RAILWAY_DEPLOYMENT_WAIT_ATTEMPTS=2 \
          wait_for_railway_deployment neo4j-blue missing-deployment
        """
    )
    assert result.returncode == 1
    assert "did not become ready" in result.stderr


def test_redeploy_graph_does_not_probe_after_deployment_failure() -> None:
    result = run_release_shell(
        """
        source scripts/ops/corpus-release.sh
        railway_cli() { printf '{"id":"new-deployment"}\\n'; }
        wait_for_railway_deployment() { return 7; }
        wait_for_graph() { echo "readiness probe should not run" >&2; return 0; }
        if redeploy_graph neo4j-blue bolt://blue:7687 secret; then
          exit 99
        else
          exit $?
        fi
        """
    )
    assert result.returncode == 7
    assert "readiness probe should not run" not in result.stderr
