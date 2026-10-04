#!/usr/bin/env python3
"""Read-only retained-artifact inventory and spreadsheet padding diagnostics."""

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


def trim_trailing_empty_cells(text):
    """Diagnostic only: preserve every occupied cell's row and column position."""
    rows = []
    removed = 0
    for line in text.splitlines():
        cells = line.split(" | ")
        while cells and cells[-1] == "":
            cells.pop()
            removed += 1
        rows.append(" | ".join(cells))
    return "\n".join(rows), removed


def occupied_cells(text):
    digest = hashlib.sha256()
    count = 0
    for row, line in enumerate(text.splitlines()):
        for col, value in enumerate(line.split(" | ")):
            if value:
                digest.update(
                    json.dumps([row, col, value], ensure_ascii=False).encode()
                )
                count += 1
    return count, digest.hexdigest()


def inventory(root):
    records = []
    source_groups = defaultdict(list)
    body_groups = defaultdict(list)
    for path in sorted(root.rglob("*.json")):
        if path.name.endswith(".meta.json"):
            continue
        meta_path = path.with_name(path.stem + ".meta.json")
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        record = {
            "artifact": str(path.relative_to(root)),
            "sourceFormat": meta.get("source_format"),
            "answerReady": meta.get("answer_ready", False),
            "parseStatus": meta.get("parse_status"),
            "artifactBytes": path.stat().st_size,
            "sourceSha256": meta.get("source_file_hash"),
            "artifactSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        if record["sourceFormat"] in {"xls", "xlsx"}:
            document = json.loads(path.read_text())
            bodies = [
                s.get("content_text", "")
                for s in document.get("synthetic_sections", [])
            ]
            record.update(
                sections=len(bodies),
                bodyCharacters=sum(map(len, bodies)),
                occupiedCharacters=sum(
                    len(b.translate(str.maketrans("", "", " \t\r\n|"))) for b in bodies
                ),
            )
            compact = [trim_trailing_empty_cells(b) for b in bodies]
            record["diagnosticCompactCharacters"] = sum(len(b) for b, _ in compact)
            record["removedTrailingEmptyCells"] = sum(n for _, n in compact)
            record["occupiedCellSignaturesPreserved"] = all(
                occupied_cells(a) == occupied_cells(b[0])
                for a, b in zip(bodies, compact, strict=True)
            )
            body_digest = hashlib.sha256()
            for body in bodies:
                body_digest.update(len(body).to_bytes(8, "big"))
                body_digest.update(body.encode())
            record["bodySha256"] = body_digest.hexdigest()
            if record["answerReady"]:
                body_groups[record["bodySha256"]].append(record["artifact"])
        if record["answerReady"] and record["sourceSha256"]:
            source_groups[record["sourceSha256"]].append(record["artifact"])
        records.append(record)
    return (
        records,
        [v for v in source_groups.values() if len(v) > 1],
        [v for v in body_groups.values() if len(v) > 1],
    )


def token_sample(root, records, source, limit):
    sys.path.insert(0, str(source))
    from pipeline.embeddings import planner, tokenizer
    from pipeline.embeddings.planner import plan_inputs
    from pipeline.embeddings.tokenizer import TOKENIZER_SHA256

    selected = sorted(
        (r for r in records if r.get("answerReady") and r.get("bodyCharacters")),
        key=lambda r: r["bodyCharacters"],
        reverse=True,
    )[:limit]
    samples = []
    for record in selected:
        path = root / record["artifact"]
        doc = json.loads(path.read_text())
        totals = Counter()
        for section in doc["synthetic_sections"]:
            body = section.get("content_text", "")
            heading = path.stem + " > " + (section.get("title") or "")
            compact, _ = trim_trailing_empty_cells(body)
            for label, text in (("raw", body), ("compact", compact)):
                inputs = list(plan_inputs(heading, text, "voyage-4"))
                totals[label + "Tokens"] += sum(p.tokens for p in inputs)
                totals[label + "Inputs"] += len(inputs)
        samples.append({**record, **dict(totals), "headingIsDiagnostic": True})
        print("Counted", record["artifact"], flush=True)
    return {
        "samples": samples,
        "tokenizerSha256": TOKENIZER_SHA256,
        "moduleHashes": {
            m.__name__: hashlib.sha256(Path(m.__file__).read_bytes()).hexdigest()
            for m in (planner, tokenizer)
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parsed-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pipeline-source", type=Path, required=True)
    parser.add_argument("--token-samples", type=int, default=6)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError("Preserve earlier audit receipts")
    records, duplicates, bodies = inventory(args.parsed_root)
    synthetic = [r for r in records if r.get("answerReady") and "bodyCharacters" in r]
    tokens = token_sample(
        args.parsed_root, records, args.pipeline_source, args.token_samples
    )
    result = {
        "scope": "All retained fee-schedule parsed artifacts; readiness annotated from sidecars, not graph membership",
        "sourceCorpusChanged": False,
        "providerCalls": 0,
        "compactionApplied": False,
        "artifactCount": len(records),
        "readyArtifacts": sum(r["answerReady"] for r in records),
        "readySpreadsheetBodyCharacters": sum(r["bodyCharacters"] for r in synthetic),
        "diagnosticCompactCharacters": sum(
            r["diagnosticCompactCharacters"] for r in synthetic
        ),
        "occupiedCellSignaturesPreserved": all(
            r["occupiedCellSignaturesPreserved"] for r in synthetic
        ),
        "identicalSourceGroups": duplicates,
        "identicalSpreadsheetBodyGroups": bodies,
        "records": records,
        **tokens,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(
        "Audit complete:",
        len(records),
        "artifacts; occupied cell signatures preserved:",
        result["occupiedCellSignaturesPreserved"],
    )


if __name__ == "__main__":
    main()
