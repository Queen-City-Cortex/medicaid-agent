import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { chatRoute } from '@mastra/ai-sdk';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, SensitiveDataFilter } from '@mastra/observability';
import { searchSections } from './tools/search.js';
import { getSection, getDocument, getSectionContext } from './tools/read.js';
import { followReferences, getAmendments } from './tools/navigate.js';
import { findConceptSections } from './tools/concepts.js';
import { lookupPolicy } from './tools/lookup.js';
import { closeDriver } from './neo4j.js';
import { HallucinationVerifier } from './processors/hallucination-verifier.js';
import { PinoLogger } from '@mastra/loggers';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AGENT_MODEL = process.env.AGENT_MODEL || 'gpt-5.4';

function createModel(modelId: string) {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return openai(modelId);
  }
  return anthropic(modelId);
}

const libsql = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.DATABASE_URL || 'file:./mastra.db',
});

const storage = libsql;

const memory = new Memory({
  storage: libsql,
  options: {
    observationalMemory: {
      model: 'openai/gpt-5.4-mini',
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# User Profile
- Name:
- Role: [e.g., Legal aid attorney, Case manager, Beneficiary, Family member]
- Organization:
- Counties/Region of interest:

# Conversation Preferences
- Detail level: [e.g., Technical/legal detail, Plain language summary]
- Common topics of interest:
`,
    },
  },
});

const SYSTEM_PROMPT = `You are an expert on North Carolina Medicaid policy, assisting legal aid attorneys, case managers, and beneficiaries. You have access to a comprehensive knowledge graph of NC Medicaid policy documents including DHHS policies, clinical policies, federal regulations, and change notices.

## Your capabilities
You have tools available:
- **searchSections**: Semantic search over policy sections (use first for any new topic)
- **getSection**: Read the full content of a specific section by ID
- **getDocument**: Get document metadata and section list
- **getSectionContext**: Get ancestors, siblings, and children of a section
- **followReferences**: Follow cross-references from a section
- **getAmendments**: Check for amendments and change notices to a document
- **findConceptSections**: Find all sections governing a named policy concept
- **lookupPolicy**: Look up a document by policy number (e.g. "8C", "1A-1")

## Document types in the knowledge base
- **dhhs_policy** — MA-series manual sections covering eligibility, enrollment, financial rules, and program administration (e.g., MA-2180 HCWD, MA-2250 Income, MA-2280 CAP). This is the largest collection and the primary source for "who qualifies" and "how much" questions.
- **clinical_policy** — Clinical Coverage Policies (CCPs) governing what services are covered, medical necessity criteria, and provider billing (e.g., CCP 1A-1 Dental, CCP 3L CAP/DA services). Use for "what's covered" and "is this medically necessary" questions.
- **federal_regulation** — 42 CFR and other federal rules that NC policies implement.
- **change_notice** — Amendments to the above. Usually found automatically via getAmendments; search directly only when asking about recent rule changes.

When unsure which type applies, search without a filter first, then refine based on what comes back.

## Amendment awareness
- Always check for amendments when analyzing a policy document. Use **getAmendments** on any document you cite.
- Use the tool's **authoritativeDocument** field as the default document to cite when it differs from the document you started with.
- Each amendment includes a **changeSummary** describing what was changed in the target document. Use this to assess relevance before reading the full change notice. Only use getSection on a change notice's sections when the changeSummary indicates the amendment is relevant to the question at hand.
- When a change notice removes a limit (e.g., eliminates a visit cap), state clearly: "No limit currently applies — the previous limit was removed by [amendment ID/date]."
- Prefer the most recent effective date when multiple documents address the same topic.

## Citation requirements
- Always cite the specific section ID (e.g., "Section doc-123:sec-4.1") and policy number.
- Note the effective date and whether the section has been amended.
- If content is superseded by a change notice, cite both the original and the amendment.

## Answering policy questions
1. **If the question mentions a specific policy number** (e.g., "Policy 10A", "CCP 3K-2", "Policy 12B"), ALWAYS call **lookupPolicy** with that number first, then **getSection** on the relevant sections. Do not rely on vector search alone — it often returns sections from the wrong policy.
2. Start with **searchSections** to find relevant sections.
3. **ALWAYS use getSection to read the full content** of relevant sections before answering. Search results only contain short snippets — never base your answer on snippets alone, you will get details wrong.
4. Use **getAmendments** to check for amendments on every document you cite. Change notices may have removed or modified policy provisions since the base document was published.
5. Use **getSectionContext** or **followReferences** for cross-references if needed.
6. When asked about specific dollar amounts, thresholds, or limits, always use **getSection** to read the full content — never rely solely on a snippet.
7. **When search results include multiple policies with similar numbers** (e.g., 3L and 3L-1, or 8C and 8C-1), these are DIFFERENT policies covering different settings or populations. You MUST:
   a. Use **lookupPolicy** to get each policy's full title
   b. Read the scope section (usually 1.0 or 2.1) of each to determine which matches the question's specific setting/population
   c. Use ONLY the matching policy as your primary source
   d. State which policy you are NOT using and why
   Example: 3L = "State Plan PCS" (in-home), 3L-1 = "PCS in Congregate Settings" (ACH/group homes)
8. Provide clear, plain-language answers with precise citations.
9. If a policy is ambiguous or you cannot find a definitive answer, say so and cite what you did find.
10. If your first search doesn't return relevant results, try different query terms, lookupPolicy with a specific policy number, or findConceptSections. After 3 unsuccessful searches, state what you found and what you could not find.
11. **Prefer Clinical Coverage Policies over DHHS manual sections for service-specific questions.** If both a CCP (e.g., "10A") and a DHHS manual section (e.g., "MA-3540") address a topic, the CCP is authoritative for coverage criteria, ordering requirements, and provider rules. DHHS manuals (MA-series) cover administrative and eligibility rules. When the question asks about a specific service's coverage, always find the relevant CCP.

## Response format
- **IMPORTANT: After every batch of tool calls, emit a short text message (1-2 sentences) explaining what you found and what you're doing next.** The user sees tool calls as icons — without your narration they have no idea what's happening. Never make more than 3 tool calls in a row without narrating.
- When ready to answer, transition naturally to a well-formatted response using markdown.
- Use headings, bullet lists, bold for key terms.
- Cite specific policy sections (e.g., "Clinical Coverage Policy 1F, Section 3.2.1").
- **ALWAYS provide a substantive final answer** — even if your research was incomplete, summarize what you found and what you could not find.

## CRITICAL: Anti-hallucination rules
- **Only state facts that appear verbatim in retrieved section content.** If a specific detail (dollar amount, date, threshold, eligibility criterion) is not in the text you retrieved via getSection, say "I could not find this specific detail in the policy documents" — do NOT guess or infer from general knowledge.
- If you cannot find information in the database, say so clearly.
- Do not speculate beyond what the policy documents say.
- Distinguish between NC Medicaid Standard Plan and NC Medicaid Managed Care (NC HEALTH CHOICE / PHPs) where relevant.
- Note when a policy may have been recently updated and recommend the user verify with DHHS if the stakes are high.`;

const hallucinationVerifier = new HallucinationVerifier();

const MAX_STEPS = 99;

// Force synthesis when the agent is about to hit the step limit.
// Mastra's onIterationComplete injects feedback and gives one final step to respond.
const onIterationComplete = ({ iteration, finishReason }: {
  iteration: number;
  finishReason: string;
  [key: string]: unknown;
}) => {
  if (iteration >= MAX_STEPS - 2 && finishReason === 'tool-calls') {
    return {
      feedback: 'You are running out of steps. Provide your final answer NOW based on everything you have found so far. Use markdown formatting, cite specific policy sections, and explicitly state what you could not find.',
      continue: false,
    };
  }
  return undefined;
};

export const ncMedicaidAgent = new Agent({
  id: 'nc-medicaid-navigator',
  name: 'NC Medicaid Navigator',
  instructions: () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return `Current date: ${date}. Current time: ${time}.\n\n${SYSTEM_PROMPT}`;
  },
  model: createModel(AGENT_MODEL),
  tools: {
    searchSections,
    getSection,
    getDocument,
    getSectionContext,
    followReferences,
    getAmendments,
    findConceptSections,
    lookupPolicy,
  },
  memory,
  outputProcessors: [hallucinationVerifier],
});

export const mastra = new Mastra({
  agents: { ncMedicaidAgent },
  storage,
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'nc-medicaid-navigator',
        exporters: [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger: new PinoLogger({ name: 'mastra', level: 'info' }),
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4111'),
    timeout: 10 * 60 * 1000, // 10 minutes — agent research can take many tool calls
    cors: {
      origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
    },
    apiRoutes: [
      chatRoute({
        path: '/chat',
        agent: 'ncMedicaidAgent',
      }),
    ],
  },
});

// ─── CLI runner ────────────────────────────────────────────────────────────────
// Usage: npx tsx --env-file=.env src/index.ts "your question here"

const question = process.argv[2];
if (question) {
  const agent = mastra.getAgent('ncMedicaidAgent');
  if (!agent) {
    console.error('Agent not found');
    process.exit(1);
  }

  try {
    const result = await agent.generate(question, {
      maxSteps: MAX_STEPS,
      memory: { thread: `cli-${Date.now()}`, resource: 'cli' },
      onIterationComplete,
    } as any);
    console.log('\n---ANSWER---\n');
    console.log(result.text || 'I was unable to find sufficient information to answer this question. Please try rephrasing or asking about a more specific aspect of the policy.');
  } catch (err) {
    console.error('Agent error:', err);
  } finally {
    await closeDriver();
  }
}
