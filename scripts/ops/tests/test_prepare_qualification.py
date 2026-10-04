"""Guard tests run without loading inference or pipeline dependencies."""
import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import socket
import urllib.request
import json

spec = importlib.util.spec_from_file_location("preparation", Path(__file__).parents[1] / "prepare-qualification.py")
preparation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparation)


class PreparationGuardTests(unittest.TestCase):
    def setUp(self):
        self.env = {"NEO4J_URI": "bolt://qualification-preparation-neo4j:7687", "CORPUS_DATA_ROOT": "/data"}
        self.mounts = [["corpus", "/data", "ext4", "ro,relatime"]]

    def test_valid_isolated_target(self):
        preparation.validate_environment(self.env, self.mounts)

    def test_cycle_target_is_isolated(self):
        preparation.validate_environment({**self.env, "NEO4J_URI": "bolt://qualification-cycle-neo4j:7687"}, self.mounts)

    def test_unknown_socket_target_is_rejected(self):
        with self.assertRaises(ValueError):
            preparation.deny_network("neo4j.railway.internal")

    def test_other_graph_is_rejected_before_loading(self):
        for uri in ["bolt://localhost:7687", "bolt://neo4j.railway.internal:7687", "neo4j://qualification-preparation-neo4j:7687", "bolt://qualification-preparation-neo4j:7688"]:
            with self.subTest(uri=uri), self.assertRaises(ValueError):
                preparation.validate_environment({**self.env, "NEO4J_URI": uri}, self.mounts)

    def test_writable_or_missing_corpus_is_rejected(self):
        for mounts in [[], [["corpus", "/data", "ext4", "rw"]],
                       self.mounts + [["other", "/data/pipeline", "ext4", "rw"]],
                       self.mounts + [["other", "/data", "ext4", "rw"]]]:
            with self.subTest(mounts=mounts), self.assertRaises(ValueError):
                preparation.validate_environment(self.env, mounts)

    def test_provider_credentials_are_rejected(self):
        for key in ["OPENAI_API_KEY", "VOYAGE_API_KEY", "ANTHROPIC_API_KEY", "TYPE_SAFE_API_KEY", "RAILWAY_TOKEN", "openai_api_key", "OPENAI_KEY", "AWS_ACCESS_KEY_ID", "DATABASE_URL"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                preparation.validate_environment({**self.env, key: "test-value"}, self.mounts)

    def test_system_database_is_rejected(self):
        with self.assertRaises(ValueError):
            preparation.validate_environment({**self.env, "NEO4J_DATABASE": "system"}, self.mounts)

    def test_socket_and_http_guards(self):
        with patch.object(socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 7687))]), \
             patch.object(socket.socket, "connect") as allowed_connect, \
             patch.object(socket.socket, "connect_ex"), patch.object(urllib.request, "urlopen"):
            preparation.deny_network(preparation.TARGET)
            with socket.socket() as sock:
                with self.assertRaises(RuntimeError):
                    sock.connect(("203.0.113.1", 443))
                with self.assertRaises(RuntimeError):
                    sock.connect_ex(("127.0.0.1", 7474))
                sock.connect(("127.0.0.1", 7687))
                allowed_connect.assert_called_once()
            with self.assertRaises(RuntimeError):
                urllib.request.urlopen("https://api.openai.com/v1/responses")

    def test_audit_receipts_preserve_original_build_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            original=json.dumps({"preparationContext":{"runId":"original"},"buildExecuted":True})
            (root/"completion.json").write_text(original)
            (root/"corpus-audit.md").write_text("Original build audit")
            output=preparation.output_directory(root, True)
            with patch.object(preparation,"OUTPUT_ROOT",output):
                preparation.write_receipt("audit-completion.json",{"buildExecuted":False})
            self.assertEqual((root/"completion.json").read_text(),original)
            self.assertEqual((root/"corpus-audit.md").read_text(),"Original build audit")
            self.assertFalse(json.loads((output/"audit-completion.json").read_text())["buildExecuted"])
            with patch.object(preparation,"OUTPUT_ROOT",root), self.assertRaises(FileExistsError):
                preparation.write_receipt("completion.json",{"buildExecuted":False})
            self.assertEqual((root/"completion.json").read_text(),original)

    def test_hot_registry_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "crawler.db"
            self.assertIn("mode=ro&immutable=1", preparation.immutable_registry_uri(path))
            for suffix in ("-wal", "-journal"):
                pending = Path(str(path) + suffix)
                pending.write_bytes(b"pending transaction")
                with self.assertRaises(ValueError):
                    preparation.immutable_registry_uri(path)
                pending.unlink()


if __name__ == "__main__":
    unittest.main()
