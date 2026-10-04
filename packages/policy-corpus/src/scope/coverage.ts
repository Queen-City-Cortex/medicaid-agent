import policy from './policy.json';

export { policy as ANSWER_SCOPE_POLICY };

export interface CoverageScope {
  policyId: string;
  limitationIds: string[];
  notice: string | null;
  requestedDate: string | null;
  requiredSourceUrls: string[];
  requirements: string[];
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function requestedDate(query: string, today: Date): string | null {
  const years = [...new Set(query.match(/\b20\d{2}\b/g) ?? [])];
  if (years.length > 1) return null; // Ask separately rather than guess a comparison's date.
  const iso = query.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
  }
  const month = query.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:(\d{1,2})(?:st|nd|rd|th)?[,]?\s+)?(20\d{2})\b/);
  if (month) return requestedDate(`${month[3]}-${String(months.indexOf(month[1]) + 1).padStart(2, '0')}-${(month[2] ?? '01').padStart(2, '0')}`, today);
  // A year-only table request means that year's published April table, not January applicability.
  if (years.length === 1) return `${years[0]}-04-01`;
  if (/\b(historical|previous|before|after|last year|next year|back then)\b/.test(query)) return null;
  return today.toISOString().slice(0, 10);
}

/** Product boundaries belong to the corpus and apply even if the model chooses another tool. */
export function resolveCoverageScope(question: string, today = new Date()): CoverageScope | null {
  const q = question.normalize('NFKC').toLowerCase();
  const result: CoverageScope = { policyId: policy.id, limitationIds: [], notice: null, requestedDate: null, requiredSourceUrls: [], requirements: [] };
  const matched = policy.limitations.filter(item => q.includes(item.source_url.toLowerCase()));
  const languageAccess = /language[ -]?access|language.{0,12}rights|(?:interpreter|interpretation|translation).{0,30}(right|service|access)|(?:right|access|provide|request|obtain|arrange|need).{0,30}interpreter/.test(q);
  const originalRequest = /download|quote|\battach\b|exact.{0,20}(wording|text|content)|interpret.{0,40}(wording|text|notice)/.test(q)
    || /(?:^|[.,;]\s*|please\s+|(?:can|could|will|would)\s+you\s+)(?:provide|supply|show|give|generate|reproduce|translate)\s+(?:(?:me|us|the|an?|official|original|gujarati|dhb[ -]*5097|a copy of|copy of)\s+)*(?:form|notice|attachment|pdf|it|(?:dhb[ -]*)?5097|translation\b(?!\s+(?:(?:and|or)\s+(?:interpretation|translation)\s+)?services?\b))\b/.test(q);
  const procedureQuestion = /what (?:should|must|can|do) (?:i|we) do|(?:how|when).{0,40}(?:respond|reply|submit|complete|appeal)|\b(?:procedure|process|next steps)\b/.test(q);
  const contentIntent = /\b(?:says?|said|wording|translat\w*|contain\w*|differ\w*|read (?:me|us|out)|(?:send|show|give|get|email) (?:me|us)|need the|(?:copy|version) of)\b/.test(q);
  const noticeDeadline = /(?:(?:what|which)(?:'s| is| was| are)?|when(?:'s| is| was))\s+(?:(?:the|my|its|that)\s+)?(?:deadline|due date)|(?:tell|give) (?:me|us).{0,20}(?:deadline|due date)|(?:deadline|due date).{0,40}\b(?:it|notice|5097|form)\s+(?:lists?|gives?|states?|says?|shows?|sets?)|(?:notice|5097).{0,40}(?:give|state|specif|set|list).{0,20}(?:deadline|due date)|(?:deadline|due date).{0,40}when is it/.test(q);
  const gujarati = /gujarati|ગુજરાતી/.test(q) && /5097|request.{0,20}information/.test(q) && ((!languageAccess && !(procedureQuestion && !contentIntent && !noticeDeadline)) || originalRequest);
  const covid = /covid|sars.cov.2/.test(q) && /otc|over.the.counter|home.{0,12}test|at.home/.test(q);
  const paymentQuestion = /cover|pay|reimburs|billing|benefit|free|cost/.test(q);
  const pharmacist = /pharmacist/.test(q);
  const authorityTerms = /\boriginal\s+(?:(?:standing|statewide|pharmacist|covid(?:-19)?)\s+)*orders?\b|standing.order|statewide.order|dispens|prescrib|prescription|authori|without a (?:doctor|prescription)/.test(q)
    || (pharmacist && /\ballow|\bpermit|\border(?:s|ed|ing)?\b|conditions?|withdr[ae]w|rescind/.test(q));
  const authority = /covid|sars.cov.2/.test(q) && (covid || /standing.order/.test(q)) && (authorityTerms || (pharmacist && !paymentQuestion));
  const originalArtifact = /original\w*.{0,60}(?:attachment|file|document|source|pdf|upload|version|copy|copies|post(?:ed|ing))|(?:attachment|file|document|pdf)s?.{0,30}original/.test(q)
    || /originals\b/.test(q)
    || (/original/.test(q) && /supersed|withdr[ae]w|duplicat|compar|differ|repost|replac/.test(q));
  const availableMagiTable = policy.magi_tables.some(item => q.includes(item.source_url.split('/').at(-1)!.toLowerCase()));
  const missingOriginalIntent = /supersed|withdr[ae]w|duplicat|compar|differ|repost|replac|\bversus\b|\bvs\b|\bsame\b|identical|\bmatch|originals\b|original\w*.{0,60}(?:attachments?|uploads?|sources?|documents?|pdfs\b)/.test(q);
  const archives = /2025/.test(q) && /magi/.test(q) && (/archiv|wrapper/.test(q) || (originalArtifact && !(availableMagiTable && !missingOriginalIntent)));
  if (matched.length || gujarati || authority || archives) {
    result.limitationIds = matched.length ? matched.map(item => item.id) : gujarati ? ['gujarati-dhb-5097'] : authority ? ['covid-standing-order'] : ['magi-2025-archive', 'magi-2025-archive-2'];
    result.notice = gujarati ? 'The official Gujarati DHB-5097 attachment is unavailable in this corpus. I cannot supply or quote it, or infer what a completed Gujarati notice says. General request-for-information procedure can be researched separately using the available manuals and forms.'
      : authority ? 'The original pharmacist standing order for OTC COVID-19 home tests is unavailable in this corpus. I cannot establish its exact dispensing authority, conditions, or withdrawal history. Medicaid payment coverage is a separate question.'
        : 'These original source attachments are unavailable in this corpus. I cannot reconstruct or compare their contents, or confirm that they were duplicates, withdrawn, or superseded. Questions supported by available dated documents can be researched separately.';
    return result;
  }
  const magi = /\bmagi\b|ma[\s-]*3321|medicaid expansion/.test(q) && /income|limit|threshold|table|chart|amount/.test(q) && !/non[\s-]*magi/.test(q);
  if (magi) {
    result.requestedDate = requestedDate(q, today);
    const table = policy.magi_tables.find(item => result.requestedDate && item.effective_from <= result.requestedDate && item.supported_until >= result.requestedDate);
    if (!table) {
      result.notice = 'I cannot establish the applicable MAGI income table for that period within the supported dated coverage. Please specify a supported date or research that period separately; the available April 2025 and April 2026 tables do not establish earlier or later limits.';
    } else {
      result.requiredSourceUrls = [table.source_url];
      result.requirements = [`Use the table effective ${table.effective_from} for the requested date ${result.requestedDate}. Do not substitute another year's figures. Identify the population and household size; distinguish the listed percentage from the five-percent disregard. Cite the effective date and the figures actually retrieved.`];
    }
    return result;
  }
  if (/\b(?:dhb[\s-]*)?5097\b/.test(q)) {
    result.requiredSourceUrls = [policy.required_coverage.find(item => item.source_url.includes('DHB-5097-_4.1.26'))!.source_url];
    result.requirements = ['Explain the form using the available English DHB-5097. Do not infer filled-in deadlines or facts from a blank template; use the applicable manual for procedure. Do not present another language variant or a generated translation as the missing official Gujarati form.'];
    return result;
  }
  if (covid && paymentQuestion) {
    result.requestedDate = requestedDate(q, today);
    if (!result.requestedDate || result.requestedDate !== '2024-10-01') {
      result.notice = 'The September 2024 bulletin establishes the payment change effective October 1, 2024. It does not alone establish payment coverage on another date; that period needs additional dated evidence.';
    } else {
      result.requiredSourceUrls = [policy.required_bulletin.source_url];
      result.requirements = ['Use the full September 25, 2024 coverage-end bulletin. Older ongoing-coverage guidance cannot establish current payment coverage. Check later amendments before asserting current applicability. Payment coverage ending does not establish withdrawal of pharmacist dispensing authority.'];
    }
    return result;
  }
  return null;
}

export interface CoverageEvidence { text: string; link?: string | null; toolName: string; evidenceRole?: string }

/** A routing hint or web excerpt cannot satisfy an authoritative evidence obligation. */
export function coverageEvidenceIssue(scope: CoverageScope | null, sources: CoverageEvidence[]): string | null {
  if (!scope) return null;
  if (scope.notice) return scope.notice;
  const normalize = (value: string) => {
    const url = value.match(/https:\/\/[^\s)]+/)?.[0];
    if (!url) return null;
    try { const parsed = new URL(url); parsed.hash = ''; return parsed.href; } catch { return null; }
  };
  for (const url of scope.requiredSourceUrls) {
    const sections = sources.filter(item => ['getSection', 'resolveAnswerFrame:section'].includes(item.toolName) && !item.evidenceRole && item.text.trim() && normalize(item.link ?? '') === normalize(url));
    const body = sections.map(section => section.text).join('\n');
    if (!sections.length) return `The required dated source was not retrieved: ${url}`;
    if (url === policy.required_bulletin.source_url && !/ends?\s+Sept\.?\s*30,?\s*2024/i.test(body)) return 'The coverage-end bulletin body was not retrieved.';
    const table = policy.magi_tables.find(item => item.source_url === url);
    if (table && !new RegExp(`effective[^\n]{0,20}april\\s+1,?\\s+${table.effective_from.slice(0, 4)}`, 'i').test(body)) return 'The table effective date was not retrieved.';
  }
  return null;
}
