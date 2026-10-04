"""Create consistent SQLite snapshots for streaming corpus backups."""
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages/pipeline/src"))
from pipeline.jev.artifacts import validate_release_label_references  # noqa: E402


def snapshot_databases(root: Path, destination: Path) -> int:
    count = 0
    for package in ("crawler", "pipeline"):
        for path in (root / package).rglob("*.db"):
            target = destination / path.relative_to(root)
            target = target.with_name(target.name + ".sqlite-snapshot")
            target.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as source:
                with sqlite3.connect(target) as output:
                    source.backup(output)
            count += 1
    releases = []
    for path in sorted((root / "pipeline/releases").rglob("*.json")):
        payload = path.read_bytes()
        releases.append(json.loads(payload))
        target = destination / path.relative_to(root)
        target = target.with_name(target.name + ".sqlite-snapshot")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    labels = root / "pipeline/section-labels"
    # Archive these exact captured bytes, never a later read of the live directory.
    files = {}
    for path in sorted(labels.rglob("*.json")):
        relative = path.relative_to(root)
        payload = path.read_bytes()
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        files[str(relative)] = "sha256:" + hashlib.sha256(payload).hexdigest()
    validate_release_label_references(releases, destination / "pipeline/section-labels")
    for name in files:
        path = destination / name
        path.rename(path.with_name(path.name + ".sqlite-snapshot"))
    inventory = {"version": 1, "files": files}
    target = destination / "pipeline/section-labels-backup.json.sqlite-snapshot"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(inventory, sort_keys=True))
    return count


if __name__ == "__main__":
    snapshot_databases(Path(sys.argv[1]), Path(sys.argv[2]))
