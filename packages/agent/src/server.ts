// Explicit server entry point.
// Usage: npx mastra dev --dir src
//
// The `mastra dev` CLI discovers the `mastra` export from this directory
// and starts an HTTP server on port 4111 (configured in index.ts).
//
// Endpoints auto-exposed by Mastra:
//   POST /api/agents/ncMedicaidAgent/generate
//   POST /api/agents/ncMedicaidAgent/stream
//
// Re-export the mastra instance so this file can also serve as the entry
// when pointed to directly.
export { mastra } from './index.js';
