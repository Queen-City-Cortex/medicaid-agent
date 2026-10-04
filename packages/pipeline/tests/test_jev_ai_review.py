"""AI diagnostics stay independent, resumable and outside human gates."""
import json
from pathlib import Path

import pytest

from pipeline.jev.ai_review import MODELS, batches, build_audit, infer_batch, validate_labels
from pipeline.jev.benchmarks import freeze
from pipeline.jev.budget import Ledger
from pipeline.jev.client import canonical, question_spec


def label(kind):
    spec = question_spec()["roles" if kind == "sections" else "routing"]
    flags = {k: False for k in spec if k != "questionType"}
    return flags if kind == "sections" else {"questionType": "coverage", "flags": flags}


def test_ai_evidence_cannot_be_promoted_by_renaming_review(tmp_path):
    from pipeline.jev.reports import reviewed
    from pipeline.jev.review import export_review_html
    fixture = freeze(tmp_path / "sections-inputs.json", {"kind": "sections", "rows": [{"id": "one"}]})
    (tmp_path / "sections-review.json").write_text(canonical({"kind": "sections", "inputDigest": fixture["digest"],
        "reviewer": "Pretend human", "evidenceSource": "ai_diagnostic", "rows": [{"id": "one", "label": label("sections")}]}))
    with pytest.raises(ValueError, match="not independent human"):
        reviewed(tmp_path, "sections")
    with pytest.raises(ValueError, match="cannot replace human"):
        export_review_html(tmp_path, "sections")


def test_oversized_inputs_abstain_without_truncating_or_stopping_later_rows():
    rows = [{"id": "big", "input": {"content": "X" * 160_001}}, {"id": "small", "input": {"content": "Covered"}}]
    groups, unsupported = batches(rows)
    assert unsupported == ["big"]
    assert groups == [[rows[1]]]
    assert len(rows[0]["input"]["content"]) == 160_001


def test_ai_output_rejects_duplicate_ids_and_incomplete_flags():
    import jsonschema
    row = {"id": "one", "label": label("routing"), "confidence": "high", "reason": "Coverage question"}
    with pytest.raises(ValueError, match="identities"):
        validate_labels("routing", [row, row], ["one", "two"])
    row["label"]["flags"] = {}
    with pytest.raises(jsonschema.ValidationError):
        validate_labels("routing", [row], ["one"])


def test_independent_paid_requests_are_validated_cached_and_settled(tmp_path, monkeypatch):
    import pipeline.jev.ai_review as module
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    pricing = tmp_path / "pricing.json"
    pricing.write_text(canonical({"confirmed": True, "models": {MODELS["openai"]: {"provider": "openai",
        "inputPerMillion": .25, "outputPerMillion": 2, "maxOutputTokens": 8192}}}))
    calls = []
    invalid = {"value": False}
    output = {"rows": [{"id": "one", "label": label("sections"), "confidence": "medium", "reason": "No role established"}]}
    class Response:
        status_code = 200
        is_success = True
        def json(self):
            return {"status": "completed", "usage": {"input_tokens": 10, "output_tokens": 10},
                    "output": [{"content": [{"type": "output_text", "text": canonical({"rows": []} if invalid["value"] else output)}]}]}
    class Client:
        def __init__(self, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, **kwargs):
            calls.append(kwargs["json"])
            return Response()
    monkeypatch.setattr(module.httpx, "Client", Client)
    args = {"fixture_digest": "frozen-inputs", "output": tmp_path, "ledger": tmp_path / "ledger.db", "pricing": pricing}
    row = {"id": "one", "input": {"content": "Policy excerpt"}}
    result = infer_batch("sections", [row], "openai", **args)
    assert result["status"] == "complete"
    assert result["evidenceSource"] == "ai_diagnostic"
    assert infer_batch("sections", [row], "openai", **args) == result
    assert len(calls) == 1
    assert "baseline" not in calls[0]["input"] and "candidate" not in calls[0]["input"]
    ledger = Ledger(args["ledger"])
    assert ledger.summary()["chargedUsd"] == .0000225
    ledger.close()
    # A transient invalid result can be explicitly resumed once, preserving both charges.
    changed = {"id": "one", "input": {"content": "Changed policy input"}}
    invalid["value"] = True
    failed = infer_batch("sections", [changed], "openai", **args)
    assert failed["status"] != "complete"
    invalid["value"] = False
    resumed = infer_batch("sections", [changed], "openai", **args)
    assert resumed["status"] == "complete"
    assert infer_batch("sections", [changed], "openai", **args) == resumed
    assert len(calls) == 3
    assert len(list((tmp_path / "ai-receipts").glob("*.json"))) == 3


def test_small_audit_is_bounded_only_disagreements_and_preserves_human_files(tmp_path):
    for kind in ("sections", "routing"):
        rows = [{"id": str(i), "documentId": f"doc-{i}", "family": ["clinical_policy", "waiver", "bulletin"][i % 3],
                 "question": "Does Medicaid cover therapy?", "input": {"content": "Therapy is covered", "documentTitle": "Therapy policy"}} for i in range(30)]
        fixture = freeze(tmp_path / f"{kind}-inputs.json", {"kind": kind, "rows": rows})
        for provider in MODELS:
            values = []
            for i, row in enumerate(rows):
                value = label(kind)
                if provider == "opus" and i < 20:
                    if kind == "sections":
                        value["covered_services"] = True
                    else:
                        value["questionType"] = "general"
                values.append({"id": row["id"], "label": value, "confidence": "medium", "reason": "AI reasoning"})
            freeze(tmp_path / f"{kind}-ai-{provider}.json", {"kind": kind, "inputDigest": fixture["digest"], "evidenceSource": "ai_diagnostic", "rows": values})
    human = tmp_path / "sections-review.json"
    human.write_text('preserve existing reviewer')
    result = build_audit(tmp_path)
    artifact = json.loads((tmp_path / "ai-audit-inputs.json").read_text())
    assert result["auditItems"] <= 15
    assert all(row["selection"] == "disagreement" for row in artifact["rows"])
    assert max(len(row["fields"]) for row in artifact["rows"]) <= 3
    assert len({(row["kind"], row["group"]) for row in artifact["rows"]}) == len(artifact["rows"])
    assert human.read_text() == 'preserve existing reviewer'
    html = Path(result["path"]).read_text()
    assert "qualification:'not_human_reference'" in html
    assert "fetch(" not in html


def test_missing_keys_do_not_reserve_or_touch_human_reviews(tmp_path, monkeypatch):
    from pipeline.jev.ai_review import run_ai_review
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    human = tmp_path / 'routing-review.json'
    human.write_text('existing human work')
    ledger = tmp_path / 'ledger.db'
    result = run_ai_review(tmp_path, ledger, tmp_path / 'pricing.json')
    assert result['status'] == 'pending_credentials'
    assert not ledger.exists()
    assert human.read_text() == 'existing human work'


def test_diagnostic_precision_exposes_unresolved_references(tmp_path, monkeypatch):
    from pipeline.jev.ai_review import diagnostic_comparison
    import pipeline.jev.sections as sections
    from pipeline.jev.client import digest
    labels_root = tmp_path / 'labels'
    (labels_root / 'manifests').mkdir(parents=True)
    (labels_root / 'cache').mkdir()
    monkeypatch.setattr(sections, 'LABEL_ROOT', labels_root)
    monkeypatch.setattr(sections, 'validate_label_manifest', lambda *args: None)
    monkeypatch.setattr(sections, 'validate_cache', lambda value: value)
    rows = [{'id': str(i), 'input': {'content': str(i)}, 'split': 'heldout'} for i in range(2)]
    fixture = freeze(tmp_path / 'sections-inputs.json', {'kind': 'sections', 'rows': rows})
    entries = []
    for row in rows:
        entries.append({'id': row['id'], 'status': 'labeled', 'cacheKey': row['id'], 'inputHash': digest(row['input'])})
        (labels_root / 'cache' / f"{row['id']}.json").write_text(canonical({'probabilities': {k: .95 if k == 'scope' else 0 for k in label('sections')}}))
    (labels_root / 'manifests/m.json').write_text(canonical({'sections': entries}))
    (tmp_path / 'sections-results.json').write_text(canonical({'inputDigest': fixture['digest'], 'manifestDigest': 'm'}))
    freeze(tmp_path / 'sections-heuristics.json', {'inputDigest': fixture['digest'], 'predictions': {r['id']: label('sections') for r in rows}})
    for provider in MODELS:
        values = []
        for row in rows:
            truth = label('sections')
            truth['scope'] = row['id'] == '0' or provider == 'openai'
            values.append({'id': row['id'], 'label': truth})
        freeze(tmp_path / f'sections-ai-{provider}.json', {'inputDigest': fixture['digest'], 'rows': values})
    baseline = label('routing')
    routing = freeze(tmp_path / 'routing-inputs.json', {'rows': [{'id': 'q', 'baseline': baseline}]})
    for provider in MODELS:
        freeze(tmp_path / f'routing-ai-{provider}.json', {'inputDigest': routing['digest'], 'rows': [{'id': 'q', 'label': baseline}]})
    candidate = {'questionType': None, 'flags': {k: None for k in baseline['flags']}}
    (tmp_path / 'routing-results.json').write_text(canonical({'inputDigest': routing['digest'], 'rows': [{'id': 'q', 'candidate': candidate}]}))
    result = diagnostic_comparison(tmp_path)
    scope = result['sectionsHeldout']['scope']
    assert scope['precisionAgainstAiConsensus'] == 1
    assert scope['precisionLowerBound'] == .5
    assert scope['referenceDisagreement'] == 1
    assert result['qualifiedRoles'] == []
    assert result['status'] == 'observational_ai_reference'
    assert result['routing']['jevAbstentionFields'] > 0


def test_audit_import_validates_before_saving_and_applies_only_reviewed_fields(tmp_path):
    from pipeline.jev.ai_review import import_audit_review, working_reference
    rows = [{'id': 'one', 'question': 'Does Medicaid cover therapy?', 'input': {'content': 'Coverage policy'}, 'documentId': 'doc', 'family': 'clinical_policy'}]
    for kind in ('sections', 'routing'):
        fixture = freeze(tmp_path / f'{kind}-inputs.json', {'kind': kind, 'rows': rows})
        for provider in MODELS:
            value = label(kind)
            if kind == 'sections':
                value['covered_services'] = provider == 'opus'
                value['forms'] = provider == 'opus'
            else:
                value['questionType'] = 'general' if provider == 'opus' else 'coverage'
            freeze(tmp_path / f'{kind}-ai-{provider}.json', {'kind': kind, 'inputDigest': fixture['digest'],
                'evidenceSource': 'ai_diagnostic', 'rows': [{'id': 'one', 'label': value, 'confidence': 'high', 'reason': 'Reason'}]})
    build_audit(tmp_path)
    inputs = json.loads((tmp_path / 'ai-audit-inputs.json').read_text())
    review = {'inputDigest': inputs['digest'], 'evidenceSource': 'human_audit_of_ai_draft',
        'qualification': 'not_human_reference', 'reviewer': 'Human',
        'rows': [{'id': r['id'], 'decisions': dict(reversed(list(r['suggestions']['opus']['labels'].items())))} for r in inputs['rows']]}
    path = tmp_path / 'download.json'
    path.write_text(canonical(review))
    human = tmp_path / 'sections-review.json'
    human.write_text('original human review')
    result = import_audit_review(tmp_path, path)
    assert result['completeItems'] == result['totalItems'] == 2
    assert result['modelMatches'] == {'openai': 0, 'opus': 3}
    assert result['qualifiedRoles'] == []
    assert import_audit_review(tmp_path, path) == result
    working = working_reference(tmp_path)
    section = working['rows']['sections'][0]['fields']
    assert section['covered_services'] == {'value': True, 'source': 'human_targeted_audit'}
    assert section['scope'] == {'value': False, 'source': 'ai_consensus'}
    assert working['qualification'] == 'not_human_reference'
    assert human.read_text() == 'original human review'
    freeze(tmp_path / 'ai-audit-confidence-note.json', {'auditReviewHash': result['reviewHash'],
          'disposition': 'all_audit_decisions_provisional'})
    provisional = working_reference(tmp_path)
    tentative = provisional['rows']['sections'][0]['fields']['covered_services']
    assert tentative == {'value': None, 'source': 'provisional_human_audit', 'tentativeValue': True}
    assert provisional['counts']['human_targeted_audit'] == 0
    assert provisional['counts']['provisional_human_audit'] == 3
    assert json.loads((tmp_path / 'ai-audit-report.json').read_text())['status'] == 'provisional_targeted_audit'
    assert json.loads((tmp_path / 'ai-audit-review.json').read_text()) == review
    before = (tmp_path / 'ai-audit-review.json').read_bytes()
    for invalid in ({**review, 'inputDigest': 'wrong'}, {**review, 'reviewer': ''},
                    {**review, 'evidenceSource': 'ai_diagnostic'}, {**review, 'rows': [review['rows'][0]] * 2}):
        path.write_text(canonical(invalid))
        with pytest.raises(ValueError):
            import_audit_review(tmp_path, path)
        assert (tmp_path / 'ai-audit-review.json').read_bytes() == before
    review['rows'][0]['decisions'] = {'unknown': True}
    path.write_text(canonical(review))
    with pytest.raises(ValueError, match='fields'):
        import_audit_review(tmp_path, path)
    assert (tmp_path / 'ai-audit-review.json').read_bytes() == before
    # Repeated submissions preserve prior completed versions while allowing a partial draft.
    review['rows'][0]['decisions'] = {}
    path.write_text(canonical(review))
    partial = import_audit_review(tmp_path, path)
    assert partial['status'] == 'pending_audit_decisions'
    assert len(list((tmp_path / 'ai-audit-reviews').glob('*.json'))) == 2
