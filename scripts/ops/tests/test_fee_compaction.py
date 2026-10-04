"""Offline diagnostic guard contracts; no corpus or graph needed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("inspector", ROOT / "inspect-fee-compaction.py")
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class Guards(unittest.TestCase):
    def setUp(self):
        self.env = {"NEO4J_URI": "bolt://fee-compaction-baseline:7687", "CORPUS_DATA_ROOT": "/data", "EMBEDDING_TOKENIZER_DIR": "/tokenizers"}
        self.mounts = [["bind", root, "ext4", "ro"] for root in ("/data", "/archive", "/tokenizers", "/inventory.json", "/staging-summary.json", "/native-proofs.json")]

    def test_exact_target_and_readonly_inputs(self):
        self.assertEqual(inspector.guard(self.env, self.mounts, "baseline"), "fee-compaction-baseline")
        for uri in ("bolt://localhost:7687", "bolt://fee-compaction-candidate:7687", "neo4j://fee-compaction-baseline:7687"):
            with self.assertRaises(ValueError):
                inspector.guard({**self.env, "NEO4J_URI": uri}, self.mounts, "baseline")

    def test_provider_keys_unknown_environment_and_nested_rw_rejected(self):
        for values in ({"VOYAGE_API_KEY": "dummy"}, {"UNKNOWN": "1"}, {"NEO4J_DATABASE": "production"}):
            with self.assertRaises(ValueError):
                inspector.guard({**self.env, **values}, self.mounts, "baseline")
        with self.assertRaises(ValueError):
            inspector.guard(self.env, self.mounts + [["bind", "/data/crawler", "ext4", "rw"]], "baseline")

    def test_staging_refuses_existing_or_nested_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for output in (root, root / "candidate"):
                with self.assertRaises(ValueError):
                    inspector.compaction.stage(root, output)


if __name__ == "__main__":
    unittest.main()
