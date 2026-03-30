# Topic: playwright_e2e

## Overview
Describes the Playwright-based e2e infrastructure under e2e/, including the config, mock helpers, and chat page object used by both mocked and smoke suites.

## Key Concepts
- Playwright projects (mocked + smoke) with tailored timeouts
- MastraStreamBuilder for synthesizing SSE responses
- mockMastraAPI routes for streaming, thread, and message endpoints
- ChatPage page object encapsulating selectors and actions
