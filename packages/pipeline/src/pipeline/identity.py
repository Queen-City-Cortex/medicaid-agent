"""Immutable identity for source documents.

Document metadata changes over time. The canonical source URL does not, so it
is the primary identity key for every source family. A normalized crawler
registry path is accepted only for legacy/local artifacts that have no URL.
"""

from __future__ import annotations

import hashlib
import posixpath
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit


def canonicalize_source_url(source_url: str) -> str:
    """Return the stable URL form used for source identity."""
    value = source_url.strip()
    if not value:
        raise ValueError("source URL cannot be empty")

    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError(f"source URL must be absolute: {source_url!r}")

    scheme = parsed.scheme.lower()
    hostname = parsed.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"

    port = parsed.port
    if port is not None and not (
        (scheme == "http" and port == 80)
        or (scheme == "https" and port == 443)
    ):
        hostname = f"{hostname}:{port}"

    query = "&".join(
        f"{quote(key, safe='-._~')}={quote(value, safe='-._~')}"
        for key, value in sorted(parse_qsl(parsed.query, keep_blank_values=True))
    )
    return urlunsplit((scheme, hostname, parsed.path or "/", query, ""))


def normalize_registry_path(registry_path: str) -> str:
    """Normalize a crawler path without tying identity to a workstation root."""
    value = registry_path.strip().replace("\\", "/")
    if not value:
        raise ValueError("registry path cannot be empty")
    normalized = posixpath.normpath(value)
    if normalized == ".." or normalized.startswith("../"):
        raise ValueError("registry path must stay within the crawler root")
    return normalized.removeprefix("./")


def immutable_source_key(
    source_url: str | None,
    registry_path: str | None = None,
) -> str:
    """Build the immutable key, preferring URL over the registry path."""
    if source_url and source_url.strip():
        return f"url:{canonicalize_source_url(source_url)}"
    if registry_path and registry_path.strip():
        return f"path:{normalize_registry_path(registry_path)}"
    raise ValueError("document identity requires a source URL or registry path")


def build_document_id(
    source_type: str,
    source_url: str | None,
    registry_path: str | None = None,
) -> str:
    """Build ``doc:<source-family>:<hash>`` from immutable source identity."""
    source_key = immutable_source_key(source_url, registry_path)
    digest = hashlib.sha256(source_key.encode("utf-8")).hexdigest()[:16]
    return f"doc:{source_type}:{digest}"
