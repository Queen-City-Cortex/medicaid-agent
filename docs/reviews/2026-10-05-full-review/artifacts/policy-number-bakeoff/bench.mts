// Benchmark replay: three extraction rules (plus variants) over the 155
// benchmark questions, with lookups simulated on the dumped local graph.
// Imports the real HEAD functions from the repository source (read-only).
import fs from 'node:fs';
import {
  extractExplicitPolicyNumbers as extractE0,
  extractAliasedPolicyNumbers,
  isChangeNoticeQuery,
  isCoverageQuestion,
  isEpsdtOverviewQuery,
  isFederalAuthorityQuery,
  isPriorAuthorizationQuery,
  detectAnswerQuestionType,
  queryMentionsPolicyNumber,
} from '/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/policy-corpus/src/internal/query-intent.ts';
import { analyzeQuery } from '/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/policy-corpus/src/query/analysis.ts';
import { collectPolicyNumbersForQuery } from '/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/policy-corpus/src/internal/retrieval-planning.ts';
import { normalizeSearchText } from '/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/policy-corpus/src/internal/base.ts';
// @ts-ignore
import { extractE1, extractE2, extractE2b, extractE3, policyNumberKey } from './extract-rules.mjs';
// @ts-ignore
import { simulate, candidatePolicyNumbersCurrent } from './lookup-rules.mjs';

const DATA = '/Users/jkh/src/tries/2026-03-26-medicaid-agent/packages/pipeline/data';
const HERE = new URL('.', import.meta.url).pathname;
const golden = JSON.parse(fs.readFileSync(`${DATA}/golden/dataset.json`, 'utf8'));
const heldout = JSON.parse(fs.readFileSync(`${DATA}/golden/heldout-paraphrase.json`, 'utf8'));
const fresh = JSON.parse(fs.readFileSync(`${DATA}/jev/fresh-paraphrases.json`, 'utf8'));
const local = JSON.parse(fs.readFileSync(`${DATA}/eval-results/milestones/2026-09-22-verified-release/local-corpus-dataset.json`, 'utf8'));
const docs = JSON.parse(fs.readFileSync(`${HERE}/graph-docs.json`, 'utf8'));
const docById = new Map<string, any>(docs.map((d: any) => [d.id, d]));

// Golden evidence policy numbers per golden question (legacy ids -> graph policy_number).
const goldenPolicies = new Map<string, { primary: string[]; all: string[]; docIds: string[] }>();
for (const q of local) {
  const prim = new Set<string>();
  const all = new Set<string>();
  const ids = new Set<string>();
  for (const k of ['primary_sections', 'supporting_sections']) {
    for (const s of q.evidence[k] ?? []) {
      const d = docById.get(s.document_id);
      if (!d) continue;
      ids.add(d.id);
      if (d.pn) {
        all.add(d.pn);
        if (k === 'primary_sections') prim.add(d.pn);
      }
    }
  }
  goldenPolicies.set(q.id, { primary: [...prim], all: [...all], docIds: [...ids] });
}

interface Q { id: string; set: string; parent: string; question: string }
const questions: Q[] = [
  ...golden.map((q: any) => ({ id: q.id, set: 'golden', parent: q.id, question: q.question })),
  ...heldout.map((q: any) => ({ id: q.id, set: 'heldout', parent: q.paraphrase_of, question: q.question })),
  ...fresh.map((q: any) => ({ id: q.id, set: 'fresh', parent: q.paraphrase_of, question: q.question })),
];

const RULES: Record<string, (q: string) => string[]> = { E0: extractE0, E1: extractE1, E2: extractE2, E2b: extractE2b, E3: extractE3 };
const keys = (xs: string[]) => new Set(xs.map(policyNumberKey));

function typeUnder(rule: (q: string) => string[], queryLower: string): string {
  if (isEpsdtOverviewQuery(queryLower)) return 'federal_authority';
  if (isChangeNoticeQuery(queryLower)) return 'amendment';
  if (isFederalAuthorityQuery(queryLower)) return 'federal_authority';
  if (isPriorAuthorizationQuery(queryLower)) return 'prior_authorization';
  if (rule(queryLower).length >= 2 || queryLower.includes('difference between') || queryLower.includes('vs ')) return 'policy_variant';
  if (isCoverageQuestion(queryLower)) return 'coverage';
  return 'general';
}

const LOOKUPS = ['L0_current', 'L1_exactFirst_exactOnly', 'L2_hyphenFamily_matchType_noCN', 'L3_exactKeyOnly_noCN'];
function lookupDocs(lookup: string, numbers: string[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const n of numbers) {
    for (const r of simulate(lookup, docs, candidatePolicyNumbersCurrent(n))) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

const rows: any[] = [];
let sanity = 0;
for (const q of questions) {
  const queryLower = normalizeSearchText(q.question);
  const federal = isFederalAuthorityQuery(queryLower);
  const alias = federal ? [] : extractAliasedPolicyNumbers(queryLower);
  const analysis = analyzeQuery(q.question);
  // sanity: our composition must reproduce HEAD's own outputs under E0
  const e0 = extractE0(q.question);
  const composed = Array.from(new Set([...e0, ...alias]));
  if (JSON.stringify(composed) !== JSON.stringify(analysis.explicitPolicyNumbers)) sanity += 1;
  if (JSON.stringify(composed) !== JSON.stringify(collectPolicyNumbersForQuery(q.question))) sanity += 1;
  if (typeUnder(extractE0, queryLower) !== detectAnswerQuestionType(queryLower)) sanity += 1;
  const gp = goldenPolicies.get(q.parent) ?? { primary: [], all: [], docIds: [] };
  const row: any = { id: q.id, set: q.set, parent: q.parent, question: q.question, alias, federal, golden: gp.all, goldenPrimary: gp.primary, goldenDocIds: gp.docIds, rules: {} };
  // rerank token mentions (HEAD): stored numbers that queryMentionsPolicyNumber says are "mentioned"
  for (const [name, rule] of Object.entries(RULES)) {
    const typed = rule(q.question);
    const numbers = Array.from(new Set([...typed, ...alias]));
    const type = typeUnder(rule, queryLower);
    const perLookup: any = {};
    for (const L of LOOKUPS) {
      const found = lookupDocs(L, numbers);
      const nonCn = found.filter((r) => r.type !== 'change_notice');
      perLookup[L] = {
        rows: found.length,
        cnRows: found.length - nonCn.length,
        policies: Array.from(new Set(nonCn.map((r) => r.pn))),
        goldenDocFound: gp.docIds.filter((id) => found.some((r) => r.id === id)),
        firstPolicy: found[0]?.pn ?? null,
      };
    }
    row.rules[name] = { typed, numbers, type, perLookup };
  }
  rows.push(row);
}
console.log('questions', questions.length, 'sanity mismatches vs HEAD', sanity);
fs.writeFileSync(`${HERE}/bench-rows.json`, JSON.stringify(rows, null, 1));

// ---- report -----------------------------------------------------------------
const stored = new Set(docs.filter((d: any) => d.pn != null && d.type !== 'change_notice').map((d: any) => policyNumberKey(d.pn)));
for (const name of Object.keys(RULES)) {
  let withTyped = 0, changed = 0, lostGolden = 0, lostGoldenTyped = 0, gained = 0, typeFlips = 0, nonStored = 0;
  const notes: string[] = [];
  for (const r of rows) {
    const base = r.rules.E0;
    const cur = r.rules[name];
    if (cur.typed.length > 0) withTyped += 1;
    const a = [...keys(base.typed)].sort().join(',');
    const b = [...keys(cur.typed)].sort().join(',');
    const goldenKeys = keys(r.golden);
    const lostFromAll = [...keys(base.numbers)].filter((k) => goldenKeys.has(k) && !keys(cur.numbers).has(k));
    const lostFromTyped = [...keys(base.typed)].filter((k) => goldenKeys.has(k) && !keys(cur.typed).has(k));
    const gainedGolden = [...keys(cur.numbers)].filter((k) => goldenKeys.has(k) && !keys(base.numbers).has(k));
    const bogus = cur.typed.filter((t: string) => !stored.has(policyNumberKey(t)));
    if (bogus.length) nonStored += 1;
    if (lostFromAll.length) lostGolden += 1;
    if (lostFromTyped.length) lostGoldenTyped += 1;
    if (gainedGolden.length) gained += 1;
    if (cur.type !== base.type) typeFlips += 1;
    if (a !== b || cur.type !== base.type) {
      changed += 1;
      notes.push(`  ${r.id}(${r.parent}) E0=[${base.typed}] ${name}=[${cur.typed}] alias=[${r.alias}] golden=[${r.golden}] type ${base.type}->${cur.type}${lostFromAll.length ? ' LOST:' + lostFromAll : ''}${lostFromTyped.length && !lostFromAll.length ? ' (typed lost, alias keeps:' + lostFromTyped + ')' : ''}${gainedGolden.length ? ' GAINED:' + gainedGolden : ''}\n      "${r.question.slice(0, 150)}"`);
    }
  }
  console.log(`\n=== ${name}: questions with a typed number ${withTyped}/155; changed vs E0 ${changed}; golden policy lost entirely ${lostGolden}; lost from typed set only ${lostGoldenTyped - lostGolden}; golden policy gained ${gained}; question-type flips ${typeFlips}; questions with a typed token that is not a stored number ${nonStored}`);
  if (name !== 'E0') console.log(notes.join('\n'));
}

// E0 detail: every question with a typed or aliased number
console.log('\n=== E0 (HEAD) typed / alias numbers per question ===');
for (const r of rows) {
  const b = r.rules.E0;
  if (b.numbers.length === 0) continue;
  console.log(`  ${r.id}(${r.parent}) typed=[${b.typed}] alias=[${r.alias}] golden=[${r.golden}] type=${b.type} | L0 policies=[${b.perLookup.L0_current.policies}] rows=${b.perLookup.L0_current.rows} cn=${b.perLookup.L0_current.cnRows}`);
}
