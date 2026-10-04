"""Pinned local Voyage tokenization; runtime never downloads implicitly."""
import argparse
from functools import lru_cache
import hashlib
import os
from pathlib import Path
import tempfile
import urllib.request

PINS = {"voyage-4": "44f3b2ae4ddf33403ed4dd66bec3fa48ff7dbbf9",
        "voyage-4-large": "bb931c2635a93efe400c24741363d8ff61d7bb32"}
TOKENIZER_SHA256 = "c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539"
DOCUMENT_PROMPT = "Represent the document for retrieval: "
QUERY_PROMPT = "Represent the query for retrieving supporting documents: "
CONTEXT_TOKENS = 32000
BATCH_TOKENS = 60000


def asset_path(model):
    if model not in PINS:
        raise ValueError(f"No reviewed tokenizer pin for embedding model {model}")
    directory = Path(os.environ.get("EMBEDDING_TOKENIZER_DIR", str(Path.home() / ".cache/nc-medicaid-tokenizers")))
    return directory / f"{model}-{PINS[model]}.json"


def download(model):
    """Explicit provisioning; SHA checked before atomic replacement."""
    path = asset_path(model)
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == TOKENIZER_SHA256:
        return path
    url = f"https://huggingface.co/voyageai/{model}/resolve/{PINS[model]}/tokenizer.json"
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = response.read(16 * 1024 * 1024 + 1)
    if len(payload) > 16 * 1024 * 1024 or hashlib.sha256(payload).hexdigest() != TOKENIZER_SHA256:
        raise ValueError("Tokenizer asset differs from reviewed pin")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        output.write(payload)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


@lru_cache(maxsize=2)
def local_tokenizer(model):
    from tokenizers import Tokenizer
    path = asset_path(model)
    if not path.exists():
        raise RuntimeError("Provision tokenizer first: python -m pipeline.embeddings.tokenizer --model " + model)
    if hashlib.sha256(path.read_bytes()).hexdigest() != TOKENIZER_SHA256:
        raise ValueError("Local tokenizer asset failed SHA verification")
    tokenizer = Tokenizer.from_file(str(path))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    return tokenizer


def count_tokens(text, model, input_type="document"):
    if input_type not in {"document", "query", None}:
        raise ValueError("Unsupported embedding input type")
    prompt = DOCUMENT_PROMPT if input_type == "document" else QUERY_PROMPT if input_type == "query" else ""
    return len(local_tokenizer(model).encode(prompt + text, add_special_tokens=True).ids)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=sorted(PINS), default="voyage-4")
    args = parser.parse_args()
    print(download(args.model))
