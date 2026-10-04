"""One resumable campaign ledger. Reserve before every attempt, including retries.

Amounts are integer nanodollars, rounded up. Interrupted/unknown attempts remain
fully charged. A caller cannot lower the bound or increase an existing cap.
"""
import math
import sqlite3
import uuid
from pathlib import Path

MAX_USD = 25
UNIT = 1_000_000_000


class BudgetExceeded(ValueError):
    pass


class Ledger:
    def __init__(self, path: Path, cap_usd: float = MAX_USD):
        if not math.isfinite(cap_usd) or not 0 < cap_usd <= MAX_USD:
            raise ValueError("Campaign cap must be positive and at most $25")
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=30, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS campaign (id INTEGER PRIMARY KEY CHECK(id=1), cap INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
            input_hash TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER NOT NULL,
            state TEXT NOT NULL, usage TEXT);
        """)
        cap = math.ceil(cap_usd * UNIT)
        self.db.execute("INSERT OR IGNORE INTO campaign VALUES (1, ?)", (cap,))
        if self.db.execute("SELECT cap FROM campaign").fetchone()[0] != cap:
            self.db.close()
            raise ValueError("Existing campaign cap is immutable; reuse its original cap")

    def reserve(self, provider: str, model: str, input_hash: str, bound_usd: float) -> str:
        if not math.isfinite(bound_usd) or bound_usd <= 0:
            raise ValueError("Paid calls require known pricing and a finite positive bound")
        amount = math.ceil(bound_usd * UNIT)
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.db.execute("SELECT 1 FROM calls WHERE state='bound_exceeded'").fetchone():
                raise BudgetExceeded("Campaign stopped after underestimated provider usage")
            cap = self.db.execute("SELECT cap FROM campaign").fetchone()[0]
            used = self.db.execute("SELECT COALESCE(SUM(charged),0) FROM calls").fetchone()[0]
            if used + amount > cap:
                raise BudgetExceeded("pending_budget")
            call_id = uuid.uuid4().hex
            self.db.execute("INSERT INTO calls VALUES (?,?,?,?,?,?,?,NULL)",
                            (call_id, provider, model, input_hash, amount, amount, "reserved"))
            self.db.execute("COMMIT")
            return call_id
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def settle(self, call_id: str, actual_usd: float, usage: str) -> None:
        if not math.isfinite(actual_usd) or actual_usd < 0:
            raise ValueError("Invalid actual cost")
        charged = math.ceil(actual_usd * UNIT)
        self.db.execute("BEGIN IMMEDIATE")
        try:
            row = self.db.execute("SELECT reserved,state FROM calls WHERE id=?", (call_id,)).fetchone()
            if not row or row[1] != "reserved":
                raise ValueError("Reservation is missing or already settled")
            if charged > row[0]:
                # Persist overspend and fail; never hide an underestimated reservation.
                self.db.execute("UPDATE calls SET charged=?,state='bound_exceeded',usage=? WHERE id=?", (charged, usage, call_id))
                self.db.execute("COMMIT")
                raise ValueError("Provider usage exceeded pre-call bound; stop campaign")
            self.db.execute("UPDATE calls SET charged=?,state='settled',usage=? WHERE id=?", (charged, usage, call_id))
            self.db.execute("COMMIT")
        except Exception:
            if self.db.in_transaction:
                self.db.execute("ROLLBACK")
            raise

    def summary(self) -> dict:
        cap = self.db.execute("SELECT cap FROM campaign").fetchone()[0]
        total, pending = self.db.execute("SELECT COALESCE(SUM(charged),0),SUM(state!='settled') FROM calls").fetchone()
        return {"capUsd": cap / UNIT, "chargedUsd": total / UNIT, "unsettledCalls": pending or 0}

    def close(self) -> None:
        self.db.close()
