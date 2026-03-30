# Chat UI Features Design

## Context

The NC Medicaid Navigator chat UI is functional but lacks standard chat application features: theme support, a collapsible sidebar, message action buttons, and a scroll-to-bottom indicator. These features improve usability and bring the UI closer to parity with tools like ChatGPT that users expect.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Theme persistence | WorkOS user metadata | Syncs across devices from day one; avoids migration later |
| Sidebar collapse | Full collapse (0px) | Maximizes content area; simplest implementation |
| Ratings persistence | Visual only (no backend) | No analytics pipeline yet; UI is the same either way |
| Theme toggle location | Main header | Always visible even when sidebar is collapsed |

## Feature 1: Theme (light/dark/system)

### Behavior

- Sun/moon icon button in the main header bar, right-aligned
- Three states: `system`, `light`, `dark`
- Small dropdown or popover on click showing the three options with the current one highlighted
- On selection: immediately apply theme, persist to WorkOS user metadata

### Implementation

- **Tailwind dark mode**: use `class` strategy on `<html>` element — add `dark` class for dark mode
- **Load sequence**: on app mount, fetch user metadata from WorkOS. If `theme` is set, apply it. If not, default to `system` (use `prefers-color-scheme` media query).
- **Save**: call WorkOS API to update user metadata on theme change
- **Flash prevention**: the proxy/layout can read the session and set the initial class server-side to avoid a flash of wrong theme. If too complex for v1, accept a brief flash.
- **CSS**: existing Tailwind + shadcn components already support `dark:` variants. Need to verify `globals.css` has both light and dark CSS variable sets.

### Components

- `ThemeToggle` — icon button + dropdown in the header
- `ThemeProvider` — context that manages current theme, provides `setTheme()`, handles system preference detection via `matchMedia`

## Feature 2: Collapsible Sidebar

### Behavior

- Sidebar collapses fully to 0px width with a smooth CSS transition
- Toggle button: when sidebar is open, a chevron-left icon in the sidebar header. When collapsed, a small floating hamburger/chevron-right button pinned to the left edge of the main header area.
- Collapse state stored in `localStorage` (`sidebar-collapsed: true/false`)
- Persists across page reloads but not across devices (not worth a server round-trip)

### Implementation

- `chat/page.tsx`: add `sidebarCollapsed` state, toggle handler
- Sidebar wrapper: conditional width `w-[280px]` vs `w-0` with `transition-all duration-200`
- When collapsed, sidebar content is hidden via `overflow-hidden` on the wrapper (already the case at 0px)
- Toggle button placement:
  - **Open state**: inside the sidebar header, replacing or alongside the "Threads" label
  - **Collapsed state**: a small icon button at the left edge of the main header bar

### Components

- `SidebarToggle` — the chevron button that toggles open/closed state

## Feature 3: Message Action Buttons

### Behavior

- Row of small icon buttons below each completed assistant message
- Buttons: **Copy** (clipboard icon), **Thumbs up**, **Thumbs down**, **Re-run** (refresh icon)
- Visible after message completes, not during streaming
- Appear on hover with a fade-in, or always visible on mobile/touch

### Actions

- **Copy**: `navigator.clipboard.writeText(msg.content)`. Show a brief "Copied!" tooltip or swap icon to a checkmark for 2 seconds.
- **Thumbs up / Thumbs down**: toggle visual state (outline → filled). Mutually exclusive — clicking one deselects the other. No backend persistence in v1.
- **Re-run**: find the preceding user message in the messages array, call `sendMessage(userMsg.content)` again. The new response appends to the conversation (does not replace the existing one).

### Components

- `MessageActions` — row of icon buttons, receives the message content and callbacks as props

## Feature 4: Scroll-to-Bottom Button

### Behavior

- Floating circular button with a down-arrow icon
- Appears when the user has scrolled up from the bottom of the ScrollArea viewport (e.g., more than 100px from bottom)
- Positioned at bottom-center of the content area, just above the input footer
- Click: smoothly scrolls the ScrollArea viewport to the bottom using `viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })`
- Disappears when the user is at or near the bottom

### Implementation

- Listen to the `scroll` event on the ScrollArea viewport element
- Track whether `scrollTop + clientHeight < scrollHeight - 100` to determine if the button should show
- Use the same `closest('[data-slot="scroll-area-viewport"]')` pattern from the scroll fix
- Animate in/out with opacity + scale transition

### Components

- `ScrollToBottom` — floating button component, receives a ref or callback to the scroll viewport

## Files to Modify

| File | Changes |
|------|---------|
| `packages/web/src/app/chat/page.tsx` | Add sidebar collapse state, wire toggle, add scroll-to-bottom, add theme toggle to header |
| `packages/web/src/components/ThreadSidebar.tsx` | Add collapse toggle button in header |
| `packages/web/src/components/MessageActions.tsx` | New component — copy, rate, re-run buttons |
| `packages/web/src/components/ScrollToBottom.tsx` | New component — floating scroll button |
| `packages/web/src/components/ThemeToggle.tsx` | New component — sun/moon dropdown |
| `packages/web/src/components/ThemeProvider.tsx` | New component — theme context + system preference detection |
| `packages/web/src/app/layout.tsx` | Wrap with ThemeProvider, set initial `dark` class |
| `packages/web/src/app/globals.css` | Ensure light and dark CSS variable sets exist |

## Testing

- E2E tests for sidebar collapse: toggle button works, sidebar hides/shows, state persists across navigation
- E2E tests for message actions: copy button works (mock clipboard API), re-run sends message
- E2E tests for scroll-to-bottom: button appears when scrolled up, clicking scrolls to bottom
- Theme toggle: harder to E2E test (requires checking computed styles), consider manual verification for v1
