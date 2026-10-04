"""Durable local copies of reviews, cache evidence and a consistent ledger."""
import hashlib
import shutil
import sqlite3
from pathlib import Path

from pipeline.jev.benchmarks import freeze


def snapshot_campaign(campaign: Path, ledger: Path, labels: Path, destination: Path) -> dict:
    sources = [campaign.resolve(), labels.resolve()]
    target = destination.resolve()
    if target.exists() or any(target == source or target.is_relative_to(source) for source in sources):
        raise ValueError("Snapshot requires a new directory outside the campaign and label cache")
    if not ledger.is_file():
        raise ValueError("Campaign ledger is missing")
    target.mkdir(parents=True)
    for name, source in zip(("campaign", "section-labels"), sources, strict=True):
        if source.exists():
            shutil.copytree(source, target / name, ignore=shutil.ignore_patterns("*.db", "*.db-wal", "*.db-shm", "*.env", "*.tmp"))
    with sqlite3.connect(f"file:{ledger.resolve()}?mode=ro", uri=True) as source:
        with sqlite3.connect(target / "campaign.db") as backup:
            source.backup(backup)
    hashes = {str(path.relative_to(target)): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(target.rglob("*")) if path.is_file()}
    return freeze(target / "snapshot.json", {"version": 1, "files": hashes,
                                           "sourceCampaign": str(campaign.resolve()), "sourceLedger": str(ledger.resolve())})
