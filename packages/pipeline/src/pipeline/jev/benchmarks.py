"""Frozen inputs, resumable diagnostics and blinded human review artifacts."""
import json
import os
import random
import subprocess
from pathlib import Path

from pipeline.config import GOLDEN_DATASET_PATH
from pipeline.jev.budget import BudgetExceeded, Ledger
from pipeline.jev.client import MODEL, JevError, canonical, digest, question_spec
from pipeline.jev.inference import INPUT_USD_PER_MILLION, budgeted_classify

REPO_ROOT = Path(__file__).resolve().parents[5]
FIXTURES = REPO_ROOT / "packages/pipeline/data/jev"
WORKER = REPO_ROOT / "packages/agent/src/jev/eval-worker.ts"
# The scope baseline is the agent's classifier default, CLASSIFIER_MODEL in
# packages/agent/src/model.ts; keep the two equal. gpt-5-mini leaves the OpenAI
# API on 2026-12-11. Moving it means a new scope campaign and confirmed rates:
# the 0.25/2 USD per million below belong to gpt-5-mini only.
SCOPE_BASELINE_MODEL = "gpt-5-mini"


def worker(payload: dict) -> dict:
    result = subprocess.run([str(REPO_ROOT / "node_modules/.bin/tsx"), str(WORKER)],
                            input=canonical(payload), text=True, capture_output=True,
                            cwd=REPO_ROOT, timeout=45, env={**os.environ, "MASTRA_OBSERVABILITY_PATH": ":memory:", "TRACE_STORE": "off"})
    if result.returncode:
        raise ValueError("Offline classifier worker failed; inspect local setup")
    # Logging stays outside the JSON record. Never persist classifier raw prose.
    return json.loads(result.stdout.strip().splitlines()[-1])


def freeze(path: Path, value: dict) -> dict:
    value["digest"] = digest({k: v for k, v in value.items() if k != "digest"})
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and json.loads(path.read_text()) != value:
        raise ValueError("Frozen artifact already exists with different inputs")
    path.write_text(canonical(value) + "\n")
    return value


def read_frozen(path: Path) -> dict:
    value = json.loads(path.read_text())
    if value.get("digest") != digest({k: v for k, v in value.items() if k != "digest"}):
        raise ValueError("Frozen artifact digest mismatch")
    return value


def prepare_routing(root: Path) -> dict:
    golden = json.loads(GOLDEN_DATASET_PATH.read_text())
    existing = json.loads((GOLDEN_DATASET_PATH.parent / "heldout-paraphrase.json").read_text())
    fresh = json.loads((FIXTURES / "fresh-paraphrases.json").read_text())
    # Paraphrases contribute text only: historical evidence IDs are not current graph identities.
    rows = [{k: row[k] for k in ("id", "question", "paraphrase_of") if k in row}
            for row in golden + existing + fresh]
    if len(rows) != 155 or len({r["id"] for r in rows}) != 155:
        raise ValueError("Routing benchmark must have 55 original and 100 paraphrase inputs")
    baselines = worker({"mode": "routing-batch", "questions": [r["question"] for r in rows]})["result"]
    for row, baseline in zip(rows, baselines, strict=True):
        row["baseline"] = baseline
    return freeze(root / "routing-inputs.json", {"version": 1, "kind": "routing", "rows": rows,
                                                "model": MODEL, "specHash": digest(question_spec()["routing"])})


def prepare_scope(root: Path) -> dict:
    rows = json.loads((FIXTURES / "scope-conversations.json").read_text())
    spec = worker({"mode": "scope-spec", "messages": []})["result"]
    return freeze(root / "scope-inputs.json", {"version": 1, "kind": "scope", "model": MODEL, "rows": rows,
                                            "specHash": digest(spec["questions"]), "baselineModel": os.environ.get("SCOPE_GATE_MODEL", SCOPE_BASELINE_MODEL),
                                            "baselineConfiguration": "production-sdk-defaults-v2", "baselineMaxOutputTokens": 128000, "deadlineMs": 500})


def prepare_sections(root: Path) -> dict:
    from pipeline.jev.sections import graph_sections, graph_section_index, section_input
    inventory = graph_section_index()
    families = sorted({r["documentType"] for r in inventory})
    split_rows = {"development": [], "heldout": []}
    grouped = {}
    for family in families:
        docs = sorted({r["documentId"] for r in inventory if r["documentType"] == family}, key=digest)
        grouped[family] = {split: [r for r in inventory if r["documentId"] in set(docs[offset::2]) and r["contentLength"] > 0]
                           for split, offset in (("development", 0), ("heldout", 1))}
        for rows in grouped[family].values():
            rows.sort(key=lambda r: digest(r["id"]))
    for split in split_rows:
        queues = [list(grouped[f][split]) for f in families]
        while len(split_rows[split]) < 120 and any(queues):
            for queue in queues:
                if queue and len(split_rows[split]) < 120:
                    row = queue.pop(0)
                    split_rows[split].append({"id": row["id"], "documentId": row["documentId"],
                                             "family": row["documentType"], "split": split})
        if len(split_rows[split]) != 120:
            raise ValueError("Insufficient distinct-document corpus for 120 sections per split")
    rows = split_rows["development"] + split_rows["heldout"]
    assert not ({r["documentId"] for r in split_rows["development"]} & {r["documentId"] for r in split_rows["heldout"]})
    selected = {r["id"]: r for r in graph_sections([r["id"] for r in rows])}
    for row in rows:
        row["input"] = section_input(selected[row["id"]])
    fixture = freeze(root / "sections-inputs.json", {"version": 1, "kind": "sections", "rows": rows,
                                                "inventoryHash": digest(inventory), "model": MODEL,
                                                "specHash": digest(question_spec()["roles"])})
    predictions = worker({"mode": "section-heuristics", "sections": rows})["result"]
    freeze(root / "sections-heuristics.json", {"inputDigest": fixture["digest"], "predictions": predictions})
    return fixture


def write_progress(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(canonical(data) + "\n")
    temporary.replace(path)


def run_routing(root: Path, ledger: Ledger) -> dict:
    fixture = read_frozen(root / "routing-inputs.json")
    path = root / "routing-results.json"
    result = json.loads(path.read_text()) if path.exists() else {"inputDigest": fixture["digest"], "rows": [], "status": "pending_inference"}
    if result["inputDigest"] != fixture["digest"] or fixture["specHash"] != digest(question_spec()["routing"]):
        raise ValueError("Routing result inputs/spec changed")
    done = {r["id"] for r in result["rows"]}
    for row in fixture["rows"]:
        if row["id"] in done:
            continue
        try:
            inference = budgeted_classify(row["question"], question_spec()["routing"], ledger)
            answers = inference["response"]["answers"]
            a = answers["questionType"]
            candidate = {"questionType": a["choice"] if a["probabilities"][a["choice"]] >= .9 else None,
                         "flags": {k: (v["noul"] >= .9 if v["noul"] >= .9 or v["noul"] <= .1 else None)
                                   for k, v in answers.items() if k != "questionType"}}
            result["rows"].append({"id": row["id"], "candidate": candidate, "inference": inference})
        except BudgetExceeded:
            result["status"] = "pending_budget"
            break
        except JevError as error:
            result["status"] = "pending_credentials" if error.code == "credentials" else "pending_inference"
            result["errorCode"] = error.code
            break
        write_progress(path, result)
    if len(result["rows"]) == 155:
        result["status"] = "pending_review"
    write_progress(path, result)
    return result


def run_scope(root: Path, ledger: Ledger) -> dict:
    fixture = read_frozen(root / "scope-inputs.json")
    path = root / "scope-results.json"
    result = json.loads(path.read_text()) if path.exists() else {"inputDigest": fixture["digest"], "rows": [], "status": "pending_inference"}
    if result["inputDigest"] != fixture["digest"]:
        raise ValueError("Scope result inputs changed")
    done = {(r["id"], r["provider"]) for r in result["rows"]}
    for row in fixture["rows"]:
        spec = worker({"mode": "scope-spec", "messages": row["messages"]})["result"]
        if fixture["specHash"] != digest(spec["questions"]) or fixture["baselineModel"] != os.environ.get("SCOPE_GATE_MODEL", SCOPE_BASELINE_MODEL):
            raise ValueError("Scope classifier configuration changed after inputs were frozen")
        for provider in ("openai", "jev"):
            if (row["id"], provider) in done:
                continue
            model = os.environ.get("SCOPE_GATE_MODEL", SCOPE_BASELINE_MODEL) if provider == "openai" else MODEL
            if not os.environ.get("OPENAI_API_KEY" if provider == "openai" else "TYPESAFE_API_KEY"):
                result["status"] = "pending_credentials"
                write_progress(path, result)
                continue
            # Only the pinned, known-price baseline may run. No unbounded calls.
            if provider == "openai" and (model != SCOPE_BASELINE_MODEL or os.environ.get("JEV_CONFIRMED_SCOPE_PRICING") != f"{SCOPE_BASELINE_MODEL}:0.25:2"):
                raise ValueError(f"Confirm current {SCOPE_BASELINE_MODEL} rates with JEV_CONFIRMED_SCOPE_PRICING={SCOPE_BASELINE_MODEL}:0.25:2")
            if provider == "jev" and os.environ.get("JEV_CONFIRMED_INPUT_USD_PER_MILLION") != "0.042":
                raise ValueError("Confirm Jev pricing before paid scope calls")
            reservation = None
            rate = INPUT_USD_PER_MILLION
            if provider == "openai":
                if fixture.get("baselineConfiguration") != "production-sdk-defaults-v2":
                    raise ValueError("Freeze a new scope campaign for the production baseline; preserve prior Jev results")
                pricing_path = root / "scope-pricing.json"
                freeze(pricing_path, {"confirmed": True, "models": {model: {
                    "provider": "openai", "inputPerMillion": .25, "outputPerMillion": 2, "maxOutputTokens": 128000}}})
                os.environ["JEV_VALIDATION_LEDGER"] = str(ledger.path.resolve())
                os.environ["JEV_VALIDATION_PRICING"] = str(pricing_path.resolve())
            else:
                # Runtime Jev has no retries; reserve its single request here.
                os.environ.pop("JEV_VALIDATION_LEDGER", None)
                os.environ.pop("JEV_VALIDATION_PRICING", None)
                bound = (len(canonical(spec).encode()) + 2048) * rate / 1_000_000
                try:
                    reservation = ledger.reserve(provider, model, digest(spec), bound)
                except BudgetExceeded:
                    result["status"] = "pending_budget"
                    write_progress(path, result)
                    return result
            try:
                response = worker({"mode": f"scope-{provider}", "messages": row["messages"]})
            except subprocess.TimeoutExpired:
                response = {"error": "classifier_failed_open", "latencyMs": 45000}
            if response.get("error") in {"credentials", "budget_or_pricing"}:
                result["status"] = "pending_credentials" if response["error"] == "credentials" else "pending_budget_or_pricing"
                result["failure"] = {"provider": provider, "id": row["id"], "code": response["error"]}
                write_progress(path, result)
                return result
            value = response.get("result")
            block = False
            if value:
                usage = value["usage"]
                cost = (usage["input_tokens"] * rate + usage["output_tokens"] * (2 if provider == "openai" else 0)) / 1_000_000
                if reservation is not None:
                    ledger.settle(reservation, cost, canonical(usage))
                block = (value["verdict"] == "off_topic") if provider == "openai" else (value["answers"]["scope"]["choice"] == "off_topic" and value["answers"]["scope"]["probabilities"]["off_topic"] >= .95)
            result["rows"].append({"id": row["id"], "provider": provider, "blocked": block,
                                   "fallback": not bool(value), "latencyMs": response["latencyMs"],
                                   "response": value, "reservationId": reservation})
            write_progress(path, result)
    if len(result["rows"]) == 400:
        result["status"] = "pending_review"
    write_progress(path, result)
    return result


def blind_review(root: Path, kind: str) -> dict:
    fixture = read_frozen(root / f"{kind}-inputs.json")
    rows = fixture["rows"]
    if kind == "routing":
        results = json.loads((root / "routing-results.json").read_text())
        inferred = {r["id"]: r["candidate"] for r in results["rows"]}
        disagreements, agreements = [], []
        for row in rows:
            c = inferred.get(row["id"])
            (disagreements if c is None or c["questionType"] != row["baseline"]["questionType"] or c["flags"] != row["baseline"]["flags"] else agreements).append(row)
        rows = disagreements + random.Random(20261002).sample(agreements, min(30, len(agreements)))
    fields = {"routing": ("question", "paraphrase_of"), "scope": ("messages",), "sections": ("input", "family", "split", "documentId")}[kind]
    review = {"inputDigest": fixture["digest"], "kind": kind, "reviewer": None,
              "rows": [{"id": r["id"], **{k: r[k] for k in fields if k in r}, "label": None} for r in rows]}
    # Editable labels are deliberately separate from frozen inference outputs.
    path = root / f"{kind}-review.json"
    if path.exists():
        raise ValueError("Review exists; preserve existing human labels")
    write_progress(path, review)
    return {"path": str(path), "count": len(rows), "status": "pending_review"}


def run_frames(root: Path, ledger_path: Path, pricing_path: Path, *, routing: bool = False) -> dict:
    """Measure final evidence, with canonical identities, behind paid-fetch metering."""
    from pipeline.jev.reports import PendingQualification, reviewed_role_configuration
    try:
        qualification = {} if routing else reviewed_role_configuration(root)
    except PendingQualification as error:
        return {"status": error.status}
    if not routing:
        from pipeline.jev.reports import require_qualification_corpus
        require_qualification_corpus(root)
    from pipeline.eval.identity import load_normalizer
    if not os.environ.get("EVAL_IDENTITY_CATALOG"):
        return {"status": "pending_identity_catalog"}
    normalizer = load_normalizer()
    golden = normalizer.graph_entries(json.loads(GOLDEN_DATASET_PATH.read_text()))
    references = {r["id"]: {e["section_id"] for e in r["evidence"]["primary_sections"]} for r in golden}
    os.environ["JEV_VALIDATION_LEDGER"] = str(ledger_path.resolve())
    os.environ["JEV_VALIDATION_PRICING"] = str(pricing_path.resolve())
    fixture = read_frozen(root / "routing-inputs.json") if routing else {"digest": digest(golden), "rows": [{"id": r["id"], "question": r["question"]} for r in golden]}
    inferred = {}
    if routing:
        inference = json.loads((root / "routing-results.json").read_text())
        if inference["inputDigest"] != fixture["digest"]:
            raise ValueError("Routing inference input mismatch")
        inferred = {r["id"]: r["candidate"]["questionType"] for r in inference["rows"]}
    from pipeline.evaluation_evidence import evaluation_fingerprint
    os.environ["JEV_SECTION_ROLE_ALLOWLIST"] = ",".join(sorted(qualification.get("qualifiedRoles", [])))
    fingerprints = []
    candidate_identity = None
    observations = []
    for arm in ("baseline", "candidate"):
        os.environ["JEV_SECTION_ROLES_ENABLED"] = "false" if routing or arm == "baseline" else "true"
        before = evaluation_fingerprint()
        common = dict(before)
        jev = common.pop("jev", {})
        common["scopeProvider"] = jev.get("scopeProvider", "openai")
        fingerprints.append(common)
        if arm == "candidate":
            candidate_identity = jev
        for start in range(0, len(fixture["rows"]), 5):
            rows = fixture["rows"][start:start + 5]
            frame_rows = [{"id": r["id"], "query": r["question"], **({"questionType": inferred[r["id"]]} if routing and arm == "candidate" and inferred.get(r["id"]) else {})} for r in rows]
            response = worker({"mode": "frames", "frameRows": frame_rows})
            if response.get("error"):
                return {"status": "pending_budget_or_infrastructure", "completed": len(observations)}
            for row in response["result"]:
                source_id = next(r.get("paraphrase_of", r["id"]) for r in rows if r["id"] == row["id"])
                selected = [s["id"] for s in row["frame"]["primarySections"]]
                observations.append({"id": row["id"], "arm": arm, "selected": selected,
                                     "correctPrimary": bool(selected and selected[0] in references[source_id]),
                                     "hasPrimary": bool(set(selected) & references[source_id]), "frame": row["frame"]})
        if before != evaluation_fingerprint():
            raise ValueError("Frame annotation/corpus/configuration changed during run")
    if fingerprints[0] != fingerprints[1]:
        raise ValueError("Frame baseline and candidate corpus/configuration mismatch")
    rates = {arm: sum(r["correctPrimary"] for r in observations if r["arm"] == arm) / len(fixture["rows"]) for arm in ("baseline", "candidate")}
    result = {"status": "frame_gates_passed" if rates["candidate"] > rates["baseline"] else "failed",
              "inputDigest": fixture["digest"], "identity": normalizer.evidence(), "rates": rates, "rows": observations,
              "candidateIdentity": candidate_identity, "commonFingerprint": fingerprints[0],
              "qualificationHash": qualification.get("qualificationHash")}
    freeze(root / ("routing-frames.json" if routing else "section-frames.json"), result)
    return {k: v for k, v in result.items() if k != "rows"}


def reuse_routing(root: Path, source: Path) -> dict:
    """Reuse exact pinned inference, recomputing candidates from validated probabilities."""
    from pipeline.jev.client import validate_response
    fixture = read_frozen(root / "routing-inputs.json")
    parent = read_frozen(source / "routing-inputs.json")
    prior = json.loads((source / "routing-results.json").read_text())
    if prior.get("inputDigest") != parent["digest"] or any(fixture[k] != parent[k] for k in ("model", "specHash")):
        raise ValueError("Routing reuse model/spec/input identity mismatch")
    target = {r["id"]: r for r in fixture["rows"]}
    original = {r["id"]: r for r in parent["rows"]}
    rows, ids = [], set()
    for row in prior["rows"]:
        identity = row["id"]
        if identity in ids or identity not in target or identity not in original:
            raise ValueError("Invalid reused routing identities")
        ids.add(identity)
        if any(target[identity].get(k) != original[identity].get(k) for k in ("question", "paraphrase_of")):
            raise ValueError("Routing reuse text changed")
        questions = question_spec()["routing"]
        inference = row["inference"]
        if inference.get("inputHash") != digest(target[identity]["question"]) or inference.get("specHash") != fixture["specHash"]:
            raise ValueError("Routing reuse inference provenance mismatch")
        answers = validate_response(inference["response"], questions)["answers"]
        a = answers["questionType"]
        candidate = {"questionType": a["choice"] if a["probabilities"][a["choice"]] >= .9 else None,
                     "flags": {k: (v["noul"] >= .9 if v["noul"] >= .9 or v["noul"] <= .1 else None)
                               for k, v in answers.items() if k != "questionType"}}
        rows.append({"id": identity, "candidate": candidate, "inference": inference})
    result = {"inputDigest": fixture["digest"], "rows": rows, "status": "pending_review"}
    path = root / "routing-results.json"
    if path.exists():
        raise ValueError("Routing reuse cannot overwrite existing results")
    freeze(root / "routing-reuse.json", {"sourceInputDigest": parent["digest"], "sourceResultHash": digest(prior),
                                         "inputDigest": fixture["digest"], "reusedRows": len(rows)})
    write_progress(path, result)
    return {"reusedRows": len(rows), "status": "pending_review"}
