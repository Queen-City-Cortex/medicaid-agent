"""Qualification only from complete, reviewed, identity-matched evidence."""
import json
import math
import statistics
from pathlib import Path

from pipeline.jev.benchmarks import read_frozen
from pipeline.jev.client import digest, question_spec


def reviewed(root: Path, kind: str) -> tuple[dict, dict]:
    fixture = read_frozen(root / f"{kind}-inputs.json")
    path = root / f"{kind}-review.json"
    if not path.exists():
        return fixture, {}
    value = json.loads(path.read_text())
    if value.get("evidenceSource") not in {None, "human"}:
        raise ValueError("AI diagnostic labels are not independent human review")
    if value.get("inputDigest") != fixture["digest"] or value.get("kind") != kind:
        raise ValueError("Review input identity mismatch")
    if not isinstance(value.get("reviewer"), str) or not value["reviewer"].strip():
        return fixture, {}
    rows = value["rows"]
    if len({r["id"] for r in rows}) != len(rows) or any(r["id"] not in {x["id"] for x in fixture["rows"]} for r in rows):
        raise ValueError("Invalid review row identities")
    labels = {}
    spec = question_spec()
    for row in rows:
        label = row.get("label")
        if label is None:
            continue
        if kind == "scope":
            if label not in {"on_topic", "ambiguous", "off_topic"}:
                raise ValueError("Invalid scope reference label")
        else:
            fields = set(spec["roles"] if kind == "sections" else spec["routing"]) - {"questionType"}
            if not isinstance(label, dict):
                raise ValueError("Invalid review label")
            flags = label.get("flags", {}) if kind == "routing" else label
            if not isinstance(flags, dict) or not set(flags) <= fields or any(type(v) is not bool for v in flags.values()):
                raise ValueError("Invalid review flags or roles")
            if kind == "routing":
                if not set(label) <= {"questionType", "flags"} or ("questionType" in label and label["questionType"] not in spec["routing"]["questionType"]["criteria"]):
                    raise ValueError("Invalid routing question type")
                if "questionType" not in label:
                    continue
            if set(flags) != fields:
                continue  # Saved drafts are pending, never malformed complete evidence.
        labels[row["id"]] = label
    return fixture, labels


def report_scope(root: Path) -> dict:
    fixture, labels = reviewed(root, "scope")
    path = root / "scope-results.json"
    if not path.exists():
        return {"status": "pending_inference"}
    result = json.loads(path.read_text())
    if result.get("inputDigest") != fixture["digest"]:
        raise ValueError("Scope evidence input identity mismatch")
    if len(labels) != 200:
        failures = {provider: sum(bool(r.get("fallback")) for r in result["rows"] if r["provider"] == provider)
                    for provider in ("openai", "jev")}
        return {"status": "pending_review", "reviewed": len(labels), "fallbacks": failures,
                "operationalGate": "failed" if any(failures.values()) else "pending_complete_evidence"}
    if any(v not in {"on_topic", "ambiguous", "off_topic"} for v in labels.values()):
        raise ValueError("Invalid scope reference label")
    indexed = {(r["id"], r["provider"]): r for r in result["rows"]}
    if len(indexed) != 400 or len(result["rows"]) != 400 or set(indexed) != {(r["id"], p) for r in fixture["rows"] for p in ("openai", "jev")}:
        return {"status": result.get("status", "pending_inference"), "completed": len(indexed)}
    if any(sum(v == label for v in labels.values()) < 10 for label in ("on_topic", "ambiguous", "off_topic")):
        raise ValueError("Scope reference requires at least ten examples of every class")
    metrics = {}
    for provider in ("openai", "jev"):
        rows = [indexed[(r["id"], provider)] for r in fixture["rows"]]
        if any(type(r["blocked"]) is not bool or type(r["fallback"]) is not bool or not isinstance(r["latencyMs"], (int, float)) or not math.isfinite(r["latencyMs"]) or r["latencyMs"] < 0 for r in rows):
            raise ValueError("Invalid scope telemetry")
        allowed = [r for r in rows if labels[r["id"]] != "off_topic"]
        off = [r for r in rows if labels[r["id"]] == "off_topic"]
        times = sorted(r["latencyMs"] for r in rows)
        metrics[provider] = {"falseBlocks": sum(r["blocked"] for r in allowed),
                             "offTopicDetection": sum(r["blocked"] for r in off) / len(off) if off else 0,
                             "medianLatencyMs": statistics.median(times), "p95LatencyMs": times[math.ceil(.95 * len(times)) - 1],
                             "fallbacks": sum(r["fallback"] for r in rows)}
    if fixture.get("baselineConfiguration") != "production-sdk-defaults-v2":
        return {"status": "pending_production_baseline", "metrics": metrics}
    a, b = metrics["openai"], metrics["jev"]
    passed = a["fallbacks"] == 0 and b["fallbacks"] == 0 and b["falseBlocks"] == 0 and b["offTopicDetection"] >= a["offTopicDetection"] and b["medianLatencyMs"] < a["medianLatencyMs"]
    return {"status": "qualified" if passed else "failed", "metrics": metrics,
            "reviewHash": digest(labels), "inputDigest": fixture["digest"]}


def report_routing(root: Path) -> dict:
    fixture, labels = reviewed(root, "routing")
    path = root / "routing-results.json"
    if not path.exists():
        return {"status": "pending_inference"}
    result = json.loads(path.read_text())
    if result.get("inputDigest") != fixture["digest"]:
        raise ValueError("Routing evidence input identity mismatch")
    inferred = {r["id"]: r["candidate"] for r in result["rows"]}
    if len(inferred) != 155 or len(result["rows"]) != 155:
        return {"status": result.get("status", "pending_inference"), "completed": len(inferred)}
    disagree, agreements = [], []
    for row in fixture["rows"]:
        c = inferred[row["id"]]
        (disagree if c["questionType"] != row["baseline"]["questionType"] or c["flags"] != row["baseline"]["flags"] else agreements).append(row["id"])
    import random
    required = set(disagree)
    sampled = random.Random(20261002).sample(agreements, min(30, len(agreements)))
    required.update(sampled)
    if not required <= set(labels):
        return {"status": "pending_review", "disagreements": len(disagree), "reviewed": len(labels), "required": len(required)}
    flag_names = set(question_spec()["routing"]) - {"questionType"}
    choices = set(question_spec()["routing"]["questionType"]["criteria"])
    for label in labels.values():
        if not isinstance(label, dict) or label.get("questionType") not in choices or set(label.get("flags", {})) != flag_names or any(type(v) is not bool for v in label["flags"].values()):
            raise ValueError("Routing labels need a valid questionType and every boolean semantic flag")
    baseline = {r["id"]: r["baseline"] for r in fixture["rows"]}
    metrics = {}
    for name, arm in (("baseline", baseline), ("jev", inferred)):
        metrics[name] = {"reviewedTypeAccuracy": sum(arm[i]["questionType"] == labels[i]["questionType"] for i in required) / len(required),
                         "reviewedFlagAccuracy": sum(arm[i]["flags"][f] == labels[i]["flags"][f] for i in required for f in flag_names) / (len(required) * len(flag_names)),
                         "paraphraseTypeConsistency": sum(arm[r["id"]]["questionType"] == arm[r["paraphrase_of"]]["questionType"] for r in fixture["rows"] if "paraphrase_of" in r) / 100}
    return {"status": "diagnostic_complete", "runtimeAdoption": "disabled", "metrics": metrics,
            "abstentions": sum(v["questionType"] is None for v in inferred.values()),
            "frameEvidenceConsequence": read_frozen(root / "routing-frames.json").get("rates") if (root / "routing-frames.json").exists() else "pending_frame_evidence", "reviewHash": digest(labels)}


def report_sections(root: Path, labels_root: Path) -> dict:
    from pipeline.jev.sections import cache_key, validate_cache, validate_label_manifest
    fixture, labels = reviewed(root, "sections")
    if len(labels) != 240:
        return {"status": "pending_review", "reviewed": len(labels)}
    roles = question_spec()["roles"]
    for label in labels.values():
        if not isinstance(label, dict) or set(label) != set(roles) or any(type(v) is not bool for v in label.values()):
            raise ValueError("Section labels require all independent role booleans")
    inference_path = root / "sections-results.json"
    if not inference_path.exists():
        return {"status": "pending_inference"}
    inference = json.loads(inference_path.read_text())
    if inference.get("inputDigest") != fixture["digest"]:
        raise ValueError("Section inference input identity mismatch")
    manifest = json.loads((labels_root / "manifests" / f"{inference['manifestDigest']}.json").read_text())
    validate_label_manifest(manifest, labels_root)
    entries = {r["id"]: r for r in manifest["sections"]}
    if set(entries) != {r["id"] for r in fixture["rows"]} or any(entries[r["id"]]["inputHash"] != digest(r["input"]) for r in fixture["rows"]):
        raise ValueError("Section inference inventory/input identity mismatch")
    qualified, metrics = [], {}
    for role in roles:
        pos, neg, tp, fp = 0, 0, 0, 0
        for row in fixture["rows"]:
            if row["split"] != "heldout":
                continue
            key = cache_key(row["input"], roles)
            path = labels_root / "cache" / f"{key}.json"
            entry = entries[row["id"]]
            if entry["status"] == "labeled":
                cached = validate_cache(json.loads(path.read_text()))
                predicted = cached["probabilities"][role] >= .9
            elif entry["status"] in {"input", "empty"}:
                predicted = False  # Unsupported inputs abstain; runtime keeps heuristics.
            else:
                return {"status": "pending_inference"}
            truth = labels[row["id"]][role]
            pos += truth
            neg += not truth
            tp += truth and predicted
            fp += not truth and predicted
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / pos if pos else 0
        # Existing heuristic recall must be supplied as frozen, reviewed evidence.
        baseline_path = root / "sections-heuristics.json"
        if not baseline_path.exists():
            return {"status": "pending_heuristic_baseline"}
        baseline = read_frozen(baseline_path)
        if baseline.get("inputDigest") != fixture["digest"]:
            raise ValueError("Section heuristic baseline input mismatch")
        predictions = baseline["predictions"]
        baseline_tp = sum(labels[r["id"]][role] and predictions[r["id"]].get(role, False) for r in fixture["rows"] if r["split"] == "heldout")
        base_recall = baseline_tp / pos if pos else 0
        passed = pos >= 10 and neg >= 10 and tp + fp >= 10 and precision >= .9 and recall >= base_recall
        metrics[role] = {"positive": pos, "negative": neg, "precision": precision, "recall": recall,
                         "baselineRecall": base_recall, "status": "qualified" if passed else "observational"}
        if passed:
            qualified.append(role)
    frames_path, answers_path = root / "section-frames.json", root / "answer-comparison.json"
    frames = read_frozen(frames_path) if frames_path.exists() else {}
    answers = read_frozen(answers_path) if answers_path.exists() else {}
    qualification_hash = digest({"inputDigest": fixture["digest"], "reviewHash": digest(labels), "qualifiedRoles": qualified, "metrics": metrics, "inventoryHash": fixture["inventoryHash"]})
    if frames:
        if frames.get("qualificationHash") != qualification_hash or frames.get("candidateIdentity", {}).get("allowedRoles") != sorted(qualified):
            raise ValueError("Frame evidence role qualification identity mismatch")
    if answers:
        rerun = compare_answers([json.loads((root / f"baseline-{i}.json").read_text()) for i in range(1, 4)],
                                [json.loads((root / f"candidate-{i}.json").read_text()) for i in range(1, 4)])
        if {k: v for k, v in answers.items() if k != "digest"} != rerun:
            raise ValueError("Answer comparison does not match durable full-run evidence")
        if answers.get("qualificationHash") != qualification_hash or answers.get("candidateIdentity") != frames.get("candidateIdentity") or answers.get("commonFingerprint") != frames.get("commonFingerprint"):
            raise ValueError("Frame and answer annotation/configuration identity mismatch")
    status = "failed" if not qualified else "pending_frame_evidence"
    if qualified and frames.get("status") == "frame_gates_passed":
        status = "qualified" if answers.get("status") == "answer_gates_passed" else "pending_repeated_answers"
    return {"status": status, "qualifiedRoles": qualified,
            "metrics": metrics, "inputDigest": fixture["digest"], "reviewHash": digest(labels), "qualificationHash": qualification_hash,
            "frameGate": frames.get("status", "pending_frame_evidence"),
            "answerReleaseGate": answers.get("status", "pending_repeated_answers")}


def compare_answers(baseline: list[dict], candidate: list[dict]) -> dict:
    from pipeline.evaluation_evidence import require_complete_results, verification_summary
    from pipeline.release import build_release_evaluation_results, load_release_policy
    if len(baseline) < 3 or len(candidate) < 3:
        return {"status": "pending_repeated_answers"}
    policy = load_release_policy()["evaluation"]
    fingerprints = []
    seen_runs = set()
    candidate_identity = None
    mapping_hash = None
    qualification_hash = None
    metrics = {"baseline": [], "candidate": []}
    for arm, runs in (("baseline", baseline), ("candidate", candidate)):
        for run in runs:
            identity = (run["retrieval"].get("run_id"), run["answer"].get("run_id"))
            if None in identity or identity in seen_runs:
                raise ValueError("Repeated answer gates require distinct complete run identities")
            seen_runs.add(identity)
            if not run.get("qualificationHash") or (qualification_hash and run["qualificationHash"] != qualification_hash):
                raise ValueError("Answer evidence role qualification identity mismatch")
            qualification_hash = run["qualificationHash"]
            require_complete_results(run["retrieval"], run["answer"])
            fingerprint = dict(run["fingerprint"])
            jev = fingerprint.pop("jev", {})
            if bool(jev.get("sectionRolesEnabled")) != (arm == "candidate"):
                raise ValueError("Answer comparison arm feature identity mismatch")
            if arm == "candidate" and not jev.get("annotationDigest"):
                raise ValueError("Candidate answer evidence must bind annotation digest")
            if arm == "candidate":
                if candidate_identity is not None and jev != candidate_identity:
                    raise ValueError("Candidate annotation/configuration changed across runs")
                candidate_identity = jev
            live_mapping = run["answer"]["config"]["evidence_normalization"]["mappingHash"]
            if mapping_hash is not None and mapping_hash != live_mapping:
                raise ValueError("Live evidence identities changed across answer runs")
            mapping_hash = live_mapping
            fingerprint["scopeProvider"] = jev.get("scopeProvider", "openai")
            fingerprints.append(fingerprint)
            metrics[arm].append({**build_release_evaluation_results(run["retrieval"], run["answer"], None),
                                 **verification_summary(run["answer"])})
    if any(f != fingerprints[0] for f in fingerprints):
        raise ValueError("Answer corpus, implementation or configuration mismatch")
    means = {arm: {key: statistics.mean(r[key] for r in rows) for key in rows[0] if isinstance(rows[0][key], (int, float))}
             for arm, rows in metrics.items()}
    b, c = means["baseline"], means["candidate"]
    failures = [key for key in ("retrievalRecall", "primaryDocumentHitRate", "answerScore", "hallucinationScore")
                if any(r.get(key, 0) < policy[key] for r in metrics["candidate"])]
    if any(b[k] - c[k] > policy["maxAggregateRegression"] for k in ("retrievalPrecision", "retrievalRecall", "primaryDocumentHitRate", "answerScore", "hallucinationScore")):
        failures.append("aggregateRegression")
    if c["hallucinationScore"] < b["hallucinationScore"]:
        failures.append("groundingDecline")
    if c["withholdingRate"] > b["withholdingRate"]:
        failures.append("withholdingIncrease")
    return {"status": "failed" if failures else "answer_gates_passed", "failures": failures, "means": means,
            "candidateIdentity": candidate_identity, "commonFingerprint": fingerprints[0],
            "qualificationHash": qualification_hash, "evidenceHash": digest({"baseline": baseline, "candidate": candidate})}


class PendingQualification(ValueError):
    def __init__(self, status: str):
        super().__init__(status)
        self.status = status


def reviewed_role_configuration(root: Path) -> dict:
    """Derive runtime candidates from reviewed held-out evidence, never env guesses."""
    from pipeline.jev.sections import LABEL_ROOT
    result = report_sections(root, LABEL_ROOT)
    if not result.get("qualifiedRoles"):
        raise PendingQualification(result["status"] if result["status"] != "failed" else "failed_role_qualification")
    return result


def require_qualification_corpus(root: Path) -> None:
    """Refuse spend when sampled inputs or their corpus inventory have changed."""
    from pipeline.jev.sections import graph_section_index, graph_sections, section_input
    fixture = read_frozen(root / "sections-inputs.json")
    if digest(graph_section_index()) != fixture["inventoryHash"]:
        raise ValueError("Qualification corpus inventory changed")
    live = {row["id"]: section_input(row) for row in graph_sections([r["id"] for r in fixture["rows"]])}
    if set(live) != {r["id"] for r in fixture["rows"]} or any(digest(live[r["id"]]) != digest(r["input"]) for r in fixture["rows"]):
        raise ValueError("Qualification sampled section inputs changed")
    preflight_path = root / "corpus-preflight.json"
    if preflight_path.exists():
        from pipeline.evaluation_evidence import validation_corpus_hash
        if validation_corpus_hash() != read_frozen(preflight_path)["inventoryHash"]:
            raise ValueError("Qualification full corpus inputs changed")
