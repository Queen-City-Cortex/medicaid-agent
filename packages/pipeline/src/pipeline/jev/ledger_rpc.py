"""JSON-only local bridge: TS validation fetches use the Python SQLite ledger."""
import json
import sys
from pathlib import Path

from pipeline.jev.validation import reserve_transport, settle_transport


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if request["action"] == "reserve":
            result = reserve_transport(request["url"], request["body"],
                                       ledger_path=Path(request["ledger"]), pricing_path=Path(request["pricing"]))
        elif request["action"] == "settle":
            settle_transport(request["reservation"], request["usage"], Path(request["ledger"]))
            result = {"settled": True}
        else:
            raise ValueError("Unsupported ledger action")
        print(json.dumps({"result": result}))
    except Exception:
        # Neither body nor credentials nor exception details leave this process.
        print(json.dumps({"error": "validation_budget_refused"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
