"""Human review blindness, browser progress, import identity and inference reuse."""
import json
import subprocess
from pathlib import Path

import pytest

from pipeline.jev.benchmarks import REPO_ROOT, freeze, reuse_routing
from pipeline.jev.client import canonical, digest, question_spec
from pipeline.jev.review import export_review_html


@pytest.mark.parametrize("kind", ["scope", "routing", "sections"])
def test_offline_review_blinds_inputs_and_round_trips_labels(tmp_path, kind):
    text = '</script><script>globalThis.stolen = true</script>'
    row = {"id": "one", "question": text, "messages": [{"role": "user", "content": text}],
           "input": {"title": "Policy", "content": text}, "kind": "hiddenSentinel",
           "proposedLabel": "hiddenSentinel", "baseline": "hiddenSentinel"}
    fixture = freeze(tmp_path / f"{kind}-inputs.json", {"kind": kind, "rows": [row]})
    review = {"inputDigest": fixture["digest"], "kind": kind, "reviewer": None,
              "rows": [{**row, "prediction": "hiddenSentinel", "label": None}]}
    (tmp_path / f"{kind}-review.json").write_text(canonical(review))
    result = export_review_html(tmp_path, kind)
    html = Path(result["path"]).read_text()
    assert "hiddenSentinel" not in html
    assert text not in html
    assert "https://" not in html and "fetch(" not in html
    before = (tmp_path / f"{kind}-review.json").read_bytes()
    script = r'''
const fs=require('node:fs'), assert=require('node:assert/strict'), {JSDOM}=require('jsdom');
const html=fs.readFileSync(process.argv[1],'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://offline-review.invalid',beforeParse(w){w.structuredClone=structuredClone;w.fetch=()=>{throw Error('Network forbidden')};}});
const w=dom.window,d=w.document;
assert.equal(w.stolen,undefined);
assert.match(d.getElementById('progress').textContent,/0 of 1/);
const reviewer=d.getElementById('reviewer');reviewer.value='Human Reviewer';reviewer.dispatchEvent(new w.Event('input'));
for(const select of d.querySelectorAll('#fields select')){select.value=select.options[1].value;select.dispatchEvent(new w.Event('change'));}
assert.match(d.getElementById('progress').textContent,/1 of 1/);
const saved=JSON.parse(w.localStorage.getItem(w.eval('key')));
assert.equal(saved.reviewer,'Human Reviewer');assert.equal(saved.rows.length,1);
const storageBefore=w.localStorage.getItem(w.eval('key'));
assert.throws(()=>w.importReview({...saved,evidenceSource:'ai_diagnostic'}),/cannot replace human/);
assert.equal(w.localStorage.getItem(w.eval('key')),storageBefore);
const changed=structuredClone(saved);changed.rows[0].question='tampered';changed.rows[0].input={content:'tampered'};changed.rows[0].messages=[{role:'user',content:'tampered'}];
w.importReview(changed);w.render();assert.ok(d.getElementById('content').textContent.includes('</script>'));
assert.throws(()=>w.importReview({...saved,inputDigest:'wrong'}),/different review/);
assert.throws(()=>w.importReview({...saved,rows:[]}),/different review/);
const bad=structuredClone(saved);bad.rows[0].label=saved.kind==='scope'?'unknown':{unknown:true};
assert.throws(()=>w.importReview(bad),/Invalid|Unknown/);
const loaded=new JSDOM(html,{runScripts:'dangerously',url:'https://offline-review.invalid',beforeParse(v){v.structuredClone=structuredClone;v.localStorage.setItem(w.eval('key'),JSON.stringify(saved));}});
assert.equal(loaded.window.document.getElementById('reviewer').value,'Human Reviewer');
assert.match(loaded.window.document.getElementById('progress').textContent,/1 of 1/);
loaded.window.close();w.close();console.log('review passed');
'''
    completed = subprocess.run(["node", "-e", script, result["path"]], cwd=REPO_ROOT, text=True, capture_output=True)
    assert completed.returncode == 0, completed.stderr
    assert (tmp_path / f"{kind}-review.json").read_bytes() == before


def test_routing_reuse_requires_exact_inputs_and_rederives_predictions(tmp_path):
    from tests.test_jev import response
    questions = question_spec()["routing"]
    source, target = tmp_path / "source", tmp_path / "target"
    fixture = {"model": question_spec()["model"], "specHash": digest(questions),
               "rows": [{"id": "one", "question": "Does Medicaid cover therapy?", "baseline": {}}]}
    parent = freeze(source / "routing-inputs.json", fixture.copy())
    freeze(target / "routing-inputs.json", fixture.copy())
    inference = {"inputHash": digest(fixture["rows"][0]["question"]), "specHash": digest(questions), "response": response(questions)}
    result = {"inputDigest": parent["digest"], "rows": [{"id": "one", "candidate": {"questionType": "tampered"}, "inference": inference}]}
    (source / "routing-results.json").write_text(canonical(result))
    assert reuse_routing(target, source)["reusedRows"] == 1
    reused = json.loads((target / "routing-results.json").read_text())
    assert reused["rows"][0]["candidate"]["questionType"] != "tampered"
    changed = tmp_path / "changed"
    freeze(changed / "routing-inputs.json", {**fixture, "rows": [{"id": "one", "question": "Changed text"}]})
    with pytest.raises(ValueError, match="text changed"):
        reuse_routing(changed, source)
    assert not (changed / "routing-results.json").exists()


def test_candidate_runs_wait_for_human_labels_without_paid_calls(tmp_path, monkeypatch):
    import os
    monkeypatch.delenv("JEV_VALIDATION_LEDGER", raising=False)
    monkeypatch.delenv("JEV_VALIDATION_PRICING", raising=False)
    from pipeline.jev.validation import run_answer_validation
    freeze(tmp_path / "sections-inputs.json", {"kind": "sections", "rows": []})
    (tmp_path / "sections-review.json").write_text(canonical({"inputDigest": json.loads((tmp_path / "sections-inputs.json").read_text())["digest"],
                                                            "kind": "sections", "reviewer": None, "rows": []}))
    pricing = tmp_path / "pricing.json"
    pricing.write_text(canonical({"confirmed": True, "models": {}}))
    result = run_answer_validation(tmp_path, tmp_path / "ledger.db", pricing)
    assert result["status"] == "pending_review"
    assert "JEV_VALIDATION_LEDGER" not in os.environ
    assert "JEV_VALIDATION_PRICING" not in os.environ
    from pipeline.jev.budget import Ledger
    ledger = Ledger(tmp_path / "ledger.db")
    assert ledger.summary()["chargedUsd"] == 0
    ledger.close()


def test_partial_human_labels_are_pending_not_invalid(tmp_path):
    from pipeline.jev.reports import reviewed
    for kind, label in (("sections", {"scope": True}), ("routing", {"flags": {"needsCoverage": True}})):
        # Use an actual flag name, rather than making the fixture mirror the validator.
        if kind == "routing":
            label = {"flags": {next(k for k in question_spec()["routing"] if k != "questionType"): True}}
        fixture = freeze(tmp_path / f"{kind}-inputs.json", {"kind": kind, "rows": [{"id": "one"}]})
        path = tmp_path / f"{kind}-review.json"
        path.write_text(canonical({"kind": kind, "inputDigest": fixture["digest"], "reviewer": "Human", "rows": [{"id": "one", "label": label}]}))
        assert reviewed(tmp_path, kind)[1] == {}
        label["unknown"] = True
        path.write_text(canonical({"kind": kind, "inputDigest": fixture["digest"], "reviewer": "Human", "rows": [{"id": "one", "label": label}]}))
        with pytest.raises(ValueError, match="Invalid"):
            reviewed(tmp_path, kind)


def test_qualification_refuses_same_ids_with_changed_content(tmp_path, monkeypatch):
    from pipeline.jev import sections
    from pipeline.jev.reports import require_qualification_corpus
    inventory = [{"id": "one", "documentId": "doc", "documentType": "clinical_policy", "contentLength": 4}]
    row = {"id": "one", "documentId": "doc", "documentType": "clinical_policy", "content": "same"}
    fixture = {"inventoryHash": digest(inventory), "rows": [{"id": "one", "input": sections.section_input(row)}]}
    freeze(tmp_path / "sections-inputs.json", fixture)
    monkeypatch.setattr(sections, "graph_section_index", lambda: inventory)
    monkeypatch.setattr(sections, "graph_sections", lambda ids: [row])
    require_qualification_corpus(tmp_path)
    row["content"] = "evil"  # Same length and identities; metadata alone cannot detect this.
    with pytest.raises(ValueError, match="inputs changed"):
        require_qualification_corpus(tmp_path)


@pytest.mark.parametrize("campaign_name", ["campaign", "campaign # ? space"])
def test_snapshot_preserves_live_wal_reviews_and_cache_without_environment(tmp_path, campaign_name):
    import hashlib
    import sqlite3
    from pipeline.jev.budget import Ledger
    from pipeline.jev.snapshot import snapshot_campaign
    campaign, labels, backup = (tmp_path / name for name in (campaign_name, "labels", "backup"))
    campaign.mkdir()
    labels.mkdir()
    (campaign / "scope-review.json").write_text('{"reviewer":"Human"}')
    (campaign / "qualification.env").write_text("secret=excluded")
    (labels / "cached.json").write_text('{"probabilities":{}}')
    ledger = Ledger(campaign / "campaign.db")
    ledger.reserve("typesafe", "jev", "input", .01)
    result = snapshot_campaign(campaign, ledger.path, labels, backup)
    assert (backup / "campaign/scope-review.json").read_bytes() == (campaign / "scope-review.json").read_bytes()
    assert not (backup / "campaign/qualification.env").exists()
    with sqlite3.connect(backup / "campaign.db") as db:
        assert db.execute("SELECT count(*) FROM calls").fetchone()[0] == 1
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    for path, expected in result["files"].items():
        assert hashlib.sha256((backup / path).read_bytes()).hexdigest() == expected
    with pytest.raises(ValueError, match="new directory"):
        snapshot_campaign(campaign, ledger.path, labels, campaign / "nested")
    ledger.close()


def test_dashboard_embeds_all_forms_and_keeps_labels_when_switching(tmp_path):
    from pipeline.jev.review import export_review_dashboard
    for kind in ("scope", "sections", "routing"):
        row = {"id": "one", "question": "Does Medicaid cover therapy?", "messages": [{"role": "user", "content": "I need Medicaid help"}],
               "input": {"title": "Coverage policy", "content": "Therapy is covered"}, "prediction": "hiddenSentinel"}
        fixture = freeze(tmp_path / f"{kind}-inputs.json", {"kind": kind, "rows": [row]})
        (tmp_path / f"{kind}-review.json").write_text(canonical({"kind": kind, "inputDigest": fixture["digest"], "reviewer": None, "rows": [{"id": "one", "label": None}]}))
    result = export_review_dashboard(tmp_path)
    html = Path(result["path"]).read_text()
    assert "hiddenSentinel" not in html and 'href="scope-review.html"' not in html
    script = r'''
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(process.argv[1],'utf8'),{runScripts:'dangerously',url:'https://offline-review.invalid',beforeParse(w){w.structuredClone=structuredClone;}});
const w=dom.window,d=w.document;
assert.equal(d.querySelectorAll('#reviewSets button').length,3);
d.getElementById('reviewer').value='Human';d.getElementById('reviewer').dispatchEvent(new w.Event('input'));
const select=d.getElementById('label-verdict');select.value='ambiguous';select.dispatchEvent(new w.Event('change'));
for(const button of d.querySelectorAll('#reviewSets button')){button.click();assert.ok(d.querySelectorAll('#fields select').length>0);}
d.querySelector('#reviewSets button[data-kind="scope"]').click();
assert.equal(d.getElementById('label-verdict').value,'ambiguous');
assert.equal(d.getElementById('reviewer').value,'Human');
assert.match(d.getElementById('progress').textContent,/1 of 1/);w.close();
'''
    completed = subprocess.run(["node", "-e", script, result["path"]], cwd=REPO_ROOT, text=True, capture_output=True)
    assert completed.returncode == 0, completed.stderr
    assert json.loads((tmp_path / "scope-review.json").read_text())["reviewer"] is None
