import json

from pipeline.freshness import (
    acknowledge_answer_ready_snapshot,
    build_answer_ready_snapshot,
    compare_answer_ready_snapshot,
)


def write_meta(root, name, **overrides):
    path = root / f"{name}.meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "parse_status": "parsed",
        "answer_ready": True,
        "quality_flags": [],
        "source_file_hash": f"sha256:{name}",
        **overrides,
    }
    path.write_text(json.dumps(payload))
    return path


def test_snapshot_only_includes_successful_answer_ready_documents(tmp_path):
    write_meta(tmp_path, "ready")
    write_meta(
        tmp_path,
        "quarantined",
        parse_status="unsupported_format",
        answer_ready=False,
    )
    write_meta(tmp_path, "bad-quality", quality_flags=["zero_section_parse"])

    snapshot = build_answer_ready_snapshot(tmp_path)

    assert snapshot["answer_ready_documents"] == 1


def test_snapshot_change_detection_is_stable_and_atomic(tmp_path):
    parsed = tmp_path / "parsed"
    state = tmp_path / "state" / "snapshot.json"
    write_meta(parsed, "one")

    first = compare_answer_ready_snapshot(state, parsed)
    acknowledge_answer_ready_snapshot(state, first)
    second = compare_answer_ready_snapshot(state, parsed)
    acknowledge_answer_ready_snapshot(state, second)
    write_meta(parsed, "two")
    third = compare_answer_ready_snapshot(state, parsed)
    acknowledge_answer_ready_snapshot(state, third)

    assert first["changed"] is True
    assert second["changed"] is False
    assert third["changed"] is True
    assert json.loads(state.read_text())["snapshot_hash"] == third["snapshot_hash"]


def test_unacknowledged_snapshot_remains_retryable(tmp_path):
    parsed = tmp_path / "parsed"
    state = tmp_path / "state" / "snapshot.json"
    write_meta(parsed, "one")

    first_attempt = compare_answer_ready_snapshot(state, parsed)
    retry_attempt = compare_answer_ready_snapshot(state, parsed)

    assert first_attempt["changed"] is True
    assert retry_attempt["changed"] is True
    assert not state.exists()
