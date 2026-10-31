# Chat UI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add theme toggle, collapsible sidebar, message action buttons, and scroll-to-bottom button to the chat UI.

**Architecture:** Four independent UI features sharing the same page. ThemeProvider wraps the app and persists to WorkOS metadata via a server action. Sidebar collapse is local state + localStorage. Message actions and scroll-to-bottom are self-contained components.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, shadcn/ui, lucide-react, WorkOS AuthKit, `@workos-inc/authkit-nextjs`

---

### Task 1: Theme Provider + Server Action

**Files:**
- Create: `packages/web/src/components/ThemeProvider.tsx`
- Create: `packages/web/src/app/actions/theme.ts`
- Modify: `packages/web/src/app/layout.tsx`

- [ ] **Step 1: Create the theme server action**

This server action updates WorkOS user metadata with the selected theme.

```ts
// packages/web/src/app/actions/theme.ts
'use server';

import { getWorkOS, withAuth } from '@workos-inc/authkit-nextjs';

export async function setThemeAction(theme: 'light' | 'dark' | 'system') {
  const { user } = await withAuth();
  if (!user) return;

  const workos = getWorkOS();
  await workos.users.updateUser(user.id, {
    metadata: { ...user.metadata, theme },
  });
}

export async function getThemeAction(): Promise<string | null> {
  const { user } = await withAuth();
  if (!user) return null;
  return (user.metadata as Record<string, string>)?.theme ?? null;
}
```

- [ ] **Step 2: Create ThemeProvider**

```tsx
// packages/web/src/components/ThemeProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { setThemeAction, getThemeAction } from '@/app/actions/theme';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Load saved theme from WorkOS on mount
  useEffect(() => {
    getThemeAction().then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    });
  }, []);

  // Resolve and apply theme whenever theme or system preference changes
  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const sys = mq.matches ? 'dark' : 'light';
        setResolvedTheme(sys);
        applyTheme(sys);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setThemeAction(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 3: Add ThemeProvider to layout**

Modify `packages/web/src/app/layout.tsx` — wrap `AuthKitProvider` children with `ThemeProvider`:

```tsx
import { ThemeProvider } from '@/components/ThemeProvider';

// Inside body:
<AuthKitProvider>
  <ThemeProvider>{children}</ThemeProvider>
</AuthKitProvider>
```

- [ ] **Step 4: Verify manually**

Run `npm run dev` in `packages/web`. Open browser devtools, check that:
- `<html>` element gets `dark` class when system is dark mode
- No errors in console about WorkOS metadata calls

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ThemeProvider.tsx packages/web/src/app/actions/theme.ts packages/web/src/app/layout.tsx
git commit -m "feat(web): add ThemeProvider with WorkOS metadata persistence"
```

---

### Task 2: Theme Toggle Component

**Files:**
- Create: `packages/web/src/components/ThemeToggle.tsx`
- Modify: `packages/web/src/app/chat/page.tsx`

- [ ] **Step 1: Create ThemeToggle component**

```tsx
// packages/web/src/components/ThemeToggle.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';

const options = [
  { value: 'system' as const, label: 'System', Icon: Monitor },
  { value: 'light' as const, label: 'Light', Icon: Sun },
  { value: 'dark' as const, label: 'Dark', Icon: Moon },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const ActiveIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        <ActiveIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-md border border-border bg-popover p-1 shadow-md z-50">
          {options.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => { setTheme(value); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-sm transition-colors ${
                theme === value
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add ThemeToggle to the chat header**

Modify `packages/web/src/app/chat/page.tsx` — in the header, add the toggle right-aligned:

```tsx
import { ThemeToggle } from '@/components/ThemeToggle';

// Replace the header content:
<div className="max-w-3xl mx-auto flex items-baseline gap-3">
  <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
    NC Medicaid Navigator
  </h1>
  <Separator orientation="vertical" className="h-5" />
  <span className="text-sm text-muted-foreground">Policy Research</span>
  <div className="ml-auto self-center">
    <ThemeToggle />
  </div>
</div>
```

- [ ] **Step 3: Verify manually**

Click the sun/moon icon. Verify:
- Dropdown shows System / Light / Dark
- Selecting each applies the theme immediately
- Page reload preserves the selection

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/ThemeToggle.tsx packages/web/src/app/chat/page.tsx
git commit -m "feat(web): add theme toggle to chat header"
```

---

### Task 3: Collapsible Sidebar

**Files:**
- Modify: `packages/web/src/app/chat/page.tsx`
- Modify: `packages/web/src/components/ThreadSidebar.tsx`

- [ ] **Step 1: Add collapse state and toggle to chat page**

Modify `packages/web/src/app/chat/page.tsx`:

```tsx
import { PanelLeftOpen } from 'lucide-react';

// Inside ChatPage, add state:
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('sidebar-collapsed') === 'true';
});

const toggleSidebar = useCallback(() => {
  setSidebarCollapsed(prev => {
    const next = !prev;
    localStorage.setItem('sidebar-collapsed', String(next));
    return next;
  });
}, []);

// Update sidebar wrapper:
<div className={`shrink-0 flex flex-col h-full transition-all duration-200 overflow-hidden ${
  sidebarCollapsed ? 'w-0' : 'w-[280px]'
}`}>
  <ThreadSidebar
    currentThreadId={threadId}
    resourceId={resourceId}
    refreshKey={threadVersion}
    onSelectThread={handleSelectThread}
    onNewThread={handleNewThread}
    onCollapse={toggleSidebar}
  />
</div>

// When collapsed, show toggle button in the header:
// Add before the h1 in the header:
{sidebarCollapsed && (
  <button
    onClick={toggleSidebar}
    className="p-2 -ml-2 mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    aria-label="Open sidebar"
  >
    <PanelLeftOpen className="w-4 h-4" />
  </button>
)}
```

- [ ] **Step 2: Add collapse button to ThreadSidebar**

Modify `packages/web/src/components/ThreadSidebar.tsx`:

```tsx
import { PanelLeftClose } from 'lucide-react';

// Add to props:
interface ThreadSidebarProps {
  // ... existing props
  onCollapse?: () => void;
}

// In the header, add the collapse button:
<div className="px-4 py-4 flex items-center justify-between shrink-0">
  <div className="flex items-center gap-2">
    {onCollapse && (
      <button
        onClick={onCollapse}
        className="p-1 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Close sidebar"
      >
        <PanelLeftClose className="w-4 h-4" />
      </button>
    )}
    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
      Threads
    </span>
  </div>
  <Button ...>+ New</Button>
</div>
```

- [ ] **Step 3: Verify manually**

- Click collapse chevron in sidebar header → sidebar animates to 0px
- Open button appears in main header → click it → sidebar comes back
- Reload page → sidebar stays in its last state

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/chat/page.tsx packages/web/src/components/ThreadSidebar.tsx
git commit -m "feat(web): add collapsible sidebar with localStorage persistence"
```

---

### Task 4: Message Action Buttons

**Files:**
- Create: `packages/web/src/components/MessageActions.tsx`
- Modify: `packages/web/src/app/chat/page.tsx`

- [ ] **Step 1: Create MessageActions component**

```tsx
// packages/web/src/components/MessageActions.tsx
'use client';

import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';

interface MessageActionsProps {
  content: string;
  onRerun?: () => void;
}

export function MessageActions({ content, onRerun }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
        aria-label={copied ? 'Copied' : 'Copy response'}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      <button
        onClick={() => setRating(r => r === 'up' ? null : 'up')}
        className={`p-1.5 rounded-md transition-colors ${
          rating === 'up'
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted'
        }`}
        aria-label="Thumbs up"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => setRating(r => r === 'down' ? null : 'down')}
        className={`p-1.5 rounded-md transition-colors ${
          rating === 'down'
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted'
        }`}
        aria-label="Thumbs down"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>

      {onRerun && (
        <button
          onClick={onRerun}
          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Re-run question"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire MessageActions into chat page**

Modify `packages/web/src/app/chat/page.tsx` — in the messages loop, after each assistant message's prose div:

```tsx
import { MessageActions } from '@/components/MessageActions';

// Wrap each message div with `group` class for hover detection:
// Change <div key={i}> to <div key={i} className="group">

// After the assistant message's prose div, add:
{msg.role === 'assistant' && (
  <div data-testid="assistant-message" className="pl-2 mt-6">
    {/* ... existing timeline + prose ... */}
    <MessageActions
      content={msg.content}
      onRerun={() => {
        // Find the preceding user message
        const userMsg = messages.slice(0, i).reverse().find(m => m.role === 'user');
        if (userMsg) sendMessage(userMsg.content);
      }}
    />
  </div>
)}
```

- [ ] **Step 3: Verify manually**

- Hover over an assistant message → action buttons fade in
- Click Copy → icon changes to checkmark for 2s, text is on clipboard
- Click thumbs up → fills in, click again → unfills
- Click re-run → preceding question is re-sent, new response appends

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/MessageActions.tsx packages/web/src/app/chat/page.tsx
git commit -m "feat(web): add message action buttons (copy, rate, re-run)"
```

---

### Task 5: Scroll-to-Bottom Button

**Files:**
- Create: `packages/web/src/components/ScrollToBottom.tsx`
- Modify: `packages/web/src/app/chat/page.tsx`

- [ ] **Step 1: Create ScrollToBottom component**

```tsx
// packages/web/src/components/ScrollToBottom.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomProps {
  viewportRef: React.RefObject<HTMLElement | null>;
}

export function ScrollToBottom({ viewportRef }: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false);

  const checkScroll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const distanceFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    setVisible(distanceFromBottom > 100);
  }, [viewportRef]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => vp.removeEventListener('scroll', checkScroll);
  }, [viewportRef, checkScroll]);

  const scrollToBottom = () => {
    const vp = viewportRef.current;
    if (vp) {
      vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
    }
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToBottom}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 p-2 rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all animate-in fade-in zoom-in-75 duration-200"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
}
```

- [ ] **Step 2: Wire ScrollToBottom into chat page**

Modify `packages/web/src/app/chat/page.tsx`:

```tsx
import { ScrollToBottom } from '@/components/ScrollToBottom';

// Add a ref for the viewport:
const viewportRef = useRef<HTMLElement | null>(null);

// After the ScrollArea mounts, grab the viewport ref:
useEffect(() => {
  const el = messagesEndRef.current?.closest('[data-slot="scroll-area-viewport"]');
  if (el) viewportRef.current = el as HTMLElement;
}, []);

// In the JSX, wrap the main chat area in a relative container and add the button.
// The main area div already exists: <div className="flex flex-col flex-1 min-w-0">
// Add `relative` to it, then place ScrollToBottom inside, after the ScrollArea:

<div className="flex flex-col flex-1 min-w-0 relative">
  <header>...</header>
  <ScrollArea className="flex-1 min-h-0">...</ScrollArea>
  <ScrollToBottom viewportRef={viewportRef} />
  <footer>...</footer>
</div>
```

- [ ] **Step 3: Verify manually**

- Send a long message or load a thread with long content
- Scroll up → floating down-arrow button appears
- Click it → smoothly scrolls to bottom, button disappears
- At bottom → button stays hidden

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/ScrollToBottom.tsx packages/web/src/app/chat/page.tsx
git commit -m "feat(web): add scroll-to-bottom floating button"
```

---

### Task 6: Sidebar dark theme fix

The sidebar currently uses hardcoded `bg-zinc-950` and `text-zinc-*` classes. These look right in dark mode but won't adapt to light mode. Update to use semantic theme tokens.

**Files:**
- Modify: `packages/web/src/components/ThreadSidebar.tsx`

- [ ] **Step 1: Update sidebar colors to theme-aware classes**

Replace hardcoded zinc classes with semantic tokens:

| Current | Replace with |
|---------|-------------|
| `bg-zinc-950` | `bg-sidebar` |
| `border-zinc-800` | `border-sidebar-border` |
| `text-zinc-500` | `text-sidebar-foreground/50` |
| `text-zinc-400` | `text-sidebar-foreground/70` |
| `text-zinc-100` | `text-sidebar-foreground` |
| `text-zinc-600` | `text-sidebar-foreground/40` |
| `bg-zinc-800` (active) | `bg-sidebar-accent` |
| `hover:bg-zinc-900` | `hover:bg-sidebar-accent/50` |
| `hover:text-zinc-100` | `hover:text-sidebar-foreground` |
| `hover:text-zinc-200` | `hover:text-sidebar-foreground/90` |
| `bg-zinc-800` (separator) | `bg-sidebar-border` |

- [ ] **Step 2: Verify manually**

Toggle between light and dark theme. Sidebar should look appropriate in both modes.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ThreadSidebar.tsx
git commit -m "fix(web): use semantic theme tokens in sidebar for light/dark support"
```

---

### Task 7: Run E2E tests and fix breakages

**Files:**
- Possibly modify: `e2e/tests/mocked/*.spec.ts`

- [ ] **Step 1: Run the full mocked test suite**

```bash
cd e2e && TEST_USER_EMAIL="$TEST_USER_EMAIL" TEST_USER_PASSWORD="$TEST_USER_PASSWORD" npx playwright test --project=mocked
```

- [ ] **Step 2: Fix any failures**

The sidebar class changes (Task 6) may affect selectors in `chat-page.ts` helper or test assertions. Update as needed.

- [ ] **Step 3: Commit fixes**

```bash
git add -A e2e/
git commit -m "test(e2e): update tests for chat UI features"
```
