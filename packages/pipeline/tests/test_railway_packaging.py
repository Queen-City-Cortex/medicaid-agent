import os
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


def test_railway_corpus_image_installs_and_smoke_tests_opencv_runtime() -> None:
    dockerfile = (REPO_ROOT / "packages/pipeline/Dockerfile").read_text()

    assert "libgl1" in dockerfile
    assert '.venv/bin/python -c "import cv2"' in dockerfile


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
    # The checks that keep a reset away from the serving graph live in one
    # helper, which bootstrap and measure both call before the graph restarts.
    guard = release_script.split("require_reset_target() {", 1)[1].split("\nbootstrap() {", 1)[0]
    assert 'expected_confirmation="$RESET_TARGET_SERVICE"' in guard
    assert '[[ "${BOOTSTRAP_RESET_CONFIRM:-}" == "$expected_confirmation" ]]' in guard
    assert '[[ "$current_uri" != "$RESET_TARGET_URI" ]]' in guard
    assert "Refusing to reset the graph currently serving the agent" in guard
    assert "release-retention-check" in guard
    bootstrap = release_script.split("\nbootstrap() {", 1)[1].split("\nrequire_measure_inputs() {", 1)[0]
    assert bootstrap.index("require_reset_target") < bootstrap.index("redeploy_graph")
    inputs = release_script.split("\nrequire_measure_inputs() {", 1)[1].split("\nmeasure_check() {", 1)[0]
    assert "require_reset_target" in inputs and "RAILWAY_GIT_COMMIT_SHA" in inputs
    measure = release_script.split("\nmeasure() {", 1)[1].split("\npromote() {", 1)[0]
    assert measure.index("require_measure_inputs") < measure.index("redeploy_graph")
    assert "unset EVAL_IDENTITY_CATALOG" in measure
    for paid_or_release_step in ("release-validate", "release-preflight", "release-mark-graph", "BASELINE"):
        assert paid_or_release_step not in measure


def test_railway_corpus_job_accepts_the_recover_mode() -> None:
    entrypoint = (REPO_ROOT / "scripts/ops/railway-corpus-job.sh").read_text()

    assert 'recover) "$REPO_ROOT/scripts/ops/corpus-release.sh" recover ;;' in entrypoint
    accepted = next(
        line for line in entrypoint.splitlines() if line.startswith("  scheduled|discover|")
    )
    assert "|recover|" in accepted


def inspect_cutover(
    data_root: Path,
    *,
    release: str,
    color: str,
    uri: str | None = None,
    deployed: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run the release script's cutover check against manifests on disk."""
    return subprocess.run(
        [
            "bash",
            "-c",
            f"""
            source scripts/ops/corpus-release.sh
            agent_variables() {{
              printf '%s\\n' ACTIVE_CORPUS_COLOR={color} CORPUS_RELEASE_ID={release} \
                NEO4J_URI={uri or f"bolt://{color}"}
            }}
            color_uri() {{ printf 'bolt://%s' "$1"; }}
            download_manifest() {{ [[ -f "$2" ]]; }}
            wait_for_agent_release() {{ [[ "$1" == "{deployed or release}" ]]; }}
            inspect_cutover || exit $?
            printf '%s|%s' "$(basename "$CUTOVER_CANDIDATE")" "$(basename "$CUTOVER_PREVIOUS")"
            """,
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        text=True,
        env={
            **os.environ,
            "CORPUS_DATA_ROOT": str(data_root),
            "HOME": str(data_root),
            "AGENT_PUBLIC_URL": "https://agent.test",
        },
    )


def test_the_cutover_check_reads_the_states_the_release_commands_write(
    tmp_path: Path,
) -> None:
    """The shell fence and the Python lifecycle agree on every cutover state."""
    from pipeline.release import (
        atomic_write_json,
        create_release_manifest,
        load_json_object,
        mark_manifest_cutover_restored,
        mark_manifest_cutover_started,
        mark_manifest_promoted,
        mark_manifest_recovery_pending,
    )

    releases = tmp_path / "pipeline/releases"
    previous_path = releases / "release-1.json"
    current_path = releases / "release-2.json"
    previous = create_release_manifest(
        release_id="release-1",
        commit_sha="abcdef1",
        target_color="blue",
        source_snapshot_hash="a" * 64,
    )
    previous["promotionState"] = "promoted"
    current = create_release_manifest(
        release_id="release-2",
        commit_sha="abcdef1",
        target_color="green",
        source_snapshot_hash="b" * 64,
        previous_manifest=previous,
    )
    current["promotionState"] = "validated"
    atomic_write_json(previous_path, previous)
    atomic_write_json(current_path, current)

    def state(release: str, color: str) -> str:
        result = inspect_cutover(tmp_path, release=release, color=color)
        assert result.returncode == 0, result.stderr
        return result.stdout

    settled = "|"
    unfinished = "release-2.json|release-1.json"

    assert state("release-1", "blue") == settled

    # Stamped, agent not yet switched: the serving release says it was replaced.
    mark_manifest_cutover_started(current_path, previous_path)
    assert state("release-1", "blue") == unfinished
    # Switched, never recorded as promoted.
    assert state("release-2", "green") == unfinished
    mark_manifest_recovery_pending(current_path, "release-1", "cutover_command_failed")
    assert state("release-2", "green") == unfinished
    assert state("release-1", "blue") == unfinished

    # A recorded restore settles it, on the previous release.
    mark_manifest_cutover_restored(current_path, previous_path)
    assert state("release-1", "blue") == settled

    # A recorded promotion settles it, on the new release.
    retried = load_json_object(current_path)
    retried["promotionState"] = "validated"
    atomic_write_json(current_path, retried)
    mark_manifest_cutover_started(current_path, previous_path)
    mark_manifest_promoted(current_path, previous_manifest_path=previous_path)
    assert state("release-2", "green") == settled
    # A rollback that switched the agent back without recording it.
    assert state("release-1", "blue") == unfinished

    # Settled on paper, but the running agent reports another release.
    drifted = inspect_cutover(
        tmp_path, release="release-2", color="green", deployed="release-1"
    )
    assert drifted.returncode == 1
    assert "the variables and the running deployment disagree" in drifted.stderr

    mismatch = inspect_cutover(tmp_path, release="release-2", color="blue")
    assert mismatch.returncode == 1
    assert "correct the agent variables by hand" in mismatch.stderr
    wrong_graph = inspect_cutover(
        tmp_path, release="release-2", color="green", uri="bolt://blue"
    )
    assert wrong_graph.returncode == 1
    assert "Agent NEO4J_URI is not the green graph" in wrong_graph.stderr

    first = load_json_object(previous_path)
    first["promotionState"] = "validated"
    first.pop("supersededByReleaseId", None)
    atomic_write_json(previous_path, first)
    unpromoted_first = inspect_cutover(tmp_path, release="release-1", color="blue")
    assert unpromoted_first.returncode == 1
    assert "release-activate-bootstrap" in unpromoted_first.stderr


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


def run_restore_shell(
    tmp_path: Path,
    *,
    layout: str,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    rclone_log = tmp_path / "rclone.log"
    data_root = tmp_path / "data"
    fake_rclone = fake_bin / "rclone"
    fake_rclone.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$RCLONE_LOG"

if [[ "$1" == "lsf" ]]; then
  if [[ "$FAKE_RCLONE_LAYOUT" == "current" ]]; then
    case "$2" in
      */corpus/current/crawler)
        printf 'crawler.db\\ndocuments/\\n'
        ;;
      */corpus/current/pipeline/parsed)
        printf 'parsed.json\\n'
        ;;
    esac
  else
    case "$2" in
      */crawler/registry)
        printf 'crawler-2026-07-03.db\\ncrawler-2026-07-10.db\\n'
        ;;
      */crawler/documents)
        printf 'policy.pdf\\n'
        ;;
      */pipeline/parsed)
        printf 'policy.json\\n'
        ;;
    esac
  fi
  exit 0
fi

if [[ "$1" == "copyto" ]]; then
  mkdir -p "$(dirname "$3")"
  printf 'registry' > "$3"
  exit 0
fi

if [[ "$1" == "copy" ]]; then
  mkdir -p "$3"
  case "$2" in
    */corpus/current/crawler)
      printf 'registry' > "$3/crawler.db"
      mkdir -p "$3/documents"
      printf 'pdf' > "$3/documents/policy.pdf"
      ;;
    */crawler/documents)
      printf 'pdf' > "$3/policy.pdf"
      ;;
    */pipeline/parsed|*/corpus/current/pipeline/parsed)
      printf '{}' > "$3/policy.json"
      ;;
  esac
  exit 0
fi
"""
    )
    fake_rclone.chmod(0o755)

    env = {
        **os.environ,
        "ACCESS_KEY_ID": "test-access",
        "BUCKET": "bucket",
        "CORPUS_DATA_ROOT": str(data_root),
        "ENDPOINT": "https://objects.example.test",
        "FAKE_RCLONE_LAYOUT": layout,
        "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        "RCLONE_LOG": str(rclone_log),
        "SECRET_ACCESS_KEY": "test-secret",
    }
    result = subprocess.run(
        [str(REPO_ROOT / "scripts/ops/restore-corpus-artifacts.sh")],
        cwd=REPO_ROOT,
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )
    return result, data_root, rclone_log


def test_restore_corpus_prefers_current_object_layout(tmp_path: Path) -> None:
    result, data_root, rclone_log = run_restore_shell(
        tmp_path,
        layout="current",
    )

    assert result.returncode == 0, result.stderr
    assert (data_root / "crawler/crawler.db").is_file()
    assert (data_root / "crawler/documents/policy.pdf").is_file()
    assert (data_root / "pipeline/parsed/policy.json").is_file()
    assert "corpus/current/crawler" in rclone_log.read_text()
    assert "crawler/registry" not in rclone_log.read_text()


def test_restore_corpus_falls_back_to_legacy_object_layout(
    tmp_path: Path,
) -> None:
    result, data_root, rclone_log = run_restore_shell(
        tmp_path,
        layout="legacy",
    )

    assert result.returncode == 0, result.stderr
    assert "restoring the legacy corpus layout" in result.stdout
    assert (data_root / "crawler/crawler.db").read_text() == "registry"
    assert (data_root / "crawler/documents/policy.pdf").is_file()
    assert (data_root / "pipeline/parsed/policy.json").is_file()
    log = rclone_log.read_text()
    assert "crawler/registry/crawler-2026-07-10.db" in log
    assert "copy release:bucket/crawler/documents" in log
    assert "copy release:bucket/pipeline/parsed" in log
