// usage: node compare-frames.mjs <headFile> <otherFile>
import fs from 'node:fs';
const [fa, fb] = process.argv.slice(2);
const HERE = new URL('.', import.meta.url).pathname;
const A = JSON.parse(fs.readFileSync(HERE + fa, 'utf8'));
const B = new Map(JSON.parse(fs.readFileSync(HERE + fb, 'utf8')).map((r) => [r.id, r]));
const rows = JSON.parse(fs.readFileSync(HERE + 'bench-rows.json', 'utf8'));
const meta = new Map(rows.map((r) => [r.id, r]));
const local = JSON.parse(fs.readFileSync('/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/local-corpus-dataset.json', 'utf8'));
const goldenSecs = new Map(local.map((q) => [q.id, { primary: (q.evidence.primary_sections ?? []).map((s) => s.section_id), docs: [...new Set((q.evidence.primary_sections ?? []).map((s) => s.document_id))] }]));

const ids = (xs) => (xs ?? []).map((x) => x.id);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const stat = { n: 0, identical: 0, onlyAuthTail: 0, auth0: 0, primary: 0, supporting: 0, avoidOnly: 0, type: 0 };
const g = { A: { auth0Golden: 0, anyAuthGolden: 0, primaryHit: 0, anyHit: 0, cnAuth: 0 }, B: { auth0Golden: 0, anyAuthGolden: 0, primaryHit: 0, anyHit: 0, cnAuth: 0 }, withGolden: 0 };
const lines = [];
const fmtDocs = (r) => r.authoritative.map((a) => `${a.pn ?? a.id.replace('doc:', '').slice(0, 22)}${a.type === 'change_notice' ? '(rev)' : ''}`).join(', ');
const fmtSecs = (xs) => xs.map((s) => `${s.pn ?? '-'}:${s.number ?? '~' + s.title.slice(0, 14)}`).join(' | ');
for (const a of A) {
  const b = B.get(a.id);
  if (!b) continue;
  stat.n += 1;
  const m = meta.get(a.id);
  const gold = goldenSecs.get(m.parent);
  if (gold && gold.docs.length) {
    g.withGolden += 1;
    for (const [k, r] of [['A', a], ['B', b]]) {
      if (r.error) continue;
      if (gold.docs.includes(r.authoritative[0]?.id)) g[k].auth0Golden += 1;
      if (r.authoritative.some((d) => gold.docs.includes(d.id))) g[k].anyAuthGolden += 1;
      if (r.primary.some((s) => gold.primary.includes(s.id))) g[k].primaryHit += 1;
      if ([...r.primary, ...r.supporting].some((s) => gold.primary.includes(s.id))) g[k].anyHit += 1;
    }
  }
  for (const [k, r] of [['A', a], ['B', b]]) if (!r.error && r.authoritative.some((d) => d.type === 'change_notice')) g[k].cnAuth += 1;
  if (a.error || b.error) { lines.push(`${a.id} ERROR head=${a.error ?? ''} other=${b.error ?? ''}`); continue; }
  const dAuth = !same(ids(a.authoritative), ids(b.authoritative));
  const dAuth0 = a.authoritative[0]?.id !== b.authoritative[0]?.id;
  const dPrim = !same(ids(a.primary), ids(b.primary));
  const dSupp = !same(ids(a.supporting), ids(b.supporting));
  const dAvoid = !same(ids(a.avoid), ids(b.avoid));
  const dType = a.questionType !== b.questionType;
  if (!dAuth && !dPrim && !dSupp && !dAvoid && !dType) { stat.identical += 1; continue; }
  if (dType) stat.type += 1;
  if (dAuth0) stat.auth0 += 1;
  if (dPrim) stat.primary += 1;
  if (dSupp) stat.supporting += 1;
  if (dAuth && !dAuth0 && !dPrim && !dSupp && !dAvoid) stat.onlyAuthTail += 1;
  if (!dAuth && !dPrim && !dSupp && dAvoid) stat.avoidOnly += 1;
  const tag = dAuth0 ? 'AUTH0' : dPrim ? 'PRIMARY' : dSupp ? 'SUPPORT' : dAuth ? 'auth-tail' : 'avoid';
  lines.push(`[${tag}] ${a.id}(${m.parent}) golden=[${m.golden}] type ${a.questionType}${dType ? '->' + b.questionType : ''} "${a.question.slice(0, 110)}"\n    head : lookups=${JSON.stringify(a.lookups.map((l) => l.pns[0] + '→' + l.rows))} auth=[${fmtDocs(a)}] primary=[${fmtSecs(a.primary)}]${dSupp ? ' supporting=[' + fmtSecs(a.supporting) + ']' : ''}\n    other: lookups=${JSON.stringify(b.lookups.map((l) => l.pns[0] + '→' + l.rows))} auth=[${fmtDocs(b)}] primary=[${fmtSecs(b.primary)}]${dSupp ? ' supporting=[' + fmtSecs(b.supporting) + ']' : ''}`);
}
console.log(`compared ${stat.n} frames: identical ${stat.identical}; only the tail of the authoritative list differs ${stat.onlyAuthTail}; first authoritative document differs ${stat.auth0}; primary sections differ ${stat.primary}; supporting differ ${stat.supporting}; only avoid differs ${stat.avoidOnly}; question type differs ${stat.type}`);
console.log(`golden-evidence checks over ${g.withGolden} questions with a golden document in this graph:`);
for (const [k, label] of [['A', fa], ['B', fb]]) console.log(`  ${label}: first authoritative doc is a golden doc ${g[k].auth0Golden}; any authoritative doc is golden ${g[k].anyAuthGolden}; a golden primary section is in frame primary ${g[k].primaryHit}; in primary or supporting ${g[k].anyHit}; frames listing a synthetic revision row as authoritative ${g[k].cnAuth}`);
console.log(lines.join('\n'));
