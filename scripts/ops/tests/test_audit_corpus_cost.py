import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "cost_audit", Path(__file__).parents[1] / "audit-corpus-cost.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def test_remove_only_trailing_empty_cells_preserving_internal_blanks_and_literal_pipes():
    text = "code |  | rate |  | \n123 |  | $1.20 |  | \nA|B | value |  | "
    compact, count = audit.trim_trailing_empty_cells(text)
    assert compact == "code |  | rate\n123 |  | $1.20\nA|B | value"
    assert count == 6
    assert audit.occupied_cells(text) == audit.occupied_cells(compact)


def test_occupied_cell_signature_detects_column_shift_value_and_row_changes():
    original = "code |  | 0\n | $10 | value"
    for changed in [
        "code | 0\n | $10 | value",
        "code |  | 1\n | $10 | value",
        " | $10 | value\ncode |  | 0",
    ]:
        assert audit.occupied_cells(original) != audit.occupied_cells(changed)
