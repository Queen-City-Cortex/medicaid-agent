---
children_hash: 1292491a9662f86594745fe1817fa71790d236f6abfb638791a8d280ec94e2f0
compression_ratio: 0.4379310344827586
condensation_order: 1
covers: [context.md, message_persistence_parsing.md, quiet_citation_styling_in_messagelist.md]
covers_token_total: 1740
summary_level: d1
token_count: 762
type: summary
---
# Message Persistence Parsing and Citation Styling

## Scope
This set of entries covers two frontend UI behaviors in the chat experience:
- how persisted Mastra thread messages are reconstructed into `UIMessage` payloads
- how inline markdown citations are styled and linked in `MessageList`

## 1) Message persistence parsing
**Drill down:** `message_persistence_parsing.md`, `context.md`

- `convertThreadMessageToUIMessage` now detects `MastraMessageContentV2` payloads (`format 2` with a `parts` array) and preserves structured message parts during reload.
- `convertV4PartsToV5` translates tool-invocation parts into dynamic-tool / step-start / text parts, with explicit state mapping that matches ResearchTrace expectations.
- Legacy payloads still fall back to `extractText`, but text pieces are joined with `\n\n` to preserve multi-paragraph formatting.
- The flow is: receive thread message → detect `MastraMessageContentV2` → convert tool parts → return structured `UIMessage` → fallback to legacy extraction if needed.
- Key dependencies: `generateUUID`, `convertV4PartsToV5`, and `extractText`.

**Key facts**
- Tool invocation state `'result'` maps to `'output-available'`.
- All other tool states map to `'input-available'`.
- The parsing update preserves research traces, tool metadata, and formatted answers across reloads.

**Related topics**
- `frontend_ui/chat_page_transport`
- `frontend_ui/message_feedback`
- Also linked in `message_persistence_parsing.md`: thread cache restoration and race-fix entries.

## 2) Quiet citation styling in `MessageList`
**Drill down:** `quiet_citation_styling_in_messagelist.md`

- `MessageList.tsx` overrides the ReactMarkdown `a` renderer so citation links that map to sources render quietly instead of with full gold styling.
- The citation pipeline is:
  `markdown link -> normalizeCitationUrl -> sourceIndex lookup -> citation styling or external link styling -> footnote navigation`
- Mapped citations use subtle foreground styling with a muted underline, while unmapped external links keep gold accent styling.
- The superscript citation button remains the main citation affordance and jumps to the Sources panel.

**Rules**
- Mapped source links must render quietly.
- Unmapped links keep gold treatment.
- The superscript citation button must navigate to the Sources panel.

**Key facts**
- Citation mapping depends on `normalizeCitationUrl`, `buildSourceIndex`, `extractMessageSources`, `extractCitedUrls`, and `splitSourcesByCited`.
- Preview fixture URLs were updated so citations resolve correctly.
- The change shipped as PR `#11` on branch `redesign/quiet-citations`.
- `234` web tests remained green after the change.

## Relationship between the entries
- Both entries focus on preserving chat answer fidelity across persistence and presentation.
- `message_persistence_parsing` ensures stored content reloads with structure intact.
- `quiet_citation_styling_in_messagelist` ensures rendered answers stay readable while preserving citation navigation and source traceability.