---
title: Mastra NC Medicaid Navigator Configuration
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T02:03:49.087Z'
updatedAt: '2026-04-02T02:03:49.087Z'
---
## Raw Concept
**Task:**
Document Mastra working memory and instruction-generation changes for the NC Medicaid Navigator

**Changes:**
- Added resource-scoped working memory with a Medicaid user profile and conversational preference template
- Converted the static SYSTEM_PROMPT to an instructions function that prepends current date/time to every prompt invocation
- Removed the hardcoded tool count from the system prompt to reflect Mastra’s runtime tool injection

**Files:**
- packages/agent/src/index.ts

**Flow:**
Memory configuration -> Mastra instructions function -> NC Medicaid Navigator agent initialization

**Timestamp:** 2026-04-02

**Author:** Agent engineering team

## Narrative
### Structure
Observable and working memory are configured via Memory({ storage, options: { observationalMemory, workingMemory } }) where workingMemory.template defines Medicaid-specific profile fields and Mastra manages scope as resource-level.

### Dependencies
The dynamic instructions function depends on the SYSTEM_PROMPT constant and runs each time Mastra initializes ncMedicaidAgent, so it can capture the local date/time before appending policy guidance and tool instructions.

### Highlights
This setup keeps user context structured, keeps instructions current, and ensures tool counts stay accurate because Mastra injects additional tools at runtime rather than relying on a fixed number.

## Facts
- **working_memory_template**: Working memory is enabled with resource scope and a Medicaid-focused profile template covering user role, organization, region, detail level, and common topics. [project]
- **dynamic_instructions**: Agent instructions are rebuilt on each call to include the current date and time before the static policy guidance. [project]
- **system_prompt_tools**: The system prompt no longer lists a hardcoded tool count because Mastra injects tools at runtime. [project]
