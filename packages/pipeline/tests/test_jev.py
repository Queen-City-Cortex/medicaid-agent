"""Offline contracts, accounting, annotation and review gates."""
import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import httpx
import pytest

from pipeline.jev.budget import BudgetExceeded, Ledger
from pipeline.jev.client import MODEL, JevError, canonical, classify, digest, question_spec, validate_response
from pipeline.jev.sections import cache_key, label_sections, section_input, validate_cache, validate_label_manifest
from pipeline.jev.validation import reserve_transport, settle_transport


def response(questions):
    answers = {}
    for key, q in questions.items():
        if q["type"] == "noul":
            answers[key] = {"type": "noul", "noul": .95}
        else:
            options = list(q["criteria"])
            answers[key] = {"type": "choice", "choice": options[0], "probabilities": {o: .88 if i == 0 else .12 if i == 1 else 0 for i, o in enumerate(options)}, "confidence": .81}
    return {"model": MODEL, "answers": answers, "usage": {"input_tokens": 318, "output_tokens": 34}}


def section(content="Covered services."):
    return {"id": "s", "documentId": "d", "documentTitle": "Policy", "documentType": "clinical_policy", "title": "Criteria", "sectionNumber": "3", "policyNumber": "10A", "content": content}


def test_documented_confidence_and_invalid_responses():
    questions = {"department": {"type": "choice", "criteria": {"billing": "", "technical": "", "sales": ""}}}
    assert validate_response(response(questions), questions)["answers"]["department"]["confidence"] == .81
    for change in [lambda v: v.update(model="jev-latest"), lambda v: v.update(answers={}), lambda v: v["answers"]["department"]["probabilities"].update(billing=float("nan"))]:
        bad = response(questions)
        change(bad)
        with pytest.raises(JevError):
            validate_response(bad, questions)


def test_http_error_redacted_without_retry():
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(429, text="private details")
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(JevError, match="jev_http") as error:
            classify("Public section", question_spec()["roles"], api_key="test", client=client)
    assert error.value.status == 429 and len(calls) == 1
    assert "private" not in str(error.value)


def test_cross_language_unicode_hash():
    state = {"title": 'Café\n"\\\t', "sectionNumber": None, "documentTitle": "移民", "documentType": "clinical_policy", "policyNumber": None, "content": "á\r\n☃"}
    assert digest(state) == "56f300a7e2b1315b994a8717e223c0bd0bc8b3d9c3325a1087f115479e35b62c"
    assert digest(question_spec()["roles"]) == "b88c5ad499e5267b038c558c16093f6195becbf6cfaae39839dd02a2993a92e2"


def test_budget_resumes_and_cap_is_immutable(tmp_path):
    path = tmp_path / "campaign.db"
    ledger = Ledger(path)
    reservation = ledger.reserve("typesafe", MODEL, "hash", 24)
    with pytest.raises(BudgetExceeded):
        ledger.reserve("openai", "gpt-5-mini", "hash", 2)
    ledger.settle(reservation, 1, '{}')
    assert ledger.summary()["chargedUsd"] == 1
    ledger.reserve("openai", "gpt-5-mini", "hash", 24)
    ledger.close()
    reopened = Ledger(path)
    with pytest.raises(BudgetExceeded):
        reopened.reserve("anthropic", "claude", "hash", .001)
    reopened.close()
    with pytest.raises(ValueError, match="immutable"):
        Ledger(path, 20)
    with pytest.raises(ValueError):
        Ledger(tmp_path / "other.db", 26)


def test_concurrent_budget_never_exceeds_cap(tmp_path):
    path = tmp_path / "campaign.db"
    Ledger(path).close()
    def reserve(_):
        ledger = Ledger(path)
        try:
            ledger.reserve("typesafe", MODEL, "hash", 5)
            return True
        except BudgetExceeded:
            return False
        finally:
            ledger.close()
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(reserve, range(12))) == 5
    ledger = Ledger(path)
    assert ledger.summary()["chargedUsd"] == 25
    ledger.close()


def test_bound_error_blocks_resumption(tmp_path):
    ledger = Ledger(tmp_path / "campaign.db")
    call = ledger.reserve("typesafe", MODEL, "hash", 1)
    with pytest.raises(ValueError, match="exceeded"):
        ledger.settle(call, 2, '{}')
    assert ledger.summary()["chargedUsd"] == 2
    with pytest.raises(BudgetExceeded):
        ledger.reserve("typesafe", MODEL, "hash", .1)
    ledger.close()


def test_cache_reuse_invalidation_and_tamper(tmp_path, monkeypatch):
    from pipeline.jev import sections
    calls = []
    def inference(state, spec, ledger):
        calls.append(state)
        return {"response": response(spec), "latencyMs": 20, "reservationId": "reserved"}
    monkeypatch.setattr(sections, "budgeted_classify", inference)
    first = label_sections([section()], root=tmp_path, cache_only=False, ledger=object())
    cached = label_sections([section()], root=tmp_path)
    assert cached["manifest"] == first["manifest"] and len(calls) == 1
    changed = label_sections([section("Changed")], root=tmp_path)
    assert changed["manifest"]["sections"][0]["status"] == "pending_cache"
    assert changed["manifest"]["digest"] != first["manifest"]["digest"]
    key = cache_key(section_input(section()), question_spec()["roles"])
    value = json.loads((tmp_path / "cache" / f"{key}.json").read_text())
    value["probabilities"]["scope"] = .2
    with pytest.raises(ValueError, match="probabilities"):
        validate_cache(value)
    validate_label_manifest(first["manifest"], tmp_path)


def test_fallbacks_do_not_drop_sections(tmp_path, monkeypatch):
    from pipeline.jev import sections
    monkeypatch.setattr(sections, "budgeted_classify", lambda *args: (_ for _ in ()).throw(JevError("input")))
    result = label_sections([section(""), {**section("x" * 40_000), "id": "large"}], root=tmp_path, cache_only=False, ledger=object())
    assert [r["status"] for r in result["manifest"]["sections"]] == ["empty", "input"]
    assert result["annotations"] == []


def test_annotation_write_transaction_refuses_frozen_or_changed_input():
    from pipeline.graph.corpus_writer import CorpusGraphWriter
    class Result:
        def __init__(self, count): self.count = count
        def single(self): return {"count": self.count}
    class Session:
        def __init__(self, frozen, matched): self.frozen, self.matched, self.committed, self.rolled_back = frozen, matched, False, False
        def run(self, query, params=None): return Result(self.frozen if "CorpusRelease" in query else self.matched)
        def execute_write(self, fn):
            try:
                fn(self)
                self.committed = True
            except Exception:
                self.rolled_back = True
                raise
    for frozen, matched in [(1, 1), (0, 0), (0, 1)]:
        session = Session(frozen, matched)
        @contextmanager
        def factory(): yield session
        writer = CorpusGraphWriter(factory)
        if frozen or not matched:
            with pytest.raises(ValueError):
                writer.write_section_roles([{"id": "s", "expected": {}, "annotation": "{}"}], "digest")
            assert session.rolled_back and not session.committed
        else:
            writer.write_section_roles([{"id": "s", "expected": {}, "annotation": "{}"}], "digest")
            assert session.committed


def test_all_paid_transports_share_ledger_and_unknown_is_refused(tmp_path):
    path = tmp_path / "pricing.json"
    path.write_text(canonical({"confirmed": True, "models": {
        "baseline": {"provider": "openai", "inputPerMillion": .25, "outputPerMillion": 2, "maxOutputTokens": 200},
        "judge": {"provider": "anthropic", "inputPerMillion": 3, "outputPerMillion": 15, "maxOutputTokens": 1024},
        "embedding": {"provider": "voyage", "inputPerMillion": .1, "outputPerMillion": 0}}}))
    ledger_path = tmp_path / "campaign.db"
    for url, model in [("https://api.openai.com/v1/responses", "baseline"), ("https://api.anthropic.com/v1/messages", "judge"), ("https://api.voyageai.com/v1/embeddings", "embedding")]:
        reservation = reserve_transport(url, {"model": model, "input": "text"}, ledger_path=ledger_path, pricing_path=path)
        if model == "baseline":
            assert reservation["body"]["max_output_tokens"] == 200
        settle_transport(reservation, {"input_tokens": 10, "output_tokens": 0}, ledger_path)
    with pytest.raises(ValueError, match="unknown"):
        reserve_transport("https://unknown.example/v1", {"model": "baseline"}, ledger_path=ledger_path, pricing_path=path)
    with pytest.raises(ValueError, match="unknown model"):
        reserve_transport("https://api.openai.com/v1/responses", {"model": "unknown"}, ledger_path=ledger_path, pricing_path=path)
    ledger = Ledger(ledger_path)
    assert ledger.summary()["unsettledCalls"] == 0
    ledger.close()


def test_proposed_labels_cannot_qualify(tmp_path):
    from pipeline.jev.benchmarks import FIXTURES, prepare_scope, blind_review
    from pipeline.jev.reports import report_scope
    fixture = prepare_scope(tmp_path)
    assert len(fixture["rows"]) == 200 and all(not r["reviewed"] for r in fixture["rows"])
    assert len(json.loads((FIXTURES / "fresh-paraphrases.json").read_text())) == 50
    blind_review(tmp_path, "scope")
    (tmp_path / "scope-results.json").write_text(canonical({"inputDigest": fixture["digest"], "rows": []}))
    assert report_scope(tmp_path)["status"] == "pending_review"
    review = json.loads((tmp_path / "scope-review.json").read_text())
    assert all("proposedLabel" not in r for r in review["rows"])


def test_scope_qualification_requires_complete_reference_and_no_false_blocks(tmp_path):
    from pipeline.jev.benchmarks import prepare_scope, blind_review
    from pipeline.jev.reports import report_scope
    fixture = prepare_scope(tmp_path)
    blind_review(tmp_path, "scope")
    review_path = tmp_path / "scope-review.json"
    review = json.loads(review_path.read_text())
    review["reviewer"] = "Test reviewer"
    label_map = {}
    for i, r in enumerate(review["rows"]):
        r["label"] = ["on_topic", "ambiguous", "off_topic"][i % 3]
        label_map[r["id"]] = r["label"]
    review_path.write_text(canonical(review))
    results = [{"id": r["id"], "provider": p, "blocked": label_map[r["id"]] == "off_topic", "fallback": False,
                "latencyMs": 100 if p == "jev" else 200} for r in fixture["rows"] for p in ("openai", "jev")]
    path = tmp_path / "scope-results.json"
    path.write_text(canonical({"inputDigest": fixture["digest"], "rows": results}))
    assert report_scope(tmp_path)["status"] == "qualified"
    next(r for r in results if r["provider"] == "jev" and label_map[r["id"]] != "off_topic")["blocked"] = True
    path.write_text(canonical({"inputDigest": fixture["digest"], "rows": results}))
    assert report_scope(tmp_path)["status"] == "failed"


def test_cache_probability_tamper_invalidates_manifest(tmp_path, monkeypatch):
    from pipeline.jev import sections
    monkeypatch.setattr(sections, "budgeted_classify", lambda state, spec, ledger: {"response": response(spec), "latencyMs": 1})
    result = label_sections([section()], root=tmp_path, ledger=object(), cache_only=False)
    entry = result["manifest"]["sections"][0]
    path = tmp_path / "cache" / f"{entry['cacheKey']}.json"
    value = json.loads(path.read_text())
    value["response"]["answers"]["scope"]["noul"] = value["probabilities"]["scope"] = .91
    path.write_text(canonical(value))
    with pytest.raises(ValueError, match="Manifest/cache"):
        validate_label_manifest(result["manifest"], tmp_path)


def test_sqlite_backup_snapshot_reads_committed_wal(tmp_path):
    import importlib.util
    import sqlite3
    from pipeline.jev.benchmarks import REPO_ROOT
    spec = importlib.util.spec_from_file_location("snapshots", REPO_ROOT / "scripts/ops/snapshot-corpus-databases.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    root = tmp_path / "corpus"
    path = root / "pipeline/jev/campaign.db"
    path.parent.mkdir(parents=True)
    ledger = Ledger(path)
    ledger.reserve("typesafe", MODEL, "hash", 12)
    snapshots = tmp_path / "snapshots"
    assert module.snapshot_databases(root, snapshots) == 1
    with sqlite3.connect(snapshots / "pipeline/jev/campaign.db.sqlite-snapshot") as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT charged FROM calls").fetchone()[0] == 12_000_000_000
    ledger.close()


def test_typescript_transport_uses_same_python_ledger_without_network(tmp_path):
    import os
    import subprocess
    from pipeline.jev.benchmarks import REPO_ROOT
    ledger_path = tmp_path / "shared.db"
    pricing_path = tmp_path / "pricing.json"
    pricing_path.write_text(canonical({"confirmed": True, "models": {MODEL: {
        "provider": "typesafe", "inputPerMillion": .042, "outputPerMillion": 0}}}))
    script = '''import { installValidationBudget } from './packages/agent/src/jev/validation-budget.ts';
      import { classifyJev } from './packages/policy-corpus/src/jev/client.ts';
      globalThis.fetch = async () => new Response(JSON.stringify({model:'jev-1.13.0',answers:{role:{type:'noul',noul:.95}},usage:{input_tokens:100,output_tokens:20}}));
      installValidationBudget();
      (async () => {const result = await classifyJev('public',{role:{type:'noul',instructions:'Is this public?'}},{apiKey:'test',timeoutMs:5000}); console.log(result.model)})().catch(() => process.exit(1));'''
    completed = subprocess.run([str(REPO_ROOT / "node_modules/.bin/tsx"), "-e", script], cwd=REPO_ROOT,
                               env={**os.environ, "JEV_VALIDATION_LEDGER": str(ledger_path), "JEV_VALIDATION_PRICING": str(pricing_path)},
                               capture_output=True, text=True, timeout=30)
    assert completed.returncode == 0, completed.stderr
    ledger = Ledger(ledger_path)
    assert ledger.summary()["unsettledCalls"] == 0
    assert ledger.summary()["chargedUsd"] == pytest.approx(.0000042)
    ledger.close()


def test_scope_all_failed_open_cannot_qualify(tmp_path):
    from pipeline.jev.benchmarks import prepare_scope, blind_review
    from pipeline.jev.reports import report_scope
    fixture = prepare_scope(tmp_path)
    blind_review(tmp_path, "scope")
    review_path = tmp_path / "scope-review.json"
    review = json.loads(review_path.read_text())
    review["reviewer"] = "Test reviewer"
    for i, row in enumerate(review["rows"]):
        row["label"] = ["on_topic", "ambiguous", "off_topic"][i % 3]
    review_path.write_text(canonical(review))
    rows = [{"id": r["id"], "provider": p, "blocked": False, "fallback": True,
             "latencyMs": 1 if p == "jev" else 2} for r in fixture["rows"] for p in ("openai", "jev")]
    (tmp_path / "scope-results.json").write_text(canonical({"inputDigest": fixture["digest"], "rows": rows}))
    assert report_scope(tmp_path)["status"] == "failed"


def test_persistent_section_auth_error_stops_paid_attempts(tmp_path, monkeypatch):
    from pipeline.jev import sections
    calls = []
    def rejected(*args):
        calls.append(args)
        raise JevError("http", status=401)
    monkeypatch.setattr(sections, "budgeted_classify", rejected)
    rows = [{**section(), "id": str(i)} for i in range(4)]
    result = label_sections(rows, root=tmp_path, ledger=object(), cache_only=False)
    assert len(calls) == 1
    assert len(result["manifest"]["sections"]) == 4
    assert all(row["status"] != "labeled" for row in result["manifest"]["sections"])


def test_metering_preserves_modern_completion_limit_and_rejects_hosted_tools(tmp_path):
    pricing = tmp_path / "pricing.json"
    pricing.write_text(canonical({"confirmed": True, "models": {"baseline": {
        "provider": "openai", "inputPerMillion": .25, "outputPerMillion": 2, "maxOutputTokens": 128000}}}))
    options = {"ledger_path": tmp_path / "ledger.db", "pricing_path": pricing}
    result = reserve_transport("https://api.openai.com/v1/chat/completions",
                               {"model": "baseline", "max_completion_tokens": 200}, **options)
    assert result["body"]["max_completion_tokens"] == 200
    assert "max_tokens" not in result["body"]
    with pytest.raises(ValueError, match="hosted tools"):
        reserve_transport("https://api.openai.com/v1/responses",
                          {"model": "baseline", "tools": [{"type": "web_search_preview"}]}, **options)


def test_restoration_validator_imports_without_third_party_packages():
    import subprocess
    from pipeline.jev.benchmarks import REPO_ROOT
    script = "import sys; sys.path.insert(0, 'packages/pipeline/src'); from pipeline.jev.artifacts import validate_cache"
    result = subprocess.run(["python3", "-S", "-c", script], cwd=REPO_ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_answer_comparison_binds_roles_annotations_and_scope_provider(monkeypatch):
    import pipeline.evaluation_evidence as evidence
    import pipeline.release as release
    from pipeline.jev.reports import compare_answers
    monkeypatch.setattr(evidence, "require_complete_results", lambda *args: None)
    monkeypatch.setattr(evidence, "verification_summary", lambda *args: {"withholdingRate": 0})
    monkeypatch.setattr(release, "build_release_evaluation_results", lambda *args: dict.fromkeys(
        ["retrievalPrecision", "retrievalRecall", "primaryDocumentHitRate", "answerScore", "hallucinationScore"], 3))
    def run(arm, i):
        return {"qualificationHash": "reviewed-roles", "fingerprint": {"implementationHash": "same", "jev": {
            "scopeProvider": "openai", "sectionRolesEnabled": arm == "candidate",
            "annotationDigest": "labels" if arm == "candidate" else None, "allowedRoles": ["scope"]}},
            "retrieval": {"run_id": f"{arm}-retrieval-{i}"},
            "answer": {"run_id": f"{arm}-answer-{i}", "config": {"evidence_normalization": {"mappingHash": "mapping"}}}}
    baseline = [run("baseline", i) for i in range(3)]
    candidate = [run("candidate", i) for i in range(3)]
    result = compare_answers(baseline, candidate)
    assert result["status"] == "answer_gates_passed"
    assert result["candidateIdentity"]["annotationDigest"] == "labels"
    candidate[1]["fingerprint"]["jev"]["allowedRoles"] = ["exclusions"]
    with pytest.raises(ValueError, match="configuration changed"):
        compare_answers(baseline, candidate)
    candidate = [run("candidate", i) for i in range(3)]
    for row in candidate:
        row["fingerprint"]["jev"]["scopeProvider"] = "jev"
    with pytest.raises(ValueError, match="configuration mismatch"):
        compare_answers(baseline, candidate)


def test_large_confirmed_price_tier_is_refused_before_reservation(tmp_path):
    pricing = tmp_path / "pricing.json"
    pricing.write_text(canonical({"confirmed": True, "models": {"terra": {
        "provider": "openai", "inputPerMillion": 2, "outputPerMillion": 12,
        "maxOutputTokens": 128000, "maxInputTokens": 5000, "inputMultiplier": 1.25}}}))
    ledger_path = tmp_path / "ledger.db"
    reservation = reserve_transport("https://api.openai.com/v1/responses", {"model": "terra", "input": "short"},
                                    ledger_path=ledger_path, pricing_path=pricing)
    settle_transport(reservation, {"input_tokens": 100, "output_tokens": 10}, ledger_path)
    ledger = Ledger(ledger_path)
    before = ledger.summary()
    with pytest.raises(ValueError, match="price tier"):
        reserve_transport("https://api.openai.com/v1/responses", {"model": "terra", "input": "x" * 6000},
                          ledger_path=ledger_path, pricing_path=pricing)
    assert ledger.summary() == before
    assert before["chargedUsd"] == pytest.approx(.00037)
    ledger.close()


def test_oversized_section_abstains_without_stopping_later_inputs(tmp_path, monkeypatch):
    from pipeline.jev import sections
    def inference(state, spec, ledger):
        if "Oversized" in state:
            raise JevError("input")
        return {"response": response(spec), "latencyMs": 1}
    monkeypatch.setattr(sections, "budgeted_classify", inference)
    result = label_sections([{**section("Oversized"), "id": "large"}, section()], root=tmp_path,
                            ledger=object(), cache_only=False)
    assert [r["status"] for r in result["manifest"]["sections"]] == ["input", "labeled"]
