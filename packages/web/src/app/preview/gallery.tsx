'use client';

import { useState, useRef, useEffect } from 'react';
import { Landmark, Plus, Ellipsis, PanelLeftClose, Sun, Moon } from 'lucide-react';
import type { UIMessage } from 'ai';
import { EmptyState } from '@/components/EmptyState';
import { ChatInput } from '@/components/ChatInput';
import { MessageList } from '@/components/MessageList';
import { SourcesPanel } from '@/components/SourcesPanel';
import { VerificationBadge } from '@/components/VerificationBadge';
import { DeepResearchView } from '@/components/DeepResearchView';
import type { MessageSource } from '@/lib/message-parts';
import type { DeepResearchController, DeepResearchPlan, DeepResearchReport } from '@/lib/use-deep-research';

const SOURCES: MessageSource[] = [
  {
    key: 's1',
    label: 'MA-2240 § 2.1 — Therapeutic Leave',
    title: 'Nursing Facility Services, Adult Medicaid Manual',
    url: 'https://medicaid.ncdhhs.gov/ma-2240',
    originTool: 'getSection',
    sectionNumber: '2.1',
    snippet:
      'A nursing facility resident may be absent for therapeutic leave for up to 60 days per calendar year without loss of Medicaid payment for bed reservation, provided the absence is part of the plan of care.',
  },
  {
    key: 's2',
    label: '42 CFR § 447.40 — Reservation of beds',
    title: 'Federal Medicaid Regulations',
    url: 'https://ecfr.gov/447-40',
    originTool: 'followReferences',
    sectionNumber: '447.40',
    snippet: null,
  },
  {
    key: 's3',
    label: 'Clinical Coverage Policy 5B',
    title: null,
    url: 'https://medicaid.ncdhhs.gov/ccp-5b',
    originTool: 'searchSections',
    sectionNumber: null,
    snippet: null,
  },
];

const CONVERSATION: UIMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'How many days of therapeutic leave are allowed for nursing facility residents under NC Medicaid?' }],
  } as UIMessage,
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Planning the evidence needed to answer this.' },
      {
        type: 'dynamic-tool',
        toolName: 'searchSections',
        toolCallId: 't1',
        state: 'output-available',
        input: { query: 'therapeutic leave nursing facility days', topK: 6 },
        output: { sections: [{ title: 'Therapeutic Leave', policyNumber: 'MA-2240' }] },
      },
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 't2',
        state: 'output-available',
        input: { sectionId: 'MA-2240-2.1' },
        output: { section: { id: 'sec:ma-2240:2.1', sectionNumber: '2.1', title: 'Therapeutic Leave', policyNumber: 'MA-2240', url: 'https://medicaid.ncdhhs.gov/ma-2240' } },
      },
      {
        type: 'dynamic-tool',
        toolName: 'getSection',
        toolCallId: 't3',
        state: 'output-available',
        input: { sectionId: '42cfr-447.40' },
        output: { section: { id: 'sec:42cfr:447.40', sectionNumber: '447.40', title: 'Reservation of beds', policyNumber: '42 CFR', url: 'https://ecfr.gov/447-40' } },
      },
      {
        type: 'text',
        text: 'Nursing facility residents are allowed up to **60 days** of therapeutic leave per calendar year without loss of Medicaid payment for bed reservation. The absence must be part of the resident’s plan of care, and federal rules govern bed reservation during the leave. [Policy MA-2240 § 2.1 — Therapeutic Leave](https://medicaid.ncdhhs.gov/ma-2240) [42 CFR § 447.40 — Reservation of beds](https://ecfr.gov/447-40)\n\n- Leave is counted **per calendar year**, not per admission.\n- Days beyond the 60-day limit are not reimbursable for bed-hold.',
      },
    ],
  } as UIMessage,
];

const DR_PLAN: DeepResearchPlan = {
  brief:
    'Goal: Compare prior-authorization (PA) requirements across NC Medicaid behavioral-health services and how recent change notices altered them. Scope: clinical coverage policies in the 8-series; current versions plus change notices from the last 24 months; statewide (non-plan-specific).',
  subQuestions: [
    {
      question: 'Which behavioral-health services require prior authorization under the 8-series clinical coverage policies?',
      rationale: 'Establishes the baseline set of PA-required services to compare.',
      channels: ['concept', 'keyword'],
      useWeb: false,
    },
    {
      question: 'What change notices in the last 24 months modified PA requirements for these services?',
      rationale: 'Captures recent amendments that changed the rules.',
      channels: ['amendments'],
      useWeb: false,
    },
    {
      question: 'How do the federal parity requirements (42 CFR Part 438 subpart K) constrain NC PA rules?',
      rationale: 'Federal authority bounds what NC may require.',
      channels: ['federal', 'vector'],
      useWeb: true,
    },
  ],
};

const DR_REPORT: DeepResearchReport = {
  status: 'completed',
  question: 'Compare prior-authorization requirements across NC Medicaid behavioral-health services.',
  brief: DR_PLAN.brief,
  reportMarkdown: `## Executive summary

Prior authorization (PA) requirements vary across NC Medicaid behavioral-health services. Inpatient behavioral health and Residential Treatment require PA before admission [Policy 8B § 5.2.1](https://medicaid.ncdhhs.gov/8b), while most outpatient services are subject to PA only after an initial unmanaged visit threshold [Policy 8C § 3.4](https://medicaid.ncdhhs.gov/8c).

## Services requiring prior authorization

- **Inpatient behavioral health** — PA required prior to admission [Policy 8B § 5.2.1](https://medicaid.ncdhhs.gov/8b).
- **Residential treatment (PRTF)** — PA required, with continued-stay review [Policy 8D-1 § 4.1](https://medicaid.ncdhhs.gov/8d1).

## Recent changes

A 2024 change notice expanded the unmanaged-visit allowance for outpatient therapy [Policy 8C Change Notice 3](https://medicaid.ncdhhs.gov/8c-cn3).

## Federal constraints

Mental-health parity rules limit NQTLs such as PA [42 CFR § 438.910](https://ecfr.gov/438-910).

## Sources

**Authoritative (NC Medicaid corpus)**
- Policy 8B § 5.2.1
- Policy 8C § 3.4
- Policy 8C Change Notice 3

**Supplementary (web)**
- CMS behavioral health parity guidance`,
  subQuestions: DR_PLAN.subQuestions,
  corpusSources: [
    { key: 'sec:8b:5.2.1', label: 'Policy 8B § 5.2.1 — Inpatient PA', link: 'https://medicaid.ncdhhs.gov/8b' },
    { key: 'sec:8c:3.4', label: 'Policy 8C § 3.4 — Outpatient PA thresholds', link: 'https://medicaid.ncdhhs.gov/8c' },
    { key: 'sec:8c:cn3', label: 'Policy 8C Change Notice 3', link: 'https://medicaid.ncdhhs.gov/8c-cn3' },
  ],
  webSources: [{ title: 'CMS behavioral health parity guidance', url: 'https://cms.gov/parity' }],
  workerFailures: [],
  citationProvenance: { checkedCitations: 12, retrievedCitations: 12, unknownCitations: 0 },
  stats: { reflectionRounds: 1, subQuestionCount: 3, corpusSourceCount: 3, webSourceCount: 1 },
};

const noop = () => {};
const asyncNoop = async () => {};

function makeController(over: Partial<DeepResearchController>): DeepResearchController {
  return {
    status: 'idle',
    recoveryCount: 0,
    recoveryProgress: { completedQuestions: 0, checkpoints: 0 },
    sources: [],
    plan: null,
    report: null,
    error: null,
    notice: null,
    question: '',
    elapsedMs: 0,
    isBusy: false,
    start: asyncNoop,
    approve: asyncNoop,
    decline: asyncNoop,
    cancel: asyncNoop,
    reset: noop,
    ...over,
  };
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
  );
}

export function PreviewGallery() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Local theme toggle — flips the `.dark` class so both themes can be
  // inspected without a server round-trip. Starts light (deterministic, so no
  // hydration mismatch) and writes the class on change.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-16">
        <header className="flex items-start justify-between">
          <div>
            <Eyebrow>Component preview · dev only</Eyebrow>
            <h1 className="font-heading text-4xl font-semibold tracking-tight">Document of Record</h1>
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="grid size-9 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>

        <section className="space-y-4">
          <Eyebrow>App shell</Eyebrow>
          <div className="flex h-[460px] overflow-hidden rounded-xl border border-border">
            <div className="flex w-[240px] flex-col bg-sidebar border-r border-sidebar-border">
              <div className="flex items-center justify-between px-4 py-4">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Threads</span>
                <span className="flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"><Plus className="size-3.5" />New</span>
              </div>
              <div className="h-px bg-sidebar-border" />
              <div className="py-2 text-sidebar-foreground">
                {[
                  { t: 'Therapeutic leave limits for nursing facility residents', d: 'Today', active: true },
                  { t: 'Prior approval for private duty nursing', d: 'Yesterday', active: false },
                  { t: 'HCWD earned income limit', d: 'Jun 12', active: false },
                  { t: 'CAP/DA level-of-care criteria', d: 'Jun 9', active: false },
                ].map((x) => (
                  <div key={x.t} className={`group flex items-start justify-between gap-2 border-l-2 px-4 py-2.5 ${x.active ? 'border-l-accent bg-sidebar-accent text-sidebar-foreground' : 'border-l-transparent text-muted-foreground'}`}>
                    <span className="text-[13px] leading-snug line-clamp-2">{x.t}</span>
                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{x.d}</span>
                      <Ellipsis className="size-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 bg-sidebar-accent/40 px-4 py-3">
                <span className="font-mono text-[11px] text-muted-foreground truncate">demo@example.com</span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Sign out</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col bg-background">
              <header className="relative border-b border-border bg-card px-6 py-4 after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/70 after:to-transparent">
                <div className="flex items-center gap-3">
                  <PanelLeftClose className="size-4 text-muted-foreground" />
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/12 text-accent ring-1 ring-accent/25"><Landmark className="size-4" /></span>
                  <div className="min-w-0">
                    <h2 className="font-heading text-xl font-semibold leading-none tracking-tight">NC Medicaid Navigator</h2>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Policy Research · Queen City Cortex</span>
                  </div>
                </div>
              </header>
              <div className="flex-1 px-6 py-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Conversation pane</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Deep Research · plan approval</Eyebrow>
          <div className="rounded-xl border border-border p-6">
            <DeepResearchView
              controller={makeController({
                status: 'awaiting-approval',
                question: DR_REPORT.question,
                plan: DR_PLAN,
              })}
            />
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Deep Research · report</Eyebrow>
          <div className="rounded-xl border border-border p-6">
            <DeepResearchView
              controller={makeController({ status: 'done', question: DR_REPORT.question, report: DR_REPORT })}
            />
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Empty state</Eyebrow>
          <div className="rounded-xl border border-border bg-card">
            <EmptyState onSelectExample={(q) => setInput(q)} />
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Conversation</Eyebrow>
          <div className="rounded-xl border border-border bg-background px-6 py-6">
            <MessageList
              messages={CONVERSATION}
              isStreaming={false}
              status="ready"
              onRerun={() => {}}
              messagesEndRef={{ current: null }}
              feedbackMap={{}}
              onRate={() => {}}
              onClearRating={() => {}}
              onComment={() => {}}
            />
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Verification + sources</Eyebrow>
          <div className="rounded-xl border border-border bg-background px-6 py-6">
            <VerificationBadge outcome={{ status: 'passed', passCount: 1 }} />
            <SourcesPanel sources={SOURCES} citedCount={2} messageId="demo" open />
          </div>
        </section>

        <section className="space-y-4">
          <Eyebrow>Composer</Eyebrow>
          <div className="rounded-xl border border-border overflow-hidden">
            <ChatInput input={input} setInput={setInput} isLoading={false} onSend={() => {}} onStop={() => {}} inputRef={inputRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
