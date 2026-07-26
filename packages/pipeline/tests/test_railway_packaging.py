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
        "railway_cli redeploy"
    )
