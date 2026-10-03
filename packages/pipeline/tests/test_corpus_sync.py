import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest


def test_sync_and_restore_preserve_relocation_proof_and_replay_journal(tmp_path):
    if not shutil.which("sqlite3"):
        pytest.skip("sqlite3 command is required by the production sync script")
    root = tmp_path / "corpus"
    files = {
        "crawler/documents/dhhs-policies/form.pdf": b"%PDF-recovered",
        "crawler/documents/.recovery-evidence/proof/identity-evidence.json": b'{"schema_version":1}',
        "crawler/documents/.recovery-evidence/proof/captures/index.bin": b"official identity capture",
        "crawler/recovery-journal/recovery.json": b'{"identityEvidenceHash":"proof"}',
        "pipeline/parsed/dhhs-policies/form.json": b'{"sections":[]}',
    }
    for name, body in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    with sqlite3.connect(root / "crawler/crawler.db") as db:
        db.execute("CREATE TABLE documents(source_url TEXT)")
        db.execute("INSERT INTO documents VALUES('https://policies-inactive.ncdhhs.gov/original.pdf')")
    binaries = tmp_path / "bin"
    binaries.mkdir()
    fake = binaries / "rclone"
    fake.write_text(f"#!{sys.executable}\n" + '''import os,sys,shutil
from pathlib import Path
args=sys.argv[1:]
def resolve(value):
    if value.startswith('release:'):
        return Path(os.environ['TEST_OBJECT_ROOT']) / value.split('/',1)[1]
    return Path(value)
command=args[0];source=resolve(args[1])
if command=='lsf':
    if source.is_dir():
        print('\\n'.join(sorted(p.name for p in source.iterdir())))
    elif source.is_file():
        print(source.name)
elif command in {'copy','sync','copyto'}:
    destination=resolve(args[2]);destination.parent.mkdir(parents=True,exist_ok=True)
    if source.is_dir():
        if command=='sync' and destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(source,destination,dirs_exist_ok=True)
    else:
        shutil.copy2(source,destination)
else:
    raise RuntimeError('Unexpected rclone command')
''')
    fake.chmod(0o700)
    environment = {
        **os.environ,
        "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
        "CORPUS_DATA_ROOT": str(root),
        "TEST_OBJECT_ROOT": str(tmp_path / "object-storage"),
        "BUCKET": "test-bucket",
        "ACCESS_KEY_ID": "fixture",
        "SECRET_ACCESS_KEY": "fixture",
        "ENDPOINT": "https://fixture.invalid",
    }
    scripts = Path(__file__).resolve().parents[3] / "scripts/ops"
    subprocess.run(["bash", str(scripts / "sync-current-corpus.sh")], env=environment, check=True, capture_output=True)
    environment["CORPUS_DATA_ROOT"] = str(tmp_path / "restored")
    subprocess.run(["bash", str(scripts / "restore-corpus-artifacts.sh")], env=environment, check=True, capture_output=True)
    restored = tmp_path / "restored"
    for name, body in files.items():
        assert (restored / name).read_bytes() == body
    with sqlite3.connect(restored / "crawler/crawler.db") as db:
        assert db.execute("SELECT source_url FROM documents").fetchone()[0] == "https://policies-inactive.ncdhhs.gov/original.pdf"
    # Missing local history is an incomplete corpus, not permission to silently
    # retain stale remote journals or erase their only remaining copy.
    shutil.rmtree(root / "crawler/recovery-journal")
    environment["CORPUS_DATA_ROOT"] = str(root)
    rejected = subprocess.run(["bash", str(scripts / "sync-current-corpus.sh")], env=environment, capture_output=True)
    assert rejected.returncode != 0
    remote_journal = tmp_path / "object-storage/corpus/current/crawler/recovery-journal/recovery.json"
    assert remote_journal.read_bytes() == files["crawler/recovery-journal/recovery.json"]
    # An explicitly empty local directory does mirror removal.
    (root / "crawler/recovery-journal").mkdir()
    subprocess.run(["bash", str(scripts / "sync-current-corpus.sh")], env=environment, check=True, capture_output=True)
    assert not remote_journal.exists()
