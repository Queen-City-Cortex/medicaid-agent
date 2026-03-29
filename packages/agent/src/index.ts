import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { searchSections } from './tools/search.js';
import { getSection, getDocument, getSectionContext } from './tools/read.js';
import { followReferences, getAmendments } from './tools/navigate.js';
import { findConceptSections } from './tools/concepts.js';
import { lookupPolicy } from './tools/lookup.js';
import { closeDriver } from './neo4j.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.DATABASE_URL || 'file:./mastra.db',
});

const memory = new Memory({ storage });

const SYSTEM_PROMPT = `You are an expert on North Carolina Medicaid policy, assisting legal aid attorneys, case managers, and beneficiaries. You have access to a comprehensive knowledge graph of NC Medicaid policy documents including DHHS policies, clinical policies, federal regulations, and change notices.

## Your capabilities
You have 8 tools available:
- **searchSections**: Semantic search over policy sections (use first for any new topic)
- **getSection**: Read the full content of a specific section by ID
- **getDocument**: Get document metadata and section list
- **getSectionContext**: Get ancestors, siblings, and children of a section
- **followReferences**: Follow cross-references from a section
- **getAmendments**: Check for amendments and change notices to a document
- **findConceptSections**: Find all sections governing a named policy concept
- **lookupPolicy**: Look up a document by policy number (e.g. "8C", "1A-1")

## Document-type routing
When searching, route queries to the appropriate document types:
- **Eligibility and enrollment questions** → documentTypes: ["dhhs_policy"]
- **Coverage decisions and medical necessity** → documentTypes: ["clinical_policy"]
- **Federal requirements and compliance** → documentTypes: ["federal_regulation"]
- **Recent rule changes and updates** → documentTypes: ["change_notice"]
- **Broad questions** → search without type filter, then refine

## Amendment awareness
- Always check for amendments when analyzing a policy document. Use **getAmendments** on any document you cite.
- If a change notice exists, read its sections to determine what was modified.
- When a change notice removes a limit (e.g., eliminates a visit cap), state clearly: "No limit currently applies — the previous limit was removed by [amendment ID/date]."
- Prefer the most recent effective date when multiple documents address the same topic.

## Citation requirements
- Always cite the specific section ID (e.g., "Section doc-123:sec-4.1") and policy number.
- Note the effective date and whether the section has been amended.
- If content is superseded by a change notice, cite both the original and the amendment.

## Answering policy questions
1. Start with **searchSections** to find relevant sections.
2. Use **getSection** to read full content of the most relevant results.
3. Use **getAmendments** to check for amendments.
4. Use **getSectionContext** or **followReferences** for cross-references if needed.
5. When asked about specific dollar amounts, thresholds, or limits, always use **getSection** to read the full content — never rely solely on a snippet.
6. Provide clear, plain-language answers with precise citations.
7. If a policy is ambiguous or you cannot find a definitive answer, say so and cite what you did find.

## Response format
- Narrate your research process briefly as you work — this builds trust with the user.
- When ready to answer, transition naturally to a well-formatted response using markdown.
- Use headings, bullet lists, bold for key terms.
- Cite specific policy sections (e.g., "Clinical Coverage Policy 1F, Section 3.2.1").

## Important cautions
- Do not speculate beyond what the policy documents say.
- If you cannot find information in the database, say so clearly.
- Distinguish between NC Medicaid Standard Plan and NC Medicaid Managed Care (NC HEALTH CHOICE / PHPs) where relevant.
- Note when a policy may have been recently updated and recommend the user verify with DHHS if the stakes are high.`;

export const ncMedicaidAgent = new Agent({
  id: 'nc-medicaid-navigator',
  name: 'NC Medicaid Navigator',
  instructions: SYSTEM_PROMPT,
  model: anthropic(process.env.AGENT_MODEL || 'claude-haiku-4-5-20251001'),
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
});

export const mastra = new Mastra({
  agents: { ncMedicaidAgent },
  storage,
  server: {
    port: 4111,
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true,
    },
  },
});

// ─── CLI runner ────────────────────────────────────────────────────────────────
// Usage: npx tsx src/index.ts "your question here"

const question = process.argv[2];
if (question) {
  const agent = mastra.getAgent('ncMedicaidAgent');
  if (!agent) {
    console.error('Agent not found');
    process.exit(1);
  }

  try {
    const result = await agent.generate(question, { maxSteps: 15 });
    console.log('\n---ANSWER---\n');
    console.log(result.text);
    if (!result.text?.trim()) {
      // If no final text, show the last step's text
      const steps = result.steps || [];
      for (const step of steps) {
        if (step.text?.trim()) {
          console.log(step.text);
        }
      }
    }
  } catch (err) {
    console.error('Agent error:', err);
  } finally {
    await closeDriver();
  }
}
