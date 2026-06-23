# QA Feature Inventory — NC Medicaid Navigator (2026-06-22)

Auto-generated from a parallel-reader QA inventory pass. 142 user-facing items across 8 areas, with acceptance criteria and risk-based edge cases.


## Routing, shell & auth

### AuthKit middleware auth gate (proxy)  
`workflow` · src/proxy.ts:4-21 · id: `middleware-auth-gate`

Next.js 16 proxy (renamed middleware) runs WorkOS AuthKit on every matched request. middlewareAuth.enabled=true means any route NOT in unauthenticatedPaths requires a logged-in WorkOS session; unauthenticated users are redirected to the WorkOS login. unauthenticatedPaths allow-lists /auth/callback and /preview. The matcher excludes _next/static, _next/image, favicon.ico, sitemap.xml, robots.txt.

**Acceptance criteria:**
- Visiting any app route (e.g. /chat, /) while not logged in redirects the browser to the WorkOS AuthKit sign-in flow, not a 401/blank page.
- Visiting /auth/callback while unauthenticated does NOT redirect to login (it is allow-listed and must complete the auth handshake).
- Visiting /preview while unauthenticated does NOT redirect to login (allow-listed).
- After a successful login, the originally-requested protected route (or its returnPathname) is reachable without a second login.
- Requests for static assets under /_next/static, /_next/image, favicon.ico, sitemap.xml, robots.txt are served without invoking the auth gate (no redirect).

**Edge cases:**
- (high) Expired / invalid WorkOS session cookie present when hitting /chat → Treated as unauthenticated; user is redirected to login rather than seeing a server error or partial shell
- (high) Direct request to /preview in PRODUCTION (allow-listed in proxy but route returns notFound) → Reachable past middleware but renders the app 404 page, never the gallery — defense-in-depth holds
- (medium) Deep-linking to a protected route with a query string / hash while logged out → Login round-trip preserves intent and returns the user to a sensible destination (returnPathname /chat at minimum)
- (medium) Request to a path that matches a static-exclusion prefix but is actually dynamic (e.g. a route literally named with _next prefix) → Only the intended static paths bypass auth; no protected content leaks via crafted _next-prefixed URLs
- (high) WorkOS service unreachable / env vars (WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI, WORKOS_COOKIE_PASSWORD) missing or wrong → Middleware fails closed with a clear error, not an open route exposing protected pages
- (low) Concurrent navigations during a session-refresh race → No flicker between login redirect and protected page; final state is deterministic (either logged-in page or login)

**Suspected issues:**
- src/proxy.ts:20 — the matcher excludes sitemap.xml and robots.txt by name, but no robots/sitemap route or public file exists (confirmed: src/app/robots.*, sitemap.*, public/robots.txt all absent). Those URLs therefore 404 anyway; harmless but the exclusion is dead config and could mislead a tester into expecting a robots.txt.
- src/proxy.ts:10 — relying on app/preview/page.tsx NODE_ENV check as the 'real protection' for /preview means any regression that removes that check (or any non-'production' NODE_ENV in a deployed env) would expose the dev gallery publicly with no auth. Tester should verify NODE_ENV is actually 'production' in every deployed environment.


### Root route / redirects to /chat  
`route` · src/app/page.tsx:1-4 · id: `home-redirect-to-chat`

The index route ('/') is a server component that immediately calls redirect('/chat'). There is no landing/marketing page; the app entry point is the chat surface.

**Acceptance criteria:**
- Navigating to the site root '/' issues a redirect to /chat (observable as a 307/308 then the chat page).
- An authenticated user hitting '/' lands on /chat with the chat shell rendered.
- An unauthenticated user hitting '/' is redirected: the auth gate sends them to WorkOS login (the /chat target is protected), not to a flash of the chat shell.

**Edge cases:**
- (high) Unauthenticated user hits '/' — order of redirect('/chat') vs middleware login redirect → User ends at WorkOS login (or returns to /chat after login); no infinite redirect loop between / , /chat , and login
- (low) Redirect chain interacts with browser caching of the 308 from / to /chat → Subsequent visits to / still resolve correctly to /chat for the current auth state
- (low) Crawler / link-preview bot hits '/' → Redirect is followed or the auth gate intercepts; no server error


### WorkOS auth callback (/auth/callback)  
`api` · src/app/auth/callback/route.ts:1-20 · id: `auth-callback-handler`

GET route handler wrapping WorkOS handleAuth. Completes the OAuth/AuthKit code exchange, sets the session cookie, and redirects to returnPathname '/chat'. baseURL is derived (in priority order) from NEXT_PUBLIC_WORKOS_REDIRECT_URI, then WORKOS_REDIRECT_URI, then https://$RAILWAY_PUBLIC_DOMAIN, then undefined — to avoid redirecting to the container-internal 0.0.0.0 address on Railway/Docker.

**Acceptance criteria:**
- After completing WorkOS login, the browser is returned to /auth/callback, the session is established, and the user is redirected to /chat.
- The post-login redirect resolves to the public origin (the deployed domain), never to 0.0.0.0 or a container-internal host.
- When NEXT_PUBLIC_WORKOS_REDIRECT_URI is set, its origin is used as the base URL for the callback redirect.
- When only RAILWAY_PUBLIC_DOMAIN is set, the callback redirects to https://<that-domain>.
- The /auth/callback path is reachable without an existing session (allow-listed in proxy).

**Edge cases:**
- (high) Callback hit with missing/invalid/expired authorization code (e.g. user reloads callback URL, code already consumed) → handleAuth surfaces a clean auth error / re-initiates login, not a 500 with a stack trace or a broken redirect
- (medium) Malformed redirect-URI env var that is not a valid URL → new URL(redirectUri) throws and is caught (line 13 try/catch); falls through to RAILWAY_PUBLIC_DOMAIN or undefined without crashing
- (high) All three sources unset (no NEXT_PUBLIC_WORKOS_REDIRECT_URI, no WORKOS_REDIRECT_URI, no RAILWAY_PUBLIC_DOMAIN) → getBaseURL returns undefined; handleAuth uses its own/request-derived base — verify it does NOT redirect to 0.0.0.0 in that fallback
- (high) state/CSRF parameter tampering or mismatched cookie on callback → WorkOS rejects the exchange; no session is granted
- (medium) WorkOS token endpoint times out / network failure during code exchange → User sees an error or is bounced back to login, not a hung request
- (high) Open-redirect attempt via crafted return/redirect query params on the callback → Only the fixed returnPathname '/chat' and trusted base origin are used; user cannot be redirected to an attacker domain

**Suspected issues:**
- src/app/auth/callback/route.ts:20 — getBaseURL() is evaluated at module-load time (when handleAuth is constructed), not per-request. If the build/import happens before runtime env (RAILWAY_PUBLIC_DOMAIN) is injected, baseURL could be undefined despite the var being present at request time. Tester should confirm the callback redirects to the correct public origin in the actual Railway deploy, not just locally.


### Sign out (shell, depends on auth)  
`control` · src/components/ThreadSidebar.tsx:6,412 · id: `sign-out`

The app shell sidebar exposes a Sign out control wired to WorkOS signOut() (imported from @workos-inc/authkit-nextjs). The user's email and a Sign out affordance live at the bottom of the sidebar (mirrored in the /preview fixture at page-level gallery: 'demo@example.com' / 'Sign out').

**Acceptance criteria:**
- Clicking Sign out clears the WorkOS session and redirects to the login (or post-logout) destination.
- After signing out, navigating back to /chat (or pressing browser Back) re-triggers the auth gate and requires logging in again — protected content is not visible from cache.
- The signed-in user's email is displayed in the sidebar account area while authenticated.

**Edge cases:**
- (medium) Sign out clicked while a chat/research request is in flight → In-flight request is abandoned/cancelled; session is cleared without leaving a half-rendered authenticated shell
- (high) Browser Back after sign-out shows a bfcache snapshot of the authenticated chat → Either the page revalidates and redirects to login, or it shows no fresh protected data
- (medium) signOut() network call fails → User is informed or retried; the app does not appear logged-in while the server session is actually gone (or vice versa)


### AuthKitProvider client session context  
`state` · src/app/layout.tsx:44-48 · id: `auth-context-provider`

AuthKitProvider wraps the entire app in the root layout, exposing WorkOS auth/session state to client components (used by sign-out, theme persistence via withAuth, and chat). Sits outside ThemeProvider and TooltipProvider in the provider tree.

**Acceptance criteria:**
- Client components rendered anywhere in the tree can read the current WorkOS user/session through AuthKit hooks.
- Theme persistence (setThemeAction/getThemeAction) correctly resolves the authenticated user via withAuth() while inside this provider.
- When the session expires mid-session, client auth state reflects it (subsequent server actions / navigations behave as logged-out).

**Edge cases:**
- (high) Session silently expires while the user sits on /chat → Next server interaction (server action, navigation) detects no user and routes to login; no stale 'logged-in' UI persists indefinitely
- (medium) AuthKitProvider rendered for /preview where there is no session → Provider tolerates absent session; /preview still renders (it deliberately has no WorkOS session)
- (low) Provider misordering — a consumer needs auth context but is mounted above AuthKitProvider → All real consumers are below it (ThemeProvider/Tooltip/children) so context is available


### Dev-only component gallery (/preview)  
`route` · src/app/preview/page.tsx:20-23, src/app/preview/gallery.tsx:189-329 · id: `preview-gallery-route`

Dev-only component gallery that renders real UI components (app shell, DeepResearchView plan+report, EmptyState, MessageList conversation, VerificationBadge+SourcesPanel, ChatInput) against hardcoded fixtures with NO WorkOS session and NO Mastra/Neo4j backend. Returns notFound() (404) when NODE_ENV==='production'. metadata sets robots index:false, follow:false. Has an in-page light/dark toggle button.

**Acceptance criteria:**
- In development (NODE_ENV!=='production'), /preview renders the gallery with all sections: App shell, Deep Research plan approval, Deep Research report, Empty state, Conversation, Verification + sources, Composer.
- In production (NODE_ENV==='production'), /preview returns the app 404 page and never renders the gallery.
- The page is marked noindex/nofollow (robots meta) so it is never indexed even if reachable.
- Clicking the theme toggle button (top-right Sun/Moon, aria-label 'Toggle theme') flips the .dark class on documentElement and visually switches the entire gallery between light and dark.
- The toggle starts in light mode (deterministic initial render — no hydration mismatch) and the icon reflects state (Moon when light, Sun when dark).
- Selecting an example in the EmptyState section populates the Composer input (onSelectExample -> setInput).

**Edge cases:**
- (low) Toggle theme rapidly many times → documentElement .dark class stays in sync with the dark state; no flicker or stuck state
- (low) Gallery's local theme toggle conflicts with the layout's cookie-based ThemeProvider (both write .dark) → On /preview the local toggle wins for the session; navigating away and back resets to light (state is component-local), which is acceptable for a dev tool
- (high) NODE_ENV is something other than 'production' or 'development' in a deployed/preview environment → Any non-'production' value renders the gallery — verify this is never the case in a publicly reachable deploy (see proxy concern)
- (medium) Fixture data drifts from the real component prop types (e.g. UIMessage cast with 'as UIMessage') → Gallery still compiles/renders; but it may mask real prop mismatches that only surface in /chat

**Suspected issues:**
- src/app/preview/gallery.tsx:54-94 — CONVERSATION fixtures are cast with 'as UIMessage', bypassing type checking; the preview can render shapes that the real /chat MessageList would reject, weakening the gallery's value as a faithful preview.
- src/app/preview/gallery.tsx:195-198 — the gallery's local dark toggle manipulates documentElement.classList directly, independent of the layout's ThemeProvider; if a tester navigates /preview -> /chat the .dark class set here could leak across the SPA navigation until ThemeProvider re-applies.


### Segment error boundary (error.tsx)  
`modal` · src/app/error.tsx:1-38 · id: `segment-error-boundary`

Client error boundary for route segments. Renders a centered 'Something went wrong' card with explanatory copy, an optional digest reference, and a 'Try again' button that calls reset(). Reports the error to Sentry via captureException on mount.

**Acceptance criteria:**
- When a route segment throws a client/render error, this boundary renders the 'Something went wrong' card instead of a blank page or crash.
- If error.digest is present, the card shows 'Reference: <digest>' in a monospace span.
- Clicking 'Try again' invokes reset() and attempts to re-render the failed segment (recovers if the error was transient).
- The error is reported to Sentry exactly once per error instance (captureException on mount), and is a no-op when Sentry is not configured.
- Styling uses theme tokens (bg-background, text-foreground, bg-primary) so the error card respects light/dark mode.

**Edge cases:**
- (low) error.digest is undefined (no server digest) → Reference line is omitted (conditional render at line 24); no 'Reference: undefined' text
- (medium) Error recurs immediately after pressing Try again (deterministic, non-transient error) → Boundary re-renders the same card; user is not trapped in a flashing loop and can still contact support
- (low) Sentry not initialized (no DSN) → captureException is a safe no-op; the error card still renders
- (medium) Error thrown in the layout itself (not a segment) → This boundary does NOT catch it — global-error.tsx must (see global-error item); confirm the right boundary fires


### Global error boundary (global-error.tsx)  
`modal` · src/app/global-error.tsx:9-43 · id: `global-error-boundary`

Root-level error boundary that catches errors crashing the root layout itself (which the segment error.tsx cannot). Renders its own <html>/<body> with inline styles (no theme tokens, since the failing layout may not have loaded CSS). Shows 'Something went wrong' + reload guidance. Reports to Sentry on mount.

**Acceptance criteria:**
- When the root layout throws, this boundary renders a self-contained centered 'Something went wrong' page with its own <html>/<body>.
- Copy instructs the user to reload the page or contact support (note: no interactive button here, unlike error.tsx).
- The error is reported to Sentry on mount (no-op when Sentry not initialized).
- Inline styles render correctly even if the app's CSS/theme failed to load.

**Edge cases:**
- (medium) Layout error occurs before fonts/CSS load → Inline-styled fallback still renders legibly (system-ui font, centered)
- (low) User wants to recover but there is no 'Try again' button (reset is accepted as a prop but unused) → User reloads manually per the copy; acceptable, but recovery is less convenient than the segment boundary
- (low) Sentry not configured during a root crash → captureException no-ops; fallback page still renders
- (low) Dark-mode user hits the global error (inline styles hardcode #666 / no dark variant) → Page is still readable; not theme-aware (acceptable for a last-resort fallback)

**Suspected issues:**
- src/app/global-error.tsx:13 — the component is named 'GlobalError' but declares a 'reset' prop in its type (line 13) that is never used; there is no 'Try again' button, so a user hitting a root-layout crash has no in-page recovery and must reload manually. Likely intentional but worth confirming as a UX gap.
- src/app/global-error.tsx:35 — hardcoded color '#666' and inline styles mean the global error page ignores dark mode; on a dark-preferring device it renders light. Acceptable as a fallback but tester should note the inconsistency.


### Pre-paint theme application (no FOUC)  
`feature` · src/app/layout.tsx:17-51 · id: `theme-init-no-flash`

The root layout reads the 'theme' cookie server-side and adds the 'dark' class to <html> for explicit dark (covers no-JS). An inline THEME_INIT_SCRIPT in <head> runs before first paint: reads the theme cookie, and if it is not 'light'/'dark' falls back to prefers-color-scheme to toggle the 'dark' class — preventing a white flash for dark-mode users. suppressHydrationWarning is set because the script may adjust the class before hydration.

**Acceptance criteria:**
- A user with theme cookie='dark' sees a dark page with NO white flash on initial load (server renders 'dark' class + inline script).
- A user with no cookie (or 'system') whose OS prefers dark sees dark immediately via the inline script — no light flash.
- A user with theme cookie='light' sees light regardless of OS preference.
- There is no React hydration mismatch warning attributable to the html className/dark class (suppressHydrationWarning covers the script's pre-hydration adjustment).
- Font CSS variables (display/reading/mono) are applied via fontClassNames on <html> and the body uses font-sans.

**Edge cases:**
- (low) Cookies disabled in the browser → Inline script's regex match returns null, falls back to prefers-color-scheme; no crash (wrapped in try/catch)
- (medium) Tampered/garbage 'theme' cookie value (e.g. 'theme=<script>') → decodeURIComponent then the t!=='light'&&t!=='dark' check rejects it -> falls back to system; value is never injected into the DOM, only compared
- (low) JavaScript disabled entirely → Explicit 'dark' cookie still paints dark (server-rendered class at line 37); 'system' users get light (no script to resolve OS preference) — acceptable degradation
- (low) OS theme changes while the tab is open → For 'system' users the ThemeProvider's matchMedia subscription updates the class live (ThemeProvider.tsx subscribeToSystemTheme); pre-paint script only runs once on load
- (low) Cookie present but URL-encoded with extra surrounding characters → Regex (?:^|; )theme=([^;]*) extracts only the value up to the next ';'; correct theme resolved

**Suspected issues:**
- src/app/layout.tsx:11 — THEME_COOKIE name 'theme' is duplicated as a string literal in layout.tsx (cookieStore.get('theme'), the inline script regex) and in actions/theme.ts (THEME_COOKIE const). Drift between the writer and the readers would silently break no-flash theming; the duplication is documented but fragile.


### setThemeAction (theme persistence server action)  
`api` · src/app/actions/theme.ts:23-42 · id: `theme-set-action`

Server action ('use server') that validates the incoming theme against ['light','dark','system'], writes the 'theme' cookie (path /, 1-year maxAge, sameSite lax), then if a WorkOS user is present, persists the theme to that user's WorkOS metadata via userManagement.updateUser. Called by ThemeProvider.setTheme.

**Acceptance criteria:**
- Changing the theme writes a 'theme' cookie with the selected value, path '/', and ~1-year expiry.
- An invalid/unexpected theme value is rejected (isTheme guard) and no cookie is written.
- For a logged-in user, the selected theme is also saved to WorkOS user metadata (so it follows them across devices).
- For an unauthenticated context (e.g. /preview, or before login), the cookie is still written but the WorkOS update is skipped (returns after no user).

**Edge cases:**
- (high) Caller (malicious client) posts theme='hacker' or non-string → isTheme returns false at line 26; action returns early, no cookie set, no WorkOS call — validated server-side as the comment notes
- (medium) WorkOS updateUser fails or times out after the cookie is already set → Cookie persisted locally; the unhandled rejection from updateUser should not corrupt the user's session or crash the action — verify error is tolerated
- (medium) updateUser overwrites existing metadata → Spread {...user.metadata, theme} preserves other metadata keys; only 'theme' changes
- (low) Rapid theme toggles fire many concurrent setThemeAction calls → Last write wins for both cookie and WorkOS metadata; no inconsistent final state

**Suspected issues:**
- src/app/actions/theme.ts:38-41 — updateUser is awaited but not wrapped in try/catch; a WorkOS API failure rejects the server action AFTER the cookie was already set (line 32), so the user's UI theme and persisted-metadata theme can diverge and the action surfaces an error to the caller (ThemeProvider calls it as `void setThemeAction(t)`, so the rejection is unhandled). Tester should toggle theme with WorkOS unreachable and confirm the UI still updates without an uncaught error.


### getThemeAction (theme resolution + cookie backfill)  
`api` · src/app/actions/theme.ts:44-60 · id: `theme-get-action`

Server action that resolves the persisted theme: returns the cookie value if valid; otherwise, for a logged-in user, reads theme from WorkOS user metadata and backfills the cookie (covering a theme saved on another device or before the cookie existed) before returning. Returns null if nothing valid is found. Called once on mount by ThemeProvider.

**Acceptance criteria:**
- On a device with a valid 'theme' cookie, getThemeAction returns that value without touching WorkOS.
- On a fresh device (no cookie) for a logged-in user whose WorkOS metadata has a theme, the action returns that theme AND writes the cookie so the next load paints correctly without a round-trip.
- For an unauthenticated user with no cookie, the action returns null and ThemeProvider keeps its initialTheme/system default.
- ThemeProvider applies the returned value (light/dark/system) on mount, syncing cross-device themes.

**Edge cases:**
- (medium) Cookie value is invalid but WorkOS metadata has a valid theme → isTheme(fromCookie) false -> falls through to WorkOS, backfills cookie with valid value, returns it
- (medium) user.metadata.theme is an unexpected/garbage value → isTheme guard at line 53 rejects it; returns null rather than backfilling a bad cookie
- (medium) withAuth() throws or WorkOS is unreachable during getThemeAction → Action should not crash the initial client render; ThemeProvider's .then handler only applies valid values — verify a rejection here does not throw an uncaught error on mount
- (low) user.metadata is null/undefined → (user.metadata as Record)?.theme optional-chains to undefined; isTheme false; returns null

**Suspected issues:**
- src/app/actions/theme.ts:49 — withAuth() is called with no try/catch; if it rejects (WorkOS down, bad config), getThemeAction rejects and ThemeProvider's getThemeAction().then(...) (ThemeProvider.tsx:59) has no .catch, producing an unhandled promise rejection on every mount when auth is unhealthy. Tester should load the app with WorkOS misconfigured and watch the console.


### Self-hosted web fonts (next/font)  
`feature` · src/app/fonts.ts:1-33 · id: `fonts-self-hosting`

Three Google fonts (Fraunces display, Newsreader reading, IBM Plex Mono) self-hosted at build time via next/font with display:'swap', exposing CSS variables (--font-display, --font-reading, --font-mono) combined into fontClassNames and applied to <html> in layout.tsx. globals.css maps these to --font-sans/heading/mono/reading tokens.

**Acceptance criteria:**
- All three font faces load from the app's own origin at build time (no runtime request to fonts.googleapis.com).
- Text renders with the intended faces: reading serif (Newsreader) for body, display serif (Fraunces) for headings, mono (IBM Plex Mono) for labels/citations.
- display:'swap' means text is visible immediately in a fallback face and swaps to the web font with no invisible-text period.
- The CSS variables resolve to the correct fonts in globals.css (--font-sans -> Newsreader, --font-heading -> Fraunces, --font-mono -> IBM Plex Mono).

**Edge cases:**
- (low) Network blocks the self-hosted font files (CSP, slow connection) → swap fallback fonts (ui-serif/Georgia/monospace chains in globals.css) render; layout remains usable
- (medium) Build-time font fetch fails in CI/Railway → next build fails loudly rather than shipping broken font references — tester should confirm a successful production build serves all faces


### Server/edge error reporting (instrumentation.ts)  
`feature` · src/instrumentation.ts:5-22 · id: `sentry-server-instrumentation`

register() initializes Sentry on the nodejs/edge runtime only when SENTRY_DSN is set (read at runtime, not inlined); otherwise a no-op. Errors-only by default (tracesSampleRate 0 unless SENTRY_TRACES_SAMPLE_RATE set). onRequestError forwards server render/route-handler errors to Sentry.

**Acceptance criteria:**
- With SENTRY_DSN set, server-side and route-handler errors (e.g. an /auth/callback or server-action failure) are reported to Sentry.
- With SENTRY_DSN unset, register() returns early and no Sentry network calls are made (local dev / unconfigured deploys behave normally).
- tracesSampleRate defaults to 0 (errors only) unless SENTRY_TRACES_SAMPLE_RATE is explicitly set.
- environment falls back to NODE_ENV when SENTRY_ENVIRONMENT is unset.

**Edge cases:**
- (medium) SENTRY_DSN set but invalid → Sentry.init tolerates/logs the bad DSN; the app still serves requests (instrumentation failure must not take down the server)
- (low) NEXT_RUNTIME is neither 'nodejs' nor 'edge' → Sentry.init is skipped (guard at line 15); no crash
- (low) SENTRY_TRACES_SAMPLE_RATE set to a non-numeric string → Number(...) yields NaN; verify Sentry treats NaN safely (no unexpected full-trace sampling)

**Suspected issues:**
- src/instrumentation.ts:12 — Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0) yields NaN for a malformed value (e.g. 'half'); the same pattern appears client-side (instrumentation-client.ts:11). A NaN sample rate is a latent misconfiguration risk worth a test with a bad env value.


### Browser error reporting (instrumentation-client.ts)  
`feature` · src/instrumentation-client.ts:7-16 · id: `sentry-client-instrumentation`

Initializes browser Sentry only when NEXT_PUBLIC_SENTRY_DSN is set (inlined at build time); otherwise no-op. Errors-only by default (tracesSampleRate 0). Exports onRouterTransitionStart so Sentry can tie client-side navigations to the originating request. The error.tsx and global-error.tsx boundaries depend on this for client-side captureException to actually report.

**Acceptance criteria:**
- With NEXT_PUBLIC_SENTRY_DSN set at build time, client-side errors caught by error.tsx/global-error.tsx are reported to Sentry.
- With the public DSN unset, Sentry.init is never called and captureException calls in the error boundaries are safe no-ops.
- Client-side route transitions are instrumented (onRouterTransitionStart) so navigation context is attached to reports.
- tracesSampleRate defaults to 0 unless NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE is set.

**Edge cases:**
- (medium) Public DSN changes between build and runtime → Because it is inlined at build time, only the build-time value takes effect; a runtime-only override has no effect — tester should set it before build
- (medium) Sentry init throws in the browser (bad DSN) → The app still loads; a Sentry init failure must not block rendering the shell
- (low) Error boundary fires before client Sentry has initialized → captureException no-ops gracefully; the fallback UI still renders


## Chat page & thread lifecycle hooks

### /chat route (auth-gated entry)  
`route` · src/app/chat/page.tsx:23-276 · id: `chat-route-auth-gate`

The authenticated chat workspace. Renders a skeleton while WorkOS auth resolves, then the full layout: sidebar, masthead, message timeline, composer. Unauthenticated users are blocked by WorkOS middleware before this renders.

**Acceptance criteria:**
- Visiting /chat while signed in renders the masthead 'NC Medicaid Navigator', the thread sidebar, an empty-state, and the composer.
- While auth is loading (authLoading true), a skeleton with a pulsing muted bar in the header and a hidden-on-mobile sidebar placeholder is shown and no chat controls are interactive.
- Once auth resolves with a user, resourceId equals the WorkOS user id and threads are scoped to that user.
- Input is auto-focused on mount (focus({preventScroll:true}) at line 96) without scrolling the page.

**Edge cases:**
- (high) Auth resolves with no user (authLoading false, user null) → resourceId falls back to 'anonymous' (page.tsx:29); page still renders rather than crashing, but all memory/threads are written under the shared 'anonymous' resource
- (medium) authLoading never flips to false (WorkOS hang/network failure) → Skeleton remains indefinitely; user sees a stuck loading bar with no error or retry
- (high) Access token expires mid-session → useMastraClient/getAccessToken should yield a refreshed token on next call; verify subsequent sends/thread loads still authorize and don't silently 401
- (medium) Direct navigation to /chat while signed out → WorkOS middleware redirects to login before page renders (verify the page never flashes)

**Suspected issues:**
- page.tsx:29 — anonymous fallback means a logged-out-but-rendered state writes all threads under resourceId 'anonymous', a shared bucket across users; if middleware ever fails open this leaks/collides thread data.


### Send a chat message (Ask)  
`workflow` · src/app/chat/page.tsx:105-117 · id: `send-message`

handleSend: trims input, enforces a 10k length ceiling, clears the textarea, lazily creates the thread on the first message (with the question's first 60 chars as the title), then streams the answer via sendMessage. In Deep Research mode it routes to deepResearch.start instead.

**Acceptance criteria:**
- Typing a question and clicking Ask (or Enter on desktop) clears the input, appends the user message, and begins a streaming assistant response.
- On the FIRST message of a new thread, ensureThreadExists is called before sendMessage and the new thread appears in the sidebar titled with the first 60 chars of the question.
- Empty or whitespace-only input does not send (input.trim() guard).
- When deepMode is on, handleSend calls deepResearch.start(question) and does NOT create a chat thread or call sendMessage.
- Input is cleared (setInput('')) immediately on send so the composer is ready for the next question.

**Edge cases:**
- (medium) Input exactly 10,000 chars → Guard is `> 10_000` so exactly 10000 still sends; textarea maxLength=10000 caps typing, so the boundary message goes through (verify backend accepts it)
- (low) Input pasted longer than 10,000 chars → Textarea maxLength truncates paste to 10000, so the `> 10_000` guard in handleSend is effectively unreachable; confirm no path sends >10k and the char-counter shows 'limit reached'
- (medium) Rapid double Ask / Enter before status flips to submitted → Second send should be prevented; ChatInput gates Enter on !isLoading and disables the button while loading, but handleSend itself has NO isLoading guard — a programmatic/very-fast double trigger could fire two sends
- (high) First message: ensureThreadExists network failure → createMemoryThread error is swallowed (use-chat-thread.ts:156-158); sendMessage still proceeds — verify the message persists and the thread later appears, rather than producing an orphaned ungrouped message
- (medium) messages.length read in closure is stale after first send → handleSend deps include messages.length so the closure updates; verify a fast second send doesn't re-trigger ensureThreadExists for an already-created thread (createMemoryThread is idempotent via swallowed error)
- (high) Send while offline / Mastra /chat unreachable → Stream enters error state and the inline 'Sorry, there was an error' card with Try again appears (page.tsx:242-255); input was already cleared so the user must retype unless they use Try again
- (low) Question with only emoji/RTL/control chars → trim() leaves non-empty content so it sends; thread title slice(0,60) may cut a multibyte grapheme mid-codepoint

**Suspected issues:**
- page.tsx:106 — `input.length > 10_000` combined with textarea maxLength=10000 (ChatInput.tsx:97) means the guard never trips; dead/ineffective ceiling. The real cap is the maxLength attribute.
- page.tsx:108 — setInput('') runs before sendMessage resolves/awaits; if ensureThreadExists or sendMessage throws, the user's text is already gone (no restore), forcing a retype on first-message failures.


### Stop streaming  
`control` · src/app/chat/page.tsx:268 / src/lib/use-chat-thread.ts:107 · id: `stop-generation`

While a chat response is streaming, the composer action button becomes Stop and calls useChat's stop(). Deep Research mode passes onStop=undefined so no stop button shows.

**Acceptance criteria:**
- During streaming (isLoading), the Ask button is replaced by a Stop button (data-testid=stop-button).
- Clicking Stop halts the stream; status leaves streaming and the partial assistant text remains visible.
- In Deep Research mode the Stop button never appears (onStop undefined at page.tsx:268).

**Edge cases:**
- (high) Stop clicked then user switches threads before status settles → A stopped stream is NOT 'streaming→ready', so it is never cached (use-chat-thread.ts:137); switching away may lose the partial response since only the DB snapshot reloads
- (medium) Stop clicked during 'submitted' (before first chunk) → isLoading is true during submitted, so Stop is shown; clicking should abort the request cleanly with no partial assistant bubble lingering
- (medium) Stop then immediately Ask again → New send proceeds normally; verify the aborted request doesn't leak a late chunk into the new stream

**Suspected issues:**
- use-chat-thread.ts:137 — message caching is gated strictly on prevStatus==='streaming' && status==='ready'. A stopped stream typically transitions streaming→ready as well in ai-sdk, but if stop() yields streaming→error or a different terminal status, the partial answer is not cached and is lost on thread switch.


### Stream error card + Try again  
`state` · src/app/chat/page.tsx:242-255 · id: `error-retry`

When the chat stream errors, an inline destructive-styled card appears below the timeline with an apology and a 'Try again' button that calls regenerate().

**Acceptance criteria:**
- On stream error, a card reading 'Sorry, there was an error processing your question.' with a 'Try again' button renders (data-testid=assistant-message).
- Clicking 'Try again' calls regenerate() and re-attempts the last turn.
- The card only shows when `error` is truthy and is not shown in Deep Research mode (it's inside the non-deep branch).

**Edge cases:**
- (medium) Error occurs on the very first message of an uncreated thread → regenerate() must have a last user message to re-run; verify Try again works when the thread was only lazily created and the error happened before persistence
- (medium) Repeated errors (backend down) → Each Try again re-errors and re-shows the card; no infinite auto-retry loop, no duplicate stacked error cards
- (medium) Error then user types a new question → Sending a new message should clear/replace the error state; verify the stale error card disappears once a new stream starts
- (low) Error message contains sensitive backend detail → Only the generic message is shown to the user; raw error is console.error only (use-chat-thread.ts:111,143)


### Select an existing thread  
`workflow` · src/lib/use-chat-thread.ts:186-204 · id: `thread-select`

handleSelectThread switches the active thread: sets activeThreadRef + threadId, resets per-thread UI state (onThreadSwitch), closes the mobile sidebar, then either restores from the in-memory cache or loads persisted messages from Mastra memory. Guards against stale loadThread responses.

**Acceptance criteria:**
- Clicking a thread in the sidebar swaps the timeline to that thread's messages.
- If the thread was recently completed and cached, its full messages restore instantly (pendingRestore path) and the cache entry is consumed (deleted).
- If not cached, loadThread fetches from Mastra memory, converts each persisted message, and sets them; feedback for that thread is then loaded.
- Switching threads resets feedback and answer-version client state (onThreadSwitch → resetFeedback + resetVersions, page.tsx:59-62).
- On mobile, selecting a thread closes the sidebar overlay (closeMobileSidebar) and focus returns to the input.

**Edge cases:**
- (high) Slow loadThread for thread A, user clicks thread B before A resolves → activeThreadRef guard (use-chat-thread.ts:167) drops A's stale response so B's messages are not overwritten
- (medium) loadThread throws (network/parse failure) → catch sets messages to [] only if still the active thread (use-chat-thread.ts:182); user sees an empty timeline rather than a crash, with error in console
- (medium) Selecting the currently-active thread again → Re-selecting same thread re-runs setThreadId/onThreadSwitch and reloads — verify it doesn't wipe an in-progress stream or flicker
- (medium) Persisted messages in unknown/legacy format → convertThreadMessageToUIMessage returns null for unparseable messages and they are skipped (parse-message.ts:57,88); thread shows only convertible messages
- (low) Thread with persisted message missing an id → A fallback UUID is generated and a console.warn fires that feedback won't survive reload (parse-message.ts:67-71); verify thread still renders
- (low) Cached entry exists but is empty array → Code checks `cached && cached.length > 0` (use-chat-thread.ts:195) so empty cache falls through to loadThread — correct
- (high) Select thread while a different thread is mid-stream → Switching mid-stream changes threadId, which recreates the transport+useChat instance (id depends on threadId:resourceId); verify the in-flight stream is abandoned cleanly and doesn't write into the newly selected thread

**Suspected issues:**
- use-chat-thread.ts:120-126 — pendingRestore is applied in an effect keyed on [threadId, setMessages]. If two rapid thread selects both target a cached thread, the second overwrites pendingRestore before the first effect runs, and the cache delete at line 196 already removed the first entry; rapid switching between two cached threads could restore the wrong/last one.
- use-chat-thread.ts:186 — onThreadSwitch + closeMobileSidebar run before the await loadThread; feedback reset happens immediately but loadThreadFeedback runs after the messages load, a window where stale feedback is cleared but new not yet present (visually fine, but a race tester should confirm).


### Start a new conversation (+ New)  
`workflow` · src/lib/use-chat-thread.ts:206-222 · id: `new-thread`

handleNewThread: if the current thread is already empty it just closes the mobile sidebar and focuses input (no new id). Otherwise it generates a new threadId, clears messages, resets per-thread state, and closes the sidebar. The thread is NOT created in the backend until the first message is sent.

**Acceptance criteria:**
- Clicking + New on a non-empty thread clears the timeline to the empty-state and gives the composer a fresh threadId.
- Clicking + New when already on an empty new thread is a no-op for state (no new id generated, no flicker) but still focuses input and closes mobile sidebar.
- No empty 'New conversation' thread is created in the sidebar on + New — creation is lazy on first send (use-chat-thread.ts:218-220).
- Per-thread UI state (feedback, versions) resets on + New via onThreadSwitch.

**Edge cases:**
- (high) + New clicked while a stream is in progress → messages.length > 0 so a new id is generated and setMessages([]) clears the view; the in-flight stream's useChat instance is replaced — verify the abandoned stream does not write into the new empty thread
- (medium) + New then immediately type and send → ensureThreadExists creates the thread with the question title; verify no duplicate or 'New conversation'-titled empty thread appears
- (low) Repeated + New clicks on empty thread → Each is a no-op (early return at use-chat-thread.ts:207); threadId stays stable so no churn of empty threads
- (medium) + New after stopping a stream (partial message present) → messages.length > 0 path runs and clears; the stopped partial is dropped unless it was cached

**Suspected issues:**
- use-chat-thread.ts:206 — handleNewThread is async but performs no awaits; the async keyword is superfluous (minor).


### Per-thread message cache (switch-away-and-back)  
`state` · src/lib/use-chat-thread.ts:80-146 · id: `message-cache-restore`

When a stream completes (streaming→ready), the full message array is cached per threadId. Switching back to that thread restores the cache instead of the possibly-still-writing DB snapshot, then deletes the cache entry. Bridges savePerStep's async DB writes.

**Acceptance criteria:**
- After a response completes, switching to another thread and back shows the COMPLETE response (not a partial DB snapshot).
- Cache entry is consumed on restore (deleted at line 196) so a subsequent re-select reloads from DB.
- threadVersion increments on onFinish (line 110) to refresh the sidebar.

**Edge cases:**
- (high) Complete a stream, switch away, switch back, switch away again → First return uses cache (then deletes it); second return must hit loadThread (DB) — verify DB has by then persisted the full response, otherwise the second view could be partial
- (high) DB write lags behind cache deletion → Potential stale/partial display on the second visit if savePerStep hasn't flushed; tester should verify timing on slow DB
- (medium) Memory growth from cache over a long session → Cache is a Map keyed by threadId that only deletes on restore; threads completed but never revisited accumulate unbounded in memory
- (low) Cache populated for thread, then + New generates a fresh id that never collides → generateUUID collisions are effectively impossible; cache keys stay distinct

**Suspected issues:**
- use-chat-thread.ts:82,138 — messageCache entries are only ever removed on a successful restore (line 196). Threads that complete but are never re-selected leave their full message arrays cached for the life of the page — a slow memory leak on long sessions with many conversations.
- use-chat-thread.ts:122 — console.log on every restore; combined with the verbose status/loadThread logs (lines 135,139,177,188), production console is noisy and may leak thread-id prefixes.


### Regenerate / rerun an answer  
`control` · src/app/chat/page.tsx:119-121 / use-chat-thread.ts:107(regenerate) · id: `regenerate-rerun`

handleRerun delegates to useAnswerVersions.rerunAnswer with the current messages, regenerate fn, and indices, producing an alternate answer version. regenerate() is also used directly by the error Try again button.

**Acceptance criteria:**
- Triggering rerun on an assistant message re-runs the model for that turn and surfaces an alternate version selectable in the UI.
- regenerate() from the error card re-attempts the last turn.
- Rerun does not corrupt the visible message ordering.

**Edge cases:**
- (medium) Rerun while another stream is active → Verify rerun is blocked or queued; concurrent regenerate + active stream could interleave parts
- (medium) Rerun on a restored (DB-loaded) thread where indices may differ from streaming layout → messageIndex/userIndex must map to the converted parts; mismatch could regenerate the wrong turn
- (low) Rerun after thread switch resets versions → onThreadSwitch resetVersions clears archived versions; rerun on the new thread starts fresh


### Deep Research mode toggle  
`control` · src/app/chat/page.tsx:91,219,266-271 / ChatInput.tsx:52-69 · id: `deep-research-mode-toggle`

A toggle above the composer switches between streaming chat and Deep Research mode. In deep mode the timeline is replaced by DeepResearchView, the placeholder changes, Stop is disabled, and Ask routes to deepResearch.start.

**Acceptance criteria:**
- Toggling Deep Research on flips the pill to 'Deep Research on' (aria-pressed=true) and the composer placeholder to 'Describe a topic to research in depth…'.
- In deep mode the main area renders DeepResearchView and hides the chat MessageList/EmptyState/error card.
- In deep mode, isLoading reflects deepResearch.isBusy and no Stop button shows.
- Sending in deep mode calls deepResearch.start(question) and does not create a chat thread.

**Edge cases:**
- (medium) Toggle to deep mode mid chat-stream → The chat stream continues underneath but is hidden; verify toggling back shows the still-streaming/completed chat correctly and the hidden stream isn't double-counted in isLoading
- (high) Toggle off deep mode while a research workflow is busy → Switching back to chat while deepResearch.isBusy — verify the research run isn't orphaned and the composer loading state is consistent
- (low) Send in deep mode with empty/whitespace topic → trim() guard at handleSend blocks empty send before deepResearch.start
- (medium) Toggle deep mode then + New / select thread → deepMode is independent of thread state and stays on; verify the user isn't confused by a chat thread selection having no visible effect while in deep mode

**Suspected issues:**
- page.tsx:91,271 — deepMode is local component state with no reset on thread switch; selecting a chat thread while deep mode is on silently does nothing visible (DeepResearchView still shown), a likely user-confusion path.


### Sidebar collapse/expand (desktop, persisted)  
`control` · src/lib/use-sidebar-state.ts:26-38 / page.tsx:186-195 · id: `sidebar-toggle-desktop`

The masthead toggle button collapses/expands the thread sidebar. On desktop the sidebar animates width 280px↔0. The collapsed state persists to localStorage under 'sidebar-collapsed' for explicit toggles.

**Acceptance criteria:**
- Clicking the toggle button collapses an open sidebar and expands a collapsed one (desktop: md:w-0 ↔ md:w-[280px]).
- The toggle's aria-expanded reflects !sidebarCollapsed and aria-label switches between 'Open sidebar'/'Close sidebar'; icon swaps PanelLeftOpen/PanelLeftClose.
- Explicit toggle persists to localStorage so the choice survives reload (desktop).
- Collapsed sidebar is inert and aria-hidden so its contents aren't tabbable (page.tsx:152-153).

**Edge cases:**
- (medium) localStorage unavailable (private mode/quota) → setItem in toggleSidebar (use-sidebar-state.ts:35) can throw; there is no try/catch so a localStorage exception would break the toggle handler
- (low) Persisted value 'true' on a desktop reload → Initial state reads localStorage only when innerWidth >= 768 (use-sidebar-state.ts:26-30); on desktop the persisted collapsed value is honored
- (medium) SSR/first paint (window undefined) → Initializer returns true (collapsed) on the server, then hydrates from localStorage/innerWidth on the client — verify no hydration mismatch warning
- (low) Corrupt localStorage value (not 'true'/'false') → Anything !== 'true' is treated as expanded; benign

**Suspected issues:**
- use-sidebar-state.ts:35,51 — localStorage.setItem is unguarded; a SecurityError/QuotaExceededError (Safari private mode, storage disabled) throws inside the click/keydown handler and breaks sidebar toggling entirely.


### Sidebar mobile overlay + focus management + Escape  
`feature` · src/lib/use-sidebar-state.ts:40-79 / page.tsx:149-181 · id: `sidebar-mobile-overlay`

On mobile the sidebar is a fixed overlay with a backdrop. Opening moves focus to the first focusable sidebar element; closing returns focus to the toggle. Escape closes the overlay (and persists collapsed). Backdrop click and thread selection also close it (closeMobileSidebar, not persisted). Main content goes inert while the overlay is open.

**Acceptance criteria:**
- On mobile (<768px) the sidebar slides in as an overlay (translate-x) with a dim backdrop (page.tsx:172-177).
- Opening the mobile sidebar moves focus to the first focusable element inside it (use-sidebar-state.ts:70-75).
- Closing returns focus to the toggle button (use-sidebar-state.ts:78).
- Pressing Escape while the mobile overlay is open closes it and persists collapsed=true.
- Clicking the backdrop closes the overlay (toggleSidebar at page.tsx:176).
- Selecting a thread auto-closes the overlay WITHOUT persisting (closeMobileSidebar, line 41-43).
- Main chat area is inert while the mobile overlay is open so background isn't tabbable (page.tsx:181).

**Edge cases:**
- (low) Escape pressed on desktop → Escape listener only attaches when isMobile && !collapsed (use-sidebar-state.ts:46); on desktop Escape does nothing to the sidebar
- (medium) Resize from mobile to desktop while overlay open → isMobile flips; the focus-restore effect's previousSidebarCollapsedRef logic must not steal focus or leave inert stuck — verify main content becomes interactive (inert is isMobile && !collapsed)
- (low) Backdrop click uses toggleSidebar (persists) but thread-select uses closeMobileSidebar (no persist) → Backdrop-close persists collapsed; thread-select-close does not — verify this intended asymmetry doesn't surprise (reopening behavior differs)
- (low) Sidebar has no focusable element when opened → firstFocusable?.focus() is optional-chained (use-sidebar-state.ts:75); focus simply isn't moved, no crash
- (medium) Open overlay, rotate device / soft-keyboard resize → matchMedia change may toggle isMobile; verify overlay/inert state stays consistent and focus isn't lost to body
- (low) Rapid open/close before focus effect runs → previousValue===sidebarCollapsed guard (use-sidebar-state.ts:68) prevents redundant focus moves

**Suspected issues:**
- use-sidebar-state.ts:59-79 — the focus-restore effect runs on every isMobile/sidebarCollapsed change and queries the DOM; on the transition where previousValue was null (first mobile render) it correctly skips, but a mobile→desktop→mobile flip path with an open sidebar is worth a focus-trap/escape test.
- page.tsx:172 — backdrop onClick={toggleSidebar} persists collapsed, whereas every other mobile-close path (Escape persists, thread-select does not). Inconsistent persistence semantics across the three close affordances.


### Responsive breakpoint detection (useIsMobile)  
`state` · src/lib/use-is-mobile.ts:5-25 · id: `use-is-mobile`

useSyncExternalStore over matchMedia(max-width:767px). Drives sidebar overlay vs in-flow, inert wiring, ChatInput Enter-to-send behavior, and DeepResearchView layout decisions.

**Acceptance criteria:**
- Returns false during SSR and initial server snapshot (getServerSnapshot).
- Returns true when viewport width < 768px and updates live on resize/orientation change.
- Crossing the 768px boundary re-renders consumers (sidebar mode flips, ChatInput Enter behavior flips).

**Edge cases:**
- (medium) SSR hydration at a mobile width → Server snapshot returns false then client corrects to true on mount; verify no layout flash or hydration mismatch on phones
- (low) Width exactly 768px → Query is max-width:767px so 768 is NOT mobile (desktop); boundary is off-by-one-safe
- (low) Browser without matchMedia change events (very old) → addEventListener('change') is used; ancient browsers lacking it would silently not update — acceptable for target browsers


### Pinned auto-scroll of the timeline  
`feature` · src/lib/use-pinned-scroll.ts:24-66 · id: `pinned-scroll`

Discovers the ScrollArea viewport via the messagesEndRef ancestor, tracks whether the user is pinned within 100px of the bottom, and auto-scrolls to bottom on new messages/stream chunks only while pinned. Exposes viewport as state so ScrollToBottom re-subscribes when it appears.

**Acceptance criteria:**
- New messages/stream chunks auto-scroll the viewport to the bottom while the user is pinned (within 100px of bottom).
- Scrolling up more than 100px suspends auto-follow so the user can read earlier content without being yanked down.
- Scrolling back to within 100px re-enables follow.
- The viewport is discovered once it exists and exposed as state so ScrollToBottom attaches its scroll listener.

**Edge cases:**
- (high) Very long streaming response, user scrolls up mid-stream → pinnedRef goes false on scroll; subsequent chunks do NOT force-scroll (use-pinned-scroll.ts:61)
- (medium) messagesEndRef never resolves a scroll-area-viewport ancestor → viewport stays null; no auto-scroll and ScrollToBottom never shows — verify the data-slot selector matches the rendered ScrollArea
- (medium) Thread switch replaces messages while scrolled up → messages change re-triggers the follow effect; if pinnedRef is still false from prior reading, the new thread may NOT scroll to bottom — user could land mid-thread
- (low) Rapid chunk arrival → scrollTo behavior:'auto' avoids competing smooth animations; verify no jank or scroll fighting
- (low) Content shorter than viewport → scrollHeight - scrollTop - clientHeight < 100 stays true (pinned); auto-scroll is a no-op, ScrollToBottom hidden

**Suspected issues:**
- use-pinned-scroll.ts:60-63 — the follow effect reads pinnedRef.current (a ref, not a dep) keyed on [messages,status,viewport]. After a thread switch, if the user had scrolled up (pinnedRef false), the new thread won't auto-scroll to the latest message; a tester should confirm thread-switch lands at the newest message.


### Scroll-to-bottom floating button  
`control` · src/components/ScrollToBottom.tsx:28-50 / page.tsx:260 · id: `scroll-to-bottom-button`

A floating round button that appears when the viewport is scrolled more than 100px from the bottom and there are messages; clicking smooth-scrolls to bottom. Subscribes to viewport scroll via useSyncExternalStore.

**Acceptance criteria:**
- Button appears only when scrolled >100px from bottom AND hasMessages is true (messages.length>0 || isLoading).
- Clicking smooth-scrolls the viewport to the bottom.
- Button is hidden at the bottom and when there are no messages.
- It re-subscribes when the viewport element appears (state-based, not stale ref).

**Edge cases:**
- (low) viewport is null (not yet discovered) → isAwayFromBottom returns false and subscribe is a no-op (ScrollToBottom.tsx:17,24); button hidden
- (low) isLoading true but messages empty (first submit) → hasMessages = messages.length>0 || isLoading → true; button could show during the very first submit before any content — verify it isn't briefly visible with nothing to scroll to
- (low) Click while content is still streaming and growing → Smooth-scrolls to current scrollHeight; subsequent chunks (if pinned now) continue following


### Empty-state / example prompts  
`state` · src/app/chat/page.tsx:123-126,223-225 · id: `empty-state`

When a (chat-mode) thread has no messages and isn't loading, EmptyState renders with example questions. Selecting an example fills the input and focuses it (does not auto-send).

**Acceptance criteria:**
- EmptyState shows only when messages.length===0 && !isLoading && not in deep mode.
- Clicking an example sets the input to that question and focuses the textarea (page.tsx:123-126); it does NOT send automatically.
- Once a message is sent or a thread with messages is loaded, EmptyState disappears.

**Edge cases:**
- (low) Thread is loading (isLoading) with no messages yet → EmptyState is suppressed during isLoading (page.tsx:223) so it doesn't flash before the stream/restore arrives
- (low) Select example, then edit, then send → Editing the pre-filled input works normally; send uses the edited text
- (low) loadThread returns [] for an empty/just-created thread → EmptyState reappears after load completes (isLoading false, messages empty)


### Authenticated Mastra client wiring  
`api` · src/lib/use-mastra-client.ts:13-22 / mastra-client.ts:6-11 / use-chat-thread.ts:90-105 · id: `mastra-client-auth`

useMastraClient memoizes a MastraClient that injects the WorkOS access token as a Bearer header, recreating on token change. The chat transport separately resolves a fresh token per request via getAccessToken in headers(). useMastraReady reports token availability (used by sidebar).

**Acceptance criteria:**
- All Mastra calls (createMemoryThread, getMemoryThread, /chat stream) include Authorization: Bearer <token> when a token exists.
- The client is recreated when accessToken changes (refresh) so requests use the new token.
- The chat transport resolves the token per send via getAccessToken (use-chat-thread.ts:93-95), so a refreshed token is used even without recreating the client.
- When no token is present, requests go out without an Authorization header (transport returns {}).

**Edge cases:**
- (high) Token null on initial render before WorkOS resolves → createMastraClient(undefined) → no auth header; ThreadSidebar gates on useMastraReady so it won't fetch until ready, but useChatThread's transport could send unauthenticated if user sends before token loads
- (high) Token expires between createMemoryThread and the /chat stream → Transport's per-request headers() fetches a fresh token; but createMemoryThread used the memoized client's possibly-stale token — first-message thread creation could 401 while the stream succeeds, or vice versa
- (medium) getAccessToken rejects/throws → transport headers() awaits getAccessToken with no try/catch (use-chat-thread.ts:93); a throw would reject the send and surface as a stream error
- (high) NEXT_PUBLIC_MASTRA_URL unset → Falls back to http://localhost:4111 (both mastra-client.ts:3 and use-chat-thread.ts:11); in prod a missing env var silently points the client at localhost
- (medium) credentials:'include' cross-origin to Mastra → Transport sends cookies (use-chat-thread.ts:92); verify Mastra CORS allows credentials for the deployed origin or requests fail

**Suspected issues:**
- use-chat-thread.ts:11 & mastra-client.ts:3 — two independent definitions of MASTRA_URL with the same localhost fallback; in production a missing NEXT_PUBLIC_MASTRA_URL silently targets localhost:4111 with no warning. High-impact misconfiguration risk.
- Token freshness asymmetry: ensureThreadExists (use-mastra-client memoized token) vs the /chat transport (per-request getAccessToken). On token rotation these can diverge, so first-message thread creation and the stream may authenticate with different tokens.


## Answer versions, feedback & deep research hooks

### Answer version pager (VersionNav)  
`control` · packages/web/src/lib/use-answer-versions.ts:30; packages/web/src/components/VersionNav.tsx:20; packages/web/src/components/MessageList.tsx:469 · id: `version-nav-pager`

When an assistant answer has been re-run, a '< Answer N of M >' pager appears above that answer letting the user flip between the current (live) answer and earlier archived attempts. The pager only renders when more than one version exists for that user message.

**Acceptance criteria:**
- No pager (data-testid=version-nav) is shown for an assistant answer that has never been re-run (total === 1).
- After one re-run of an answer, the pager appears showing 'Answer 2 of 2' with the new live answer displayed.
- After K re-runs, the pager reads 'Answer K+1 of K+1' and exposes K+1 navigable slots (oldest archived at slot 1, live at the last slot).
- Clicking 'Previous answer' decrements the indicator and swaps the rendered AssistantMessage to the corresponding archived version's content.
- Clicking 'Next answer' increments the indicator; reaching the last slot shows the live answer again.
- Previous button is disabled at 'Answer 1 of M'; Next button is disabled at 'Answer M of M'.
- Hovering the pager shows the title tooltip 'Earlier answers are kept only for this session'.
- The version indicator has aria-live=polite so selection is announced to screen readers.

**Edge cases:**
- (low) User re-runs the same answer many times in one thread → All prior versions remain navigable; archived array grows unbounded with no cap or pruning
- (medium) User is viewing an archived version (active < total) and then triggers another re-run → handleRerun deletes the activeVersion key so the UI jumps to the new live answer; the previously-viewed archived slot is no longer selected
- (medium) Thread is switched while viewing a non-live version → resetVersions clears both archivedVersions and activeVersion; new thread shows no pager
- (low) selectVersion called with a version number out of range (e.g. >total) → MessageList falls back to live (displayMsg = msg) via `archived[active-1] ?? msg`; pager would show an impossible indicator but not crash
- (medium) Page reload after re-runs → Archived versions are NOT persisted; pager disappears and only the live answer remains (documented behavior)

**Suspected issues:**
- use-answer-versions.ts:64-67 — archivedVersions grows without bound across repeated re-runs of the same message; large UIMessage snapshots (full parts/citations) accumulate in memory with no cap.
- MessageList.tsx:446 — active version is keyed only by parentUserId (nearest preceding user message). If two assistant messages share the same preceding user message id (should not happen, but possible after edits), they would share version state.


### Re-run answer (archive + regenerate)  
`workflow` · packages/web/src/lib/use-answer-versions.ts:56; packages/web/src/app/chat/page.tsx:119; packages/web/src/components/MessageActions.tsx:108 · id: `rerun-answer`

The re-run (RotateCcw) action on an assistant message archives the current live answer, jumps the pager to the (incoming) live slot, and calls useChat's regenerate() to produce a fresh answer in place for the same user question.

**Acceptance criteria:**
- Clicking the re-run button (aria-label 'Re-run query') on an assistant answer triggers a new generation for the same preceding user question.
- The previous answer text is preserved and reachable via the version pager after regeneration completes.
- After re-run is clicked, activeVersion for that user message is cleared so the UI follows the new live answer.
- Re-run is a no-op (returns early) if the resolved messageIndex is not an assistant message or userIndex is not a user message.
- The regenerate call targets the archived assistant message's id (regenerate({ messageId: assistantMsg.id })).

**Edge cases:**
- (high) Re-run clicked while a generation is already streaming → Behavior depends on useChat.regenerate; risk of archiving a partial/in-progress live answer or double-submit; needs verification
- (medium) messageIndex/userIndex point at stale indices because messages array changed between render and click → Guard at line 59 rejects mismatched roles and returns without archiving
- (medium) regenerate() fails or backend errors after archive already committed → Archived snapshot remains; live answer may show error state; pager still shows 'Answer N of N' but live slot has no valid content
- (low) Re-run on the very first assistant message with no preceding user message → userIndex resolution must yield a user message; if not, early return prevents archiving
- (medium) Rapid double-click on re-run → Two snapshots could be archived; second snapshot may capture the not-yet-replaced live answer (duplicate version)

**Suspected issues:**
- use-answer-versions.ts:76 — regenerate() is fired immediately after setArchivedVersions/setActiveVersion; there is no guard preventing re-run while status is 'streaming'/'submitted', so a partial answer could be archived (chat/page.tsx:119 passes through without checking isStreaming).


### Thumbs up/down rating with optimistic update  
`control` · packages/web/src/lib/use-feedback.ts:67; packages/web/src/components/MessageActions.tsx:117; packages/web/src/lib/feedback-client.ts:11 · id: `feedback-thumbs-rate`

Each assistant message exposes thumbs-up / thumbs-down buttons. Clicking optimistically sets the rating and POSTs to /feedback; on success the server-assigned id replaces the optimistic id. On any failure (including missing auth token) the optimistic change reverts.

**Acceptance criteria:**
- Clicking thumbs-up sets the up button to its active (emerald) style immediately, before the network round-trip.
- Clicking thumbs-down sets the down button to its active (red) style immediately.
- A successful POST /feedback reconciles the entry's id from the response (result.id) without changing the visible rating.
- Switching from up to down (or vice versa) replaces the rating; only one rating is active at a time.
- Clicking the already-active rating clears it (calls handleClearRating, DELETE /feedback/{id}).
- On submit failure with a prior entry present, the previous entry is restored; with no prior entry, the optimistic entry is removed entirely.
- Rating requires authentication: a null/undefined access token throws 'Not authenticated' and reverts the optimistic change.

**Edge cases:**
- (high) User rates then immediately clears (or re-rates) before the first POST resolves → Race: the clear/re-rate may run with optimistic id === messageId (server id not yet known) → DELETE /feedback/{messageId} hits a non-existent id and throws, reverting
- (medium) Access token absent at click time → submitFeedback never called; throw 'Not authenticated' caught, optimistic rating reverted to prior state
- (medium) POST returns non-2xx (e.g. 401/403/500) → feedback-client throws 'Feedback submit failed: <status>'; optimistic change reverts
- (medium) Network failure / fetch rejects mid-submit → catch reverts to prev (or removes new entry)
- (high) Rapid toggle up→down→up before responses resolve → Multiple in-flight POSTs; final reconciled id depends on resolution order; stale closure of feedbackMap may capture an old prev for revert
- (medium) Rating an answer in an archived (non-live) version slot → feedbackMap is keyed by msg.id; archived versions render but feedback is keyed by the live msg id passed to AssistantMessage — verify which id is rated when viewing an archived version

**Suspected issues:**
- use-feedback.ts:69 — optimistic id defaults to `prev?.id ?? messageId`; when no prior server id exists, the messageId is used as the feedback id. If handleClearRating/handleComment fire before the POST reconciles the real id, they send the messageId as the feedback id (DELETE /feedback/{messageId} or duplicate submit), which will mismatch the server record.
- use-feedback.ts:67-81 — handleRate closes over `feedbackMap` (dep array line 81) so concurrent clicks can capture a stale `prev`, causing an incorrect revert target on failure.
- use-feedback.ts:76 — reconcile does `{ ...m[messageId], id: result.id }`; if the user changed the rating while the POST was in flight, this preserves the newer rating but stamps it with the id from the older request's response (id/rating mismatch).


### Downvote comment ('What went wrong?')  
`input` · packages/web/src/lib/use-feedback.ts:97; packages/web/src/components/MessageActions.tsx:144 · id: `feedback-comment`

After a thumbs-down with no existing comment, a 'What went wrong?' text input appears. Submitting (Enter or Send button) attaches the comment to the existing down-rating feedback entry and POSTs it.

**Acceptance criteria:**
- The comment input appears only when feedback.rating === 'down' AND feedback.comment is empty/null.
- Submitting a non-empty trimmed comment optimistically sets feedback.comment and POSTs {rating:'down', comment}.
- Pressing Enter in the input submits the comment; the Send button submits the comment.
- Send button is disabled when the trimmed comment text is empty.
- After successful submit, the comment input disappears (because feedback.comment is now set).
- handleComment is a no-op if there is no existing feedback entry for that message (guard at line 99).
- On submit failure, the optimistic comment is reverted to the prior entry.

**Edge cases:**
- (low) Whitespace-only comment → handleCommentSubmit no-ops (commentText.trim() falsy); Send disabled
- (medium) Very long comment (thousands of chars) → No client-side max length enforced; full string sent to /feedback — server must bound it
- (low) User clears the down-rating while typing a comment → feedback entry removed → comment input disappears and any typed text is lost
- (high) Comment submitted before the originating rating POST reconciled its id → submitFeedback sent with prev.rating but possibly id===messageId mismatch (see feedback-thumbs-rate)
- (low) Comment with special characters / newline pasted → Single-line input strips newlines on paste; special chars JSON-encoded safely in body
- (medium) Network failure on comment submit → Optimistic comment reverts to prev (comment cleared, input reappears)

**Suspected issues:**
- use-feedback.ts:105-106 — handleComment re-submits with `rating: prev.rating`; this creates/overwrites a feedback record rather than patching, relying on server upsert semantics keyed by messageId — verify server treats repeated POSTs as upsert not duplicate insert.
- MessageActions.tsx:144 — comment box only shows for 'down' with empty comment, so there is NO UI path to add a comment to an up-rating or to EDIT an existing comment once set.


### Load existing feedback on thread open  
`state` · packages/web/src/lib/use-feedback.ts:48; packages/web/src/lib/feedback-client.ts:42; packages/web/src/app/chat/page.tsx:83 · id: `feedback-load-on-thread`

When a thread is opened, existing feedback for its messages is fetched (GET /feedback?threadId=) and hydrated into the per-message feedback map so previously rated/commented messages render in their rated state.

**Acceptance criteria:**
- Opening a thread with prior feedback renders the correct active thumb state and any comment for each rated message.
- loadFeedback never throws — failures are logged and leave the map unchanged.
- A stale response (user switched threads mid-fetch) is dropped: the map is only set if isActive() is still true after awaits.
- loadFeedback is a no-op when no access token is available (the token guard at line 51 skips the fetch).
- The fetched feedback array is keyed by messageId into the map.

**Edge cases:**
- (high) User switches threads while a feedback fetch is in flight → isActive() returns false → stale thread's feedback does not overwrite the newer thread's map
- (medium) GET /feedback returns malformed body (missing .feedback array) → getFeedbackByThread returns data.feedback (undefined) → `for (const entry of entries)` throws inside loadFeedback's try → caught and logged, map unchanged
- (low) Token fetch resolves null → Fetch skipped, no error
- (medium) GET returns non-2xx → feedback-client throws 'Feedback fetch failed'; caught and logged; existing optimistic map untouched
- (medium) Two threads opened in rapid succession (A then B then back to A) → Only the last-active thread's response is applied; intermediate responses dropped by isActive guard
- (low) Feedback exists for messages not currently loaded in the chat (e.g. paginated history) → Map holds entries with no matching rendered message; harmless until that message renders

**Suspected issues:**
- feedback-client.ts:53 — getFeedbackByThread returns `data.feedback` with no validation; if the server response shape changes to a bare array or different key, loadFeedback silently swallows the resulting error and shows no feedback with only a console log.


### Feedback/version reset on thread switch  
`state` · packages/web/src/lib/use-feedback.ts:46; packages/web/src/lib/use-answer-versions.ts:42; packages/web/src/app/chat/page.tsx:59 · id: `feedback-reset-on-switch`

On thread switch (or new thread), both the feedback map and answer-version state are cleared so a new thread does not show another thread's ratings, comments, or version pagers.

**Acceptance criteria:**
- Switching threads clears feedbackMap (no leftover thumbs from the prior thread before the new thread's feedback loads).
- Switching threads clears archivedVersions and activeVersion (no leftover version pagers).
- onThreadSwitch runs resetFeedback then resetVersions before/while the new thread's messages load.

**Edge cases:**
- (medium) Reset races with an in-flight loadFeedback from the new thread → resetFeedback sets {} then loadFeedback (guarded by isActive) overlays the correct thread; ordering must not clear after load
- (medium) New thread button while a feedback submit is pending on the old thread → Pending submit still reconciles into a now-cleared map, potentially re-introducing a stale entry keyed by old messageId

**Suspected issues:**
- chat/page.tsx:59 — onThreadSwitch only resets feedback/versions; an in-flight handleRate/handleComment promise for the previous thread can resolve after reset and call setFeedbackMap, re-inserting a stale entry (no per-thread isActive guard on the mutation handlers, unlike loadFeedback).


### Deep Research mode toggle  
`control` · packages/web/src/app/chat/page.tsx:91; packages/web/src/app/chat/page.tsx:270; packages/web/src/components/DeepResearchView.tsx:32 · id: `deep-research-mode-toggle`

A Deep Research toggle on the chat input switches the main pane from the streaming chat agent to the deep-research workflow surface. In deep mode, sending a question starts the research workflow instead of a normal chat turn.

**Acceptance criteria:**
- Toggling Deep Research on replaces the message list/empty state with the DeepResearchView (idle empty state when status==='idle').
- In deep mode, sending a question calls deepResearch.start(question) and does NOT send a normal chat message.
- In deep mode the input's loading state reflects deepResearch.isBusy; the Stop button (onStop) is disabled/undefined.
- Toggling deep mode off returns to the standard chat view with prior messages intact.
- The idle DeepResearchView shows the 'Deep Research' explainer and Telescope icon (data-testid=deep-research-empty).

**Edge cases:**
- (high) Toggle deep mode off while a research run is mid-flight (researching) → The DeepResearchView unmounts but the controller state and in-flight startAsync/resumeAsync promise keep running; toggling back may show stale or completed state
- (low) Toggle deep mode on/off rapidly → No crash; controller state persists across toggles since useDeepResearch lives at page level
- (medium) Switch chat thread while in deep mode → onThreadSwitch does NOT reset deepResearch state; the report/plan from a prior question persists across thread switch (likely unintended)
- (low) Send empty/whitespace question in deep mode → handleSend guard (input.trim() falsy) prevents start()
- (low) Send question >10,000 chars in deep mode → handleSend guard (input.length > 10_000) blocks; question never reaches start()

**Suspected issues:**
- chat/page.tsx:91-92 — deepResearch state is never reset on thread switch (onThreadSwitch at line 59 omits it); a completed/declined report stays visible after switching chat threads when deep mode is re-entered.
- use-deep-research.ts:196 — reset() nulls runRef and resets state but does NOT abort the in-flight startAsync/resumeAsync; a late-resolving promise still calls setStatus/setReport with no active-guard (see deep-research-lifecycle).


### Deep Research planning phase  
`workflow` · packages/web/src/lib/use-deep-research.ts:126; packages/web/src/components/DeepResearchView.tsx:56 · id: `deep-research-start-plan`

Starting deep research runs the deepResearchWorkflow which produces a research plan (brief + sub-questions) and suspends at the plan-approval gate. The UI shows a 'Planning the research…' spinner with an elapsed timer, then renders the proposed plan.

**Acceptance criteria:**
- start(question) immediately sets status 'planning', clears prior plan/report/error, and shows the planning spinner with an elapsed-time counter that ticks each second.
- On suspended status with an extractable plan, status becomes 'awaiting-approval' and the plan (brief + sub-questions) renders (data-testid=deep-research-plan).
- extractPlan resolves the plan from any of the three Mastra payload locations (suspendPayload[step], steps[step].suspendPayload, top-level suspendPayload).
- If planning returns 'success' with a result (no suspend), the report is shown directly (status 'done').
- If planning ends in any other status, status becomes 'error' with message 'Planning ended with status: <status>'.
- A thrown error during start sets status 'error' with the error message.
- The elapsed timer interval is cleared when the phase is no longer working (planning/researching).

**Edge cases:**
- (high) Workflow suspends but plan cannot be extracted (schema/version mismatch) → Neither suspended+plan nor success+result branch taken → status 'error' 'Planning ended with status: suspended'
- (medium) createRun() or startAsync rejects (backend down / 5xx / network) → catch sets status 'error' with err.message
- (medium) Plan has zero sub-questions → awaiting-approval renders an empty ordered list; Approve button enabled (excluded.size 0 !== 0) → approve with undefined edits
- (low) Very long brief or many sub-questions → Brief renders with whitespace-pre-wrap; long lists scroll within the page
- (high) User starts a new research while a previous run is still planning → start() overwrites runRef and state; the old promise may still resolve and clobber the new run's state (no guard)
- (medium) MASTRA backend returns suspended at a DIFFERENT step than plan-approval → extractPlan only checks APPROVAL_STEP; a different suspend step yields null plan → error

**Suspected issues:**
- use-deep-research.ts:138-150 — no active/run-id guard: if start() is called twice, the first startAsync resolution still runs the setPlan/setStatus branch and can overwrite the second run's state (lost-update race).
- use-deep-research.ts:122 — the elapsed ticker uses setInterval with Date.now(); now state starts at 0 so first render before start() would compute a huge elapsedMs, but start() sets now=Date.now() up front so this is mitigated only inside an active run.


### Plan sub-question include/exclude editing  
`input` · packages/web/src/components/DeepResearchView.tsx:64; packages/web/src/components/DeepResearchView.tsx:90 · id: `deep-research-plan-edit`

On the approval gate, each proposed sub-question can be toggled excluded (struck-through, dimmed) or re-included via a per-item button. Approving with some excluded passes only the kept sub-questions to the workflow.

**Acceptance criteria:**
- Clicking the X button on a sub-question marks it excluded (line-through, opacity reduced) and changes its aria-label to 'Include sub-question'.
- Clicking again re-includes it (Check icon, aria-label 'Exclude sub-question').
- Approve passes editedSubQuestions only when at least one sub-question was excluded; otherwise passes undefined (full plan).
- The Approve button is disabled when ALL sub-questions are excluded (excluded.size === plan.subQuestions.length).
- Sub-question channel badges and a 'web' badge (when useWeb) render per item.

**Edge cases:**
- (medium) Exclude every sub-question → Approve button disabled; user cannot submit an empty plan
- (low) Exclude then re-include all → approve passes undefined (treated as unedited full plan)
- (medium) Plan re-renders with a new plan while excluded set is non-empty → excluded is local component state keyed by index, NOT reset on new plan — stale indices could mark wrong items if a new plan arrives in-place
- (low) Single sub-question plan → Excluding it disables Approve (excluded.size 1 === length 1)

**Suspected issues:**
- DeepResearchView.tsx:30 — `excluded` Set is keyed by array index and is never reset when `plan` changes; if the controller could surface a second plan without remount, previously-excluded indices would apply to the wrong sub-questions. (Currently low because reset()/start() change status to clear the view, but there is no useEffect resetting `excluded` on plan change.)


### Approve plan & run research  
`workflow` · packages/web/src/lib/use-deep-research.ts:177; packages/web/src/components/DeepResearchView.tsx:112 · id: `deep-research-approve`

Approving the plan resumes the suspended workflow (resumeData {approved:true[, editedSubQuestions]}), shows a 'Researching…' phase with per-sub-question spinners and an elapsed timer, then renders the final cited report on success.

**Acceptance criteria:**
- Clicking 'Approve & research' sets status 'researching' immediately and resets the elapsed timer.
- approve() with pruned sub-questions sends {approved:true, editedSubQuestions:[...]}; with full plan sends {approved:true}.
- On resume success with a non-cancelled report, status becomes 'done' and the report renders (DeepResearchReportView).
- On resume success with report.status==='cancelled', status becomes 'cancelled'.
- On any other resume status, status 'error' with 'Research ended with status: <status>'.
- A thrown error during resume sets status 'error' with the message.
- The researching phase lists each sub-question with a spinner and shows elapsed time.

**Edge cases:**
- (high) approve() called when runRef is null (e.g. after reset or remount) → finishResume returns early (no run); status stuck at 'researching' with no progression
- (medium) resumeAsync rejects (backend timeout on a long research run) → catch sets status 'error' with message; user can retry via reset
- (medium) Research run takes minutes → Elapsed timer keeps ticking (mm ss format); no client timeout abandons the run
- (high) User navigates away / closes tab mid-research → In-flight resumeAsync lost; no resume token persisted → research result unrecoverable on return
- (medium) Approve with editedSubQuestions of length 0 (should be blocked by disabled button) → Button disabled prevents it; if bypassed, empty edited list sent (kept.length 0 !== plan length so editedSubQuestions:[] passed)

**Suspected issues:**
- use-deep-research.ts:159-161 — finishResume silently returns if runRef.current is null, leaving status frozen at 'researching' (set in approve() at line 179) with no error surfaced. After a reset()/remount the approve path can hang the UI indefinitely.
- use-deep-research.ts:163 — no active-guard; if reset() then a new start() occurs, a late resumeAsync resolution from the old run still calls setReport/setStatus.


### Cancel/decline plan  
`control` · packages/web/src/lib/use-deep-research.ts:189; packages/web/src/components/DeepResearchView.tsx:125 · id: `deep-research-decline`

Declining the proposed plan resumes the workflow with {approved:false}, which bails to a cancelled report. The UI shows the 'cancelled' state immediately and offers a 'Start over' link.

**Acceptance criteria:**
- Clicking 'Cancel' sets status 'cancelled' immediately (without flashing 'Researching…').
- decline() resumes with {approved:false}.
- The cancelled state shows 'Research was cancelled.' with a 'Start over' link that calls reset().
- reset() returns the view to idle (status 'idle', plan/report/error cleared).

**Edge cases:**
- (medium) Decline resume returns a 'success' result that is NOT cancelled → finishResume flips status to 'done' and shows the report — overriding the optimistic 'cancelled' (inconsistent with the Cancel intent)
- (medium) Decline resume rejects/errors → finishResume catch sets status 'error', overriding the optimistic 'cancelled'
- (low) runRef null at decline time → finishResume returns early; status stays 'cancelled' (acceptable here since cancel was the intent)
- (medium) User clicks Cancel then immediately Start over before resume resolves → reset() to idle; late resume resolution may set status 'done'/'error' over idle (no guard)

**Suspected issues:**
- use-deep-research.ts:189-194 — decline optimistically sets 'cancelled' but finishResume can later set 'done' (line 166) or 'error' (line 169), so a successful-but-not-cancelled backend result would surprise the user with a full report after they hit Cancel.


### Deep Research report render (citations & verification)  
`feature` · packages/web/src/lib/use-deep-research.ts:42; packages/web/src/components/DeepResearchView.tsx:179 · id: `deep-research-report`

On completion, the report (markdown, brief, corpus + web sources, verification counts, stats) is rendered. The schema mirrors the agent's deep-research output including fabricated/grounded citation counts.

**Acceptance criteria:**
- A completed report renders the report markdown and associated sources via DeepResearchReportView.
- verification may be null; UI must handle a report with no verification block.
- corpusSources and webSources arrays render (corpus links may be null).
- stats (reflectionRounds, subQuestionCount, corpusSourceCount, webSourceCount) are available for display.

**Edge cases:**
- (high) Report with fabricatedCitations > 0 → Verification surface should make fabricated/grounded counts visible so the user knows reliability (verify DeepResearchReportView renders this)
- (medium) verification === null → Report renders without a verification block; no crash
- (low) Empty reportMarkdown → Report area renders empty/placeholder without crashing
- (low) corpusSource.link === null → Source listed without a hyperlink
- (high) Report markdown contains untrusted HTML/script → Markdown renderer must sanitize; verify no XSS via report content

**Suspected issues:**
- use-deep-research.ts:6-9 — the report schema is a hand-maintained client mirror of packages/agent/src/deep-research/schemas.ts; drift between the two would silently drop fields (e.g. a new verification field) from the UI with no type error.


### Deep Research error/cancel recovery  
`state` · packages/web/src/components/DeepResearchView.tsx:157; packages/web/src/components/DeepResearchView.tsx:166 · id: `deep-research-error-retry`

Error and cancelled terminal states offer recovery links ('Try again' / 'Start over') that call controller.reset() to return to idle so the user can pose a new research question.

**Acceptance criteria:**
- Error state shows 'Deep research failed.' and the error message in monospace, plus a 'Try again' link calling reset().
- Cancelled state shows 'Research was cancelled.' and a 'Start over' link calling reset().
- reset() returns status to idle and clears plan/report/error/question.

**Edge cases:**
- (low) Error message is empty string → Only 'Deep research failed.' shown; no empty mono line (error guarded by `error &&`)
- (low) Error message contains very long/raw stack text → Mono text wraps; no layout break
- (medium) Reset clicked while a stale in-flight promise still pending → Idle shown, but late resolution can re-set status (no abort) — see lifecycle issue


### Deep Research in-flight lifecycle / abort safety  
`state` · packages/web/src/lib/use-deep-research.ts:196; packages/web/src/lib/use-deep-research.ts:107 · id: `deep-research-lifecycle-race`

The controller drives long async startAsync/resumeAsync calls with no AbortController and no per-run active guard, so reset/new-start/unmount during a run can lead to late setState overwriting current state.

**Acceptance criteria:**
- Calling reset() during planning/researching returns the UI to idle.
- Starting a new question after reset shows the new question's planning state.
- Unmounting the view (toggling deep mode off) does not crash on a late promise resolution.

**Edge cases:**
- (high) reset() then start() while old startAsync still pending → Old promise resolves and calls setPlan/setStatus, clobbering the new run; no run-id check exists
- (medium) Component unmounts (deep mode off) while resumeAsync pending → Late setState on unmounted-equivalent hook (hook lives at page level so still mounted); state mutated invisibly
- (high) Two start() calls back-to-back → runRef overwritten; first run's resolution still mutates state

**Suspected issues:**
- use-deep-research.ts:126-157 & 159-175 — neither start nor finishResume captures a local run token compared against runRef.current before calling setState; combined with reset() not aborting, this is a class of lost-update/stale-write races across all transitions.


### Corpus freshness line on empty state  
`feature` · packages/web/src/lib/use-corpus-status.ts:23; packages/web/src/components/EmptyState.tsx:74 · id: `corpus-status-freshness`

On the empty chat state, a one-time GET /corpus-status fetch (authenticated) populates a '<N> documents · last updated <date>' line. It fails silently to null so a wrong/invented freshness claim is never shown.

**Acceptance criteria:**
- On a fresh empty state with a valid token and successful fetch, the line renders document count (locale-formatted) and the last-updated date (en-US long format).
- The line is omitted entirely when corpusStatus is null or lastUpdated is null (no 'last updated null').
- The hook fetches once per mount (no polling).
- A non-2xx response, missing token, or thrown error leaves status null and omits the line.
- A stale response after unmount is ignored (active flag guard).

**Edge cases:**
- (low) GET /corpus-status returns body with non-numeric documentCount → Guard `typeof body.documentCount === 'number'` prevents setState; line omitted
- (high) lastUpdated is a malformed/invalid date string but documentCount is valid → setStatus succeeds; EmptyState does new Date(invalid).toLocaleDateString() → 'Invalid Date' shown in the freshness line
- (low) Access token unavailable → Fetch skipped, status stays null, line omitted
- (medium) Backend down / network failure → catch leaves status null, line omitted (no error UI)
- (medium) documentCount === 0 → Line renders '0 documents · last updated <date>' (0 is a valid number, passes guard)
- (low) Component unmounts before fetch resolves → active=false guard prevents setState on unmounted component
- (low) lastUpdated null but documentCount valid → corpusUpdated is null → whole line omitted even though a count exists

**Suspected issues:**
- use-corpus-status.ts:39 — only documentCount is validated as a number; lastUpdated is passed through unvalidated. EmptyState.tsx:43-49 does new Date(corpusStatus.lastUpdated).toLocaleDateString(); an invalid/garbage lastUpdated string renders the literal 'Invalid Date' in the freshness claim — directly contradicting the hook's documented goal of never showing a wrong freshness claim.
- use-corpus-status.ts:33 — uses raw fetch to ${MASTRA_URL}/corpus-status with Bearer token; on 401/expired token it silently omits the line rather than refreshing the token, so a transient auth blip permanently hides freshness for that mount (no retry).


## Transport & message parsing libs

### createMastraClient transport factory  
`api` · packages/web/src/lib/mastra-client.ts:6 · id: `mastra-client-factory`

Constructs the MastraClient used for every backend call (thread CRUD, message listing, streaming). Points at NEXT_PUBLIC_MASTRA_URL (default http://localhost:4111) and, when given a WorkOS access token, attaches an Authorization: Bearer header so the agent server can authorize the user. Every chat/sidebar action the user takes flows through this client.

**Acceptance criteria:**
- With a valid signed-in session, all Mastra requests carry Authorization: Bearer <token> and succeed against the configured backend
- When no token is supplied, the client is created with no Authorization header (anonymous) rather than a malformed/empty header
- Base URL resolves from NEXT_PUBLIC_MASTRA_URL when set, falling back to http://localhost:4111 only when the env var is absent
- A token refresh produces a new client instance (verifiable via use-mastra-client useMemo dependency) so subsequent requests use the fresh token

**Edge cases:**
- (high) NEXT_PUBLIC_MASTRA_URL unset or empty string in production build → Falls back to localhost:4111; in deployed env this silently breaks all backend calls — should surface a clear failure, not connect to localhost
- (high) Access token is expired/revoked but still present (stale) → Backend returns 401; UI must show an auth/error state rather than hanging or silently swallowing — factory itself does not validate the token
- (low) Token contains characters invalid in an HTTP header (e.g. newline injected) → Header construction should not crash; malformed token rejected by backend with 4xx
- (low) MASTRA_URL constant captured at module load — env changed after build → Value is frozen at module init; documented/expected behavior for client bundles
- (medium) accessToken is empty string '' (falsy) vs undefined → Empty string is falsy so no header attached — same as anonymous; ensure no `Bearer ` (empty) header is sent

**Suspected issues:**
- packages/web/src/lib/mastra-client.ts:3 — MASTRA_URL defaults to localhost:4111 with no production guard. If NEXT_PUBLIC_MASTRA_URL is unset in a deployed build, every backend call silently targets localhost and fails opaquely; no validation/throw exists.
- packages/web/src/lib/mastra-client.ts:9 — Bearer token is interpolated into a header with no sanitization; a token containing CR/LF would attempt header injection (mitigated by fetch, but worth a test).


### convertThreadMessageToUIMessage (V2 structured restore)  
`workflow` · packages/web/src/lib/parse-message.ts:50 · id: `convert-thread-message-v2`

Converts a persisted Mastra memory message into a UIMessage for rendering when a user reopens an existing thread. Detects MastraMessageContentV2 (format:2 with parts) and preserves structured tool-call/text/step parts so restored conversations render their tool steps and citations, not just plain text. Drives the entire 'restore an old conversation' user experience.

**Acceptance criteria:**
- Reopening a thread with stored tool calls renders the tool steps and sources (not just final text), matching a freshly-streamed answer
- Only user and assistant roles are restored; system/tool/other roles are dropped (returns null)
- Each restored message gets a stable id from storage; if storage lacks an id, a fallback UUID is generated and a console warning is logged
- A valid createdAt is attached as ISO metadata; invalid/absent dates produce no metadata (no bogus timestamp shown)

**Edge cases:**
- (medium) content has format:2 but parts is an empty array → format-2 branch is skipped (parts.length>0 guard) and falls through to legacy extractText; if that is also empty, message dropped (returns null)
- (medium) format:2 parts present but contain ONLY tool-invocation parts (no text) → convertV4PartsToV5 yields parts.length>0 so message is kept and renders tool steps even with no assistant text
- (high) format:2 parts present but all parts are unknown types (not text/tool-invocation/step-start) → convertV4PartsToV5 returns empty array → falls through to legacy extractText; if no text, message dropped — restored answer disappears
- (medium) message id missing on restore → Fallback UUID generated; console warning notes feedback won't survive reload — verify feedback UI degrades gracefully
- (low) createdAt is an invalid Date string e.g. 'not-a-date' → new Date() yields NaN time → metadata undefined; no crash, no '1970'/'Invalid Date' shown
- (low) createdAt is a far-future or epoch-0 date → Accepted as valid ISO; downstream timestamp display must handle plausibly (no validation of plausibility here)
- (medium) tool-invocation part with state !== 'result' (still in-progress when persisted) → Mapped to state 'input-available' with output undefined — verify restored in-flight tool renders without a result rather than crashing

**Suspected issues:**
- packages/web/src/lib/parse-message.ts:78 — `v2.parts.length > 0` gate means a format-2 message whose parts all convert to nothing (all unknown types) silently falls back to extractText and can vanish entirely; a tester restoring an unusual stored message could see assistant turns disappear.
- packages/web/src/lib/parse-message.ts:14 — tool-invocation conversion drops any `errorText`/error state; a persisted failed tool call (state other than 'result') is rendered as 'input-available' with no error indication, unlike live streaming which supports output-error (message-parts.ts:10).


### convertV4PartsToV5 part transformer  
`workflow` · packages/web/src/lib/parse-message.ts:8 · id: `convert-v4-parts-v5`

Internal transform mapping stored V4 message parts (text, tool-invocation, step-start) into the V5 part shapes (text, dynamic-tool, step-start) the timeline renderer expects. Determines whether restored tool calls show their inputs/outputs and step boundaries.

**Acceptance criteria:**
- A V4 tool-invocation with state 'result' becomes a dynamic-tool part with state 'output-available' carrying input (args) and output (result)
- A V4 tool-invocation with any non-'result' state becomes state 'input-available' with output undefined
- text parts pass through preserving their string text; step-start parts are preserved
- Unrecognized part types are silently omitted from the result

**Edge cases:**
- (low) text part with non-string text (e.g. number/object) → Skipped (typeof guard) — no crash, no garbage text rendered
- (medium) tool-invocation part where toolInvocation is missing/falsy → Skipped (truthiness guard) so a malformed stored tool part is dropped silently rather than throwing
- (low) tool-invocation.args or .result is undefined → input/output carried as undefined; renderer must tolerate missing input/output
- (medium) tool-invocation with state literally absent (undefined) → state !== 'result' so treated as input-available with no output — an actually-completed call missing its state field would lose its result

**Suspected issues:**
- packages/web/src/lib/parse-message.ts:23 — the only state distinguished is 'result'; any persisted error/streaming/partial state collapses to 'input-available', so restored tool failures cannot be shown as errors.


### extractText content flattener  
`api` · packages/web/src/lib/parse-message.ts:98 · id: `extract-text-legacy`

Flattens arbitrary stored message content (string, array of string/parts, or {parts} object) into plain text. Used as the legacy fallback in message restore and to derive thread titles from the first user message (thread-helpers deriveThreadTitleFromMessages).

**Acceptance criteria:**
- A plain string returns unchanged
- An array of strings and/or {text} parts is joined with blank-line separators
- An object with a parts array returns only the text-typed parts joined by blank lines
- Any other shape (null, number, object without parts) returns empty string

**Edge cases:**
- (medium) array element is an object with a `text` property that is not a string (e.g. number) → Cast assumes string; would join a non-string into the result — potential '[object]' or coercion artifact in title/text
- (low) {parts} where a part has text:'' (empty) → Filtered out by `p.text` truthiness; only non-empty text included
- (medium) deeply nested / multimodal parts (image, file) with no text → Yields empty string → message dropped in restore or no title derived; verify image-only user messages still get a usable title fallback
- (low) extremely long content string → Returned in full (truncation happens later in deriveThreadTitleFromText); no crash

**Suspected issues:**
- packages/web/src/lib/parse-message.ts:106 — `(part as { text: string }).text` and parse-message.ts:113 `Array<{type;text?}>` assume text is a string without a typeof check (unlike convertV4PartsToV5). A non-string `text` field would be joined verbatim, producing a malformed thread title or restored text.


### isToolPart tool-part classifier  
`api` · packages/web/src/lib/message-parts.ts:20 · id: `is-tool-part`

Classifies a message part as a tool invocation — either dynamic-tool or static tool-<name> — while excluding the literal 'tool-output' type. Gates whether a part renders as a ToolStep, counts toward tool-step totals, and where the 'final answer' text boundary lands in MessageList.

**Acceptance criteria:**
- dynamic-tool parts are classified as tool parts
- static parts named 'tool-getSection', 'tool-searchSections', etc. are classified as tool parts
- A part of type exactly 'tool-output' is NOT classified as a tool part
- Plain text/step-start/data-* parts are NOT classified as tool parts

**Edge cases:**
- (low) part.type is exactly 'tool-' (empty tool name) → startsWith('tool-') true and != 'tool-output' → classified as tool part; getToolName returns '' — verify ToolStep renders without breaking on empty name
- (medium) a future part type prefixed 'tool-' that is NOT a real tool (e.g. 'tool-result' from a new SDK version) → Would be misclassified as a tool invocation; only 'tool-output' is excluded — brittle to SDK part-naming changes
- (medium) part with no `type` field → Accessing .type/.startsWith would throw if type is undefined; callers assume type is always present

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:21 — the exclusion list is hard-coded to only 'tool-output'. Any other AI-SDK part type that happens to start with 'tool-' (now or after an SDK upgrade) is silently treated as a tool invocation, which would corrupt tool-step counting and the trailing-text boundary.


### getToolName extractor  
`api` · packages/web/src/lib/message-parts.ts:25 · id: `get-tool-name`

Resolves a human/tool-routing name for a part: prefers explicit toolName (dynamic-tool), else strips the 'tool-' prefix from a static type, else 'unknown'. Drives ToolStep labeling and the switch in extractMessageSources that decides how to harvest citations.

**Acceptance criteria:**
- dynamic-tool part returns its toolName verbatim
- static 'tool-getSection' returns 'getSection'
- A part with neither toolName nor a 'tool-' prefix returns 'unknown'
- Returned name matches the case keys used in extractMessageSources so sources are harvested

**Edge cases:**
- (low) static type 'tool-' with empty suffix → Returns '' — no source case matches, so no sources harvested (acceptable but silent)
- (low) toolName present but empty string → `if (part.toolName)` is falsy for '' → falls through to slice/unknown path; verify intended
- (medium) toolName casing/spelling drift from source-extraction switch keys (e.g. 'getsection') → Source case in extractMessageSources won't match → sources silently missing from panel for that tool


### getTrailingAssistantText final-answer extractor  
`feature` · packages/web/src/lib/message-parts.ts:40 · id: `get-trailing-assistant-text`

Extracts the assistant's final answer text — every text part that appears AFTER the last tool part — concatenated. This is what gets rendered as the answer body, copied to clipboard, and written into the exported Markdown. Pre-tool 'thinking' text is excluded.

**Acceptance criteria:**
- When tool parts exist, only text parts positioned after the last tool part are returned
- When no tool parts exist, all non-empty text parts are returned
- Whitespace-only text parts are skipped
- Multiple trailing text parts are concatenated in order with no separator

**Edge cases:**
- (high) assistant message with tool calls but NO text after the last tool → Returns '' → MessageList/export treat as no answer (answer skipped in export); verify a tool-only turn isn't shown as a blank answer card
- (high) interleaved text/tool/text/tool/text → Only the final text segment(s) after the last tool returned; earlier explanatory text dropped — verify that's the intended product behavior (no lost answer content)
- (medium) trailing text parts concatenated with empty separator splitting a sentence mid-token → Adjacent parts join seamlessly; verify no missing spaces between streamed chunks
- (low) msg.parts is undefined → Defaults to [] → returns ''; no crash

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:60 — trailing text parts are joined with '' (no separator). If the SDK splits a paragraph across two text parts mid-word, the rejoined answer is correct, but if parts represent separate paragraphs the blank line between them is lost (compare extractText which uses '\n\n'). Worth verifying multi-paragraph answers render with correct spacing in both UI and export.


### extractVerificationState  
`state` · packages/web/src/lib/message-parts.ts:105 · id: `extract-verification-state`

Reads the verifier's per-answer confidence/severity from streamed data-verification-rewrite / data-verification-ok parts. Returns severity, confidence (0..1), whether the answer was rewritten, issue counts, and a pureMarkerFallback flag. Drives the confidence/verification badge the user sees on each answer. Returns null when the verifier didn't run.

**Acceptance criteria:**
- A data-verification-ok part with a finite confidence and valid severity yields rewrote:false state
- A data-verification-rewrite part takes precedence over an ok part and yields rewrote:true
- Parts with non-finite confidence or invalid severity are ignored
- Returns null when no valid verification part is present (verifier disabled / empty text)
- counts are coerced so missing/NaN count fields become 0

**Edge cases:**
- (low) both data-verification-rewrite and data-verification-ok appear in the same message → rewrite wins (returns immediately on encountering rewrite); ok is ignored — verify intended precedence
- (medium) confidence present but outside 0..1 (e.g. 1.5 or -0.2) → Number.isFinite passes so it is accepted as-is; no clamping — badge could show >100% confidence
- (medium) severity valid but confidence is a numeric string '0.8' → typeof !== 'number' → confidence NaN → part skipped; a string-typed confidence silently drops verification badge
- (low) counts field is a non-object (e.g. a number or array) → coerceCounts spreads {} fallback / treats props as undefined → all counts 0; no crash
- (low) msg.parts undefined or no parts have a data field → Returns null cleanly; no verification UI shown
- (low) data-verification-ok appears before a later data-verification-rewrite → ok captured then overwritten by rewrite return; correct precedence regardless of order

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:111 — confidence is accepted whenever Number.isFinite, with no 0..1 clamp despite the type comment stating '0..1'. A backend bug emitting confidence>1 would render a malformed confidence badge.


### extractMessageSources (Sources panel data)  
`feature` · packages/web/src/lib/message-parts.ts:393 · id: `extract-message-sources`

Walks an assistant message's tool-result parts and builds the deduplicated, sorted list of policy sections/documents the agent consulted — the data behind the Sources panel users click through to verify citations. Handles getSection, searchSections, findConceptSections, getDocument, lookupPolicy, getAmendments, and resolveAnswerFrame output shapes; dedupes on normalized URL, sorts by natural section order, disambiguates colliding labels, and builds snippets.

**Acceptance criteria:**
- Every tool result that carries a URL contributes a source row with a clickable url
- Sources are deduplicated on normalized URL (+ policy + section/doc key) so surface-form URL variants collapse to one row
- Sources sort by natural section order (1.0 < 3.2.1 < 4.2.1.1 < Attachment A), with document-level entries last
- Two distinct documents that share a label get a URL-segment disambiguator appended
- Sources without a URL are excluded; snippets are ~300 chars trimmed to a word boundary
- A later duplicate carrying section text backfills a missing snippet on the existing row

**Edge cases:**
- (low) tool result object present but output is null or a non-object (e.g. a string) → Skipped via `!output || typeof output !== 'object'`; no crash
- (low) searchSections/findConceptSections returns sections as a non-array (e.g. object) → Array.isArray guard skips it; no rows added rather than throwing
- (medium) section/doc with whitespace-only or empty url → str() returns null → addSectionSource/addDocumentSource bail; row excluded
- (medium) same document appears as both a searchSections hit (no content) and a getSection read (full content) → Deduped to one row; snippet backfilled from the getSection content — verify the read snippet wins
- (low) very large tool output (hundreds of sections) → All processed and deduped; performance acceptable; sort/disambiguate O(n log n) — watch for jank on huge results
- (medium) section url is a non-http string (e.g. relative path or 'about:blank') → normalizeCitationUrl falls back to lowercased trimmed string for the key; row still rendered with a possibly-unclickable url — verify Sources panel handles non-http hrefs safely
- (high) unknown/new tool name with URL-bearing output → default case: no sources harvested → user sees an answer with citations but an empty/short Sources panel (silent gap)
- (low) sectionNumber present but non-dotted/garbage (e.g. 'foo bar') → compareSectionNumbers falls back to localeCompare; sorts deterministically without crashing

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:404 — the source-extraction switch is keyed on an exact, hard-coded tool-name allowlist. If the agent adds or renames a URL-bearing tool (or getToolName returns a slightly different casing), citations from that tool silently never appear in the Sources panel — a verifiability gap for legal-aid users with no visible error.
- packages/web/src/lib/message-parts.ts:323 — buildSnippet edge: when the first space occurs at index <= 200, it hard-cuts at SNIPPET_MAX_CHARS (300) mid-word with an ellipsis; acceptable but can split a word. Low impact.
- packages/web/src/lib/message-parts.ts:474 — extractMessageSources is recomputed on every render in MessageList without memoization at this layer (caller dependent); for long threads this re-walks all parts each render. Verify no perf regression on large conversations.


### normalizeCitationUrl  
`api` · packages/web/src/lib/message-parts.ts:186 · id: `normalize-citation-url`

Canonicalizes a citation URL (lowercases host, strips trailing slashes, drops ?attachment and ?format=pdf flags) so that surface-form variants of the same document collapse to one key. Underpins source dedupe, footnote numbering (buildSourceIndex), inline-citation-to-source matching in MessageList, and cited-vs-consulted splitting.

**Acceptance criteria:**
- Two URLs differing only by trailing slash, host case, or a ?attachment/?format=pdf flag normalize to the same string
- A non-string / null / empty / whitespace input returns null
- An unparseable URL returns the lowercased trimmed original (so it still keys consistently)
- Query params other than the two stripped flags are preserved

**Edge cases:**
- (medium) URL with a meaningful query param plus ?attachment combined (e.g. ?id=5&attachment) → Only the exact strings '?attachment'/'?format=pdf' are stripped (whole-search match); a combined query is preserved verbatim — so '?id=5&attachment' is NOT stripped, leaving a variant that won't dedupe
- (medium) ?format=pdf with different casing handled, but ?attachment with different casing (?ATTACHMENT) → '?attachment' compared case-sensitively (only format=pdf is lowercased before compare) → ?ATTACHMENT NOT stripped, fails to collapse
- (low) URL fragment (#section-3) → Fragment is dropped (not included in reconstructed string) so two links differing only by fragment collapse — verify this is intended (could merge distinct anchors)
- (low) protocol-relative or non-http scheme (mailto:, ftp:) → Parses via URL(); reconstructed with its protocol — keys consistently but may be unclickable downstream
- (low) input is a number/object → typeof !== 'string' → returns null

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:197 — the flag-strip only matches when the ENTIRE search string equals '?attachment' or (lowercased) '?format=pdf'. A DHHS URL combining ?attachment with any other param, or with different casing of ?attachment, will not collapse against its non-flagged twin, causing duplicate Sources rows and mismatched footnote numbers.
- packages/web/src/lib/message-parts.ts:193 — pathname trailing-slash strip removes the fragment entirely (URL.pathname excludes hash and hash is never re-added); distinct in-page anchors on the same PDF/doc would dedupe to one source.


### buildSourceIndex (footnote numbering)  
`feature` · packages/web/src/lib/message-parts.ts:209 · id: `build-source-index`

Builds a normalizedUrl → 1-indexed source number map so inline markdown citations in the answer body get a footnote superscript matching the Sources-panel row. First occurrence of a URL wins the number.

**Acceptance criteria:**
- Each unique normalized URL maps to its 1-based position in the ordered sources list
- The first source carrying a given normalized URL claims the number; later duplicates are ignored
- Sources whose URL normalizes to null are omitted from the map
- Numbers align with what the Sources panel renders for the same ordered list

**Edge cases:**
- (medium) two ordered sources normalize to the same URL → Only the first index is recorded (has-check); inline citation maps to the first — verify panel doesn't show two rows that should map to one number
- (low) source.url normalizes to null → Skipped; an inline citation to that URL gets no footnote number (renders as plain label downstream)
- (low) empty sources array → Returns empty map; downstream callers produce no footnotes


### extractCitedUrls (cited vs consulted)  
`feature` · packages/web/src/lib/message-parts.ts:490 · id: `extract-cited-urls`

Scans all text parts of a message for markdown links and returns the set of normalized URLs the answer actually cites inline. Used with splitSourcesByCited so the Sources panel separates cited sources from merely-consulted search hits — central to honest 'N sources' counts for verifiability.

**Acceptance criteria:**
- Every http(s) markdown link ]( url ) in any text part contributes its normalized URL to the set
- Links inside non-text parts are ignored
- URLs are normalized so they match buildSourceIndex / Sources-panel keys
- Non-http links (relative, mailto) are not matched by the regex

**Edge cases:**
- (low) markdown link with surrounding whitespace inside parens `]( https://x )` → Regex allows optional whitespace around the URL; matched and trimmed
- (medium) URL containing a closing paren (e.g. Wikipedia '..._(disambiguation)') → Regex `[^)\s]+` stops at the first ')', truncating the URL → wrong/partial cited URL; would fail to match its Sources row
- (low) bare/autolink URL not in markdown link syntax → Not matched (only ]( ) form) → counted as consulted not cited even though it's in the text
- (low) image markdown ![alt](url) → MARKDOWN_LINK_URL_RE matches the ](url) regardless of leading '!', so an image URL would be treated as a citation — unlikely in answers but possible
- (low) duplicate identical links in text → Set dedupes to one entry

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:482 — MARKDOWN_LINK_URL_RE uses `[^)\s]+`, so any cited URL that legitimately contains a ')' is truncated at the paren and won't normalize-match its Sources row, dropping it from the 'cited' group and skewing the cited count.
- packages/web/src/lib/message-parts.ts:482 — the regex matches only the `](url)` tail, so it also matches image embeds `![alt](url)`; an image link would be miscounted as a cited source.


### splitSourcesByCited  
`feature` · packages/web/src/lib/message-parts.ts:507 · id: `split-sources-by-cited`

Reorders the source list cited-first (preserving natural order within each group) and returns the count of cited sources, so the Sources panel can render 'Cited' / 'Consulted' group headers with continuous footnote numbering.

**Acceptance criteria:**
- Sources whose normalized URL is in the cited set come first, others after, each group keeping input order
- citedCount equals the number of cited sources
- A source whose URL normalizes to null is always placed in the consulted group
- Footnote numbers (from buildSourceIndex over the returned ordered list) stay continuous across the boundary

**Edge cases:**
- (low) all sources cited → ordered unchanged, citedCount === sources.length
- (medium) no sources cited (answer has no inline links) → citedCount 0, all in consulted; panel shows only consulted group
- (low) citedUrls contains a URL not present in sources → Ignored (no matching source); no crash, no phantom row
- (low) empty sources → ordered [] and citedCount 0


### buildAnswerClipboardText (copy / export rendering)  
`feature` · packages/web/src/lib/message-parts.ts:528 · id: `build-answer-clipboard-text`

Renders an answer for the clipboard and for Markdown export: inline markdown links become 'label [n]' footnote refs and a numbered Sources list is appended. Produces the text users paste into emails/case files and the body of exported thread Markdown.

**Acceptance criteria:**
- Inline markdown links whose URL maps to a source become 'label [n]' with n matching the appended list
- Inline links whose URL has no source mapping become just their label (link syntax removed)
- A numbered 'Sources:' list is appended when orderedSources is non-empty
- Empty/whitespace answer text is returned unchanged (no Sources block appended)
- When there are no sources, the de-linked body is returned with no Sources block

**Edge cases:**
- (low) answer text is only whitespace → Returned as-is (early return), no Sources appended — verify export skips empty answers (caller trims first)
- (medium) link URL contains ')' → Replace regex `https?://[^)\s]+` truncates at paren like extractCitedUrls — footnote lookup misses and label loses its number; consistent-but-wrong with cited extraction
- (low) label contains nested brackets [a [b] c] → `\[([^\]]+)\]` stops at first ']' → malformed replacement for nested-bracket labels
- (low) same URL cited multiple times inline → Each occurrence gets the same [n]; Sources list lists it once — correct footnote reuse
- (low) source.label or url contains a newline → Appended verbatim into the Sources list, could break line alignment; unlikely from policy data
- (low) very long answer with many links → All links replaced; performance fine; output may be large for clipboard

**Suspected issues:**
- packages/web/src/lib/message-parts.ts:533 — the inline-link regex `https?://[^)\s]+` truncates URLs containing ')', so a citation with a parenthesized URL both loses its footnote number AND leaves a partial raw URL fragment in the pasted text. Same root cause as extractCitedUrls; means copy/export and the on-screen cited count can disagree for such URLs.


### formatDate (relative thread timestamps)  
`feature` · packages/web/src/lib/thread-helpers.ts:13 · id: `format-date`

Formats a thread's date for the sidebar: today → time, yesterday → 'Yesterday', within a week → weekday, else month/day. Bucketed by calendar day (not 24h windows). Used in the sidebar and as the disambiguation suffix for colliding thread titles.

**Acceptance criteria:**
- A timestamp from today renders as a localized HH:MM time
- A timestamp from the prior calendar day renders 'Yesterday' even if <24h elapsed
- 2–6 calendar days ago renders a short weekday name
- 7+ days ago renders 'Mon D'
- Undefined/empty input returns empty string

**Edge cases:**
- (low) date in the future (clock skew / future createdAt) → diffDays <= 0 branch → renders as today's time; verify a future-dated thread doesn't show a confusing label
- (medium) invalid date string → new Date('garbage') → Invalid Date; diff computation yields NaN, comparisons false-through to month/day branch which renders 'Invalid Date' — no empty-string guard for invalid (only for falsy)
- (low) exactly 7 days ago → diffDays===7 → not <7 → month/day format (not weekday); boundary correctness
- (low) DST transition day → startOfLocalDay uses local Y/M/D so DST does not shift the day bucket; verify 'Yesterday' stays correct across spring-forward
- (medium) timezone: server-rendered vs client-rendered local time mismatch → Uses local time; SSR/CSR hydration could differ for users far from server TZ — verify no hydration mismatch warning

**Suspected issues:**
- packages/web/src/lib/thread-helpers.ts:13 — only falsy dates return ''; an invalid (unparseable) date falls through to toLocaleDateString and renders 'Invalid Date' in the sidebar. No isNaN guard like parse-message has.
- packages/web/src/lib/thread-helpers.ts:26 — toLocaleTimeString/Date run on both server and client; for a user in a TZ far from the SSR server, the rendered label can differ between server HTML and client hydration, risking a React hydration mismatch.


### Thread title derivation (getThreadTitle / DisplayTitle / deriveFromText / deriveFromMessages)  
`feature` · packages/web/src/lib/thread-helpers.ts:32 · id: `thread-title-derivation`

Determines the title shown for a thread in the sidebar. Explicit user-set title wins; else a derived title (from the first user message, normalized and truncated to 60 chars); else 'New conversation'. deriveThreadTitleFromMessages picks the first user message and runs extractText through deriveThreadTitleFromText.

**Acceptance criteria:**
- A thread with a non-empty trimmed title shows that title verbatim
- A thread with only whitespace title falls back to derived or 'New conversation'
- Derived title is the first user message normalized (collapsed whitespace, trimmed) and capped at 60 chars
- A thread with no user message yields null derived title → 'New conversation'

**Edge cases:**
- (low) first user message text exactly 60 chars vs 61 chars → slice(0,60) — 60 kept whole, 61 truncated with no ellipsis; verify no awkward mid-word cut shown to user (no ellipsis added)
- (low) first user message is whitespace/empty after normalization → deriveThreadTitleFromText returns null → 'New conversation'
- (medium) first user message is multimodal/non-text (extractText returns '') → null derived → 'New conversation'; image-only first message gets no descriptive title
- (low) title is a string of only emoji or RTL text → Shown verbatim; truncation at 60 chars may split a surrogate pair / combining sequence producing a broken glyph
- (low) messages array empty → find returns undefined → null derived title

**Suspected issues:**
- packages/web/src/lib/thread-helpers.ts:57 — slice(0, 60) cuts on UTF-16 code units; a 60-char boundary landing inside a surrogate pair (emoji) or grapheme cluster produces a broken character in the sidebar title. Low impact for policy questions but possible.


### buildThreadDisplayTitles (collision disambiguation)  
`feature` · packages/web/src/lib/thread-helpers.ts:76 · id: `build-thread-display-titles`

Computes the final sidebar display title per thread, appending a date suffix to auto-derived titles that collide (e.g. three 'What is EPSDT?'). User-set titles are never rewritten even if they collide. Returns a Map keyed by thread id.

**Acceptance criteria:**
- Threads with unique titles get their raw title unchanged
- Two+ threads sharing an auto-derived title each get a '(date)' suffix
- Threads with explicit user titles are never suffixed even when they collide
- The fallback 'New conversation' title is never treated as a collision (multiple new threads stay 'New conversation')
- Every input thread id appears in the returned map

**Edge cases:**
- (medium) two colliding derived titles whose updatedAt/createdAt are both missing → formatDate returns '' → suffix falsy → both kept as raw colliding title (no disambiguation possible)
- (medium) two colliding threads updated on the SAME day → Both get the same '(HH:MM)' or '(Yesterday)' suffix → still ambiguous/identical display titles
- (medium) one user-titled and one derived thread share the same string → Only the derived one is a collision candidate; with bucket length <2 it isn't disambiguated → two identical-looking titles remain
- (low) large thread list (hundreds) → Two O(n) passes + map lookups; performance fine
- (low) duplicate thread ids in input → Map.set overwrites; last wins — verify caller never passes dupes

**Suspected issues:**
- packages/web/src/lib/thread-helpers.ts:104 — disambiguator is formatDate(updatedAt||createdAt), which for same-day collisions yields the same time/'Yesterday' suffix, so two threads asked the same question on the same day still render identical titles. The disambiguation is best-effort, not guaranteed unique.
- packages/web/src/lib/thread-helpers.ts:90 — a derived title that collides with a user-set title is not disambiguated because user-titled threads are excluded from the collider buckets; the user can see two visually identical sidebar entries.


### buildThreadMarkdown (export thread to Markdown)  
`workflow` · packages/web/src/lib/thread-helpers.ts:127 · id: `build-thread-markdown`

Renders an entire thread as a Markdown document for download/case-file use: title header, an AI-generated disclaimer, then per-message '## Question' / '## Answer' sections with citations rendered as numbered footnotes plus a Sources list. This is the user-facing export deliverable.

**Acceptance criteria:**
- Output starts with '# <title>' and the AI-generated/verify-with-NC-DHHS disclaimer line
- Each user message becomes a '## Question' block with its text; each assistant message with answer text becomes a '## Answer' block with footnoted citations and Sources list
- Messages that convert to null (non user/assistant, empty) are skipped
- Assistant messages whose trailing answer text is empty (tool-only turns) are skipped
- Empty title falls back to 'Conversation'

**Edge cases:**
- (low) thread with zero renderable messages → Output is just the title + disclaimer header, no Q/A sections — verify export of an empty thread isn't offered or produces a sensible stub
- (medium) assistant message that is tool-only (no trailing text) → getTrailingAssistantText '' → answer skipped; the question it answered may appear with no answer block — verify this doesn't produce an orphaned Question
- (medium) user message with markdown-special chars (#, *, backticks) → Inserted verbatim under '## Question'; could render as unintended Markdown formatting when the file is viewed — no escaping applied
- (medium) answer with citation URL containing ')' → Inherits buildAnswerClipboardText truncation bug — footnote number dropped / partial URL in export
- (low) very long thread (hundreds of messages) → All converted and joined; export string large but produced without crashing
- (high) raw message content in a V2 format whose parts all drop (see convert bug) → convertThreadMessageToUIMessage may return null → that turn silently omitted from the export

**Suspected issues:**
- packages/web/src/lib/thread-helpers.ts:154 — user question text is inserted into Markdown with no escaping of #, *, _, backticks, or [](); a question containing those characters renders as unintended formatting in the exported case-file document.
- packages/web/src/lib/thread-helpers.ts:144 — export reuses convertThreadMessageToUIMessage, so any message that hits the V2-all-unknown-parts drop (parse-message.ts:78) is silently missing from the exported transcript — a correctness risk for a legal case file.
- packages/web/src/lib/thread-helpers.ts:160 — tool-only assistant turns are skipped, so a turn that produced only a tool result with no prose answer leaves its preceding Question with no Answer in the export.


### generateUUID (id fallback)  
`api` · packages/web/src/lib/utils.ts:8 · id: `generate-uuid`

Generates a UUID, using crypto.randomUUID when available and falling back to a Math.random()-based v4-shaped string otherwise. Used to mint fallback message ids on restore (feedback keying) and likely elsewhere for client-side ids.

**Acceptance criteria:**
- In a modern browser/Node, returns crypto.randomUUID() (cryptographically strong v4)
- When crypto.randomUUID is unavailable, returns a syntactically valid v4-shaped UUID
- Returned value is a 36-char hyphenated UUID string

**Edge cases:**
- (low) running in an environment without crypto (very old/embedded) → Falls back to Math.random path; non-cryptographic but syntactically valid — collision risk is negligible but non-zero
- (low) crypto present but randomUUID undefined (older Safari) → Typeof guard + truthiness check on randomUUID → falls back correctly
- (low) high-volume id minting in fallback path → Math.random collisions astronomically unlikely; acceptable


### cn className merge helper  
`api` · packages/web/src/lib/utils.ts:4 · id: `cn-classnames`

Merges conditional class names via clsx and dedupes conflicting Tailwind utilities via twMerge. Used pervasively across UI components for styling.

**Acceptance criteria:**
- Combines string/array/object class inputs into one space-separated string
- Conflicting Tailwind utilities resolve to the last one (twMerge semantics)
- Falsy inputs (false/null/undefined) are omitted

**Edge cases:**
- (low) no arguments → Returns empty string; no crash
- (low) conflicting utilities e.g. cn('p-2','p-4') → Resolves to 'p-4'


### AuthKit proxy (route protection / middleware auth)  
`role` · packages/web/src/proxy.ts:4 · id: `authkit-proxy-middleware`

Next.js 16 proxy (renamed from middleware) wiring WorkOS AuthKit middleware auth. All routes require an authenticated session except the allow-listed unauthenticatedPaths (/auth/callback and /preview). The matcher excludes Next static assets, favicon, sitemap, robots. This is the gate that forces login before reaching /chat and the rest of the app.

**Acceptance criteria:**
- An unauthenticated request to /chat (or any non-allow-listed path) is redirected into the WorkOS login flow
- /auth/callback is reachable without a session so the OAuth round-trip can complete
- /preview is reachable without a session in dev (and the page itself 404s in production)
- Static assets (_next/static, _next/image), favicon.ico, sitemap.xml, robots.txt bypass the proxy and load without auth
- After successful login the originally requested protected route is served

**Edge cases:**
- (high) expired/invalid session cookie hitting a protected route → Proxy treats as unauthenticated → redirect to login, not a 500 or infinite loop
- (medium) direct request to /preview in production → Proxy allows the request (allow-listed) but the page returns 404 — confirm no dev-only component/fixtures leak in prod
- (medium) deep link to /chat?thread=... while unauthenticated → Redirect to login then return to the deep link (or at least to /chat) after auth — verify return-path handling
- (medium) request to a path that looks like an asset but isn't (e.g. /something.css route) → Matcher regex only excludes the listed prefixes/files; a non-_next .css-like route is still auth-gated — verify no unintended bypass
- (high) WorkOS auth service unreachable / errors during middleware → Graceful failure (login redirect or error page), not a hung request or unhandled 500 for every route
- (low) API/backend routes under matcher needing the token → Confirm any client→Mastra calls aren't blocked or stripped of auth by the proxy (Mastra is a separate origin, so not matched — verify)
- (low) case sensitivity / trailing slash on allow-listed paths (e.g. /preview/ or /PREVIEW) → Verify exact-match semantics of unauthenticatedPaths don't accidentally gate /preview/ or allow unexpected variants

**Suspected issues:**
- packages/web/src/proxy.ts:10 — /preview is allow-listed for unauthenticated access and relies solely on the page returning 404 in production for protection. If the production 404 guard in app/preview/page.tsx ever regresses, the dev component gallery (with fixtures) becomes publicly reachable. The middleware itself provides no environment gate.
- packages/web/src/proxy.ts:20 — the matcher excludes by literal filename/prefix; routes that aren't real static assets but resemble them are still covered, which is correct, but any future public asset (e.g. manifest.json, .well-known) is NOT excluded and would be auth-gated, potentially breaking PWA/verification flows. Worth confirming.


## Input &amp; message-rendering components

### Chat composer textarea  
`input` · packages/web/src/components/ChatInput.tsx:75-101 · id: `chat-input-textarea`

The multi-line auto-growing textarea where the user types a policy question. Auto-resizes from 1 row up to 120px max-height, then scrolls. Placeholder changes with Deep Research mode. Stays enabled during a run so the user can draft the next question.

**Acceptance criteria:**
- Typing text updates the value and the field grows in height up to a 120px cap, after which it scrolls internally (style.maxHeight=120px).
- Placeholder reads 'Ask about NC Medicaid policy…' when deepResearch is off and 'Describe a topic to research in depth…' when on.
- Field has an accessible name via the sr-only label 'Ask a policy question' (htmlFor=chat-input) and is described by the helper text (aria-describedby=chat-input-helper-text).
- Field remains editable while isLoading is true (textarea is never disabled).
- maxLength=10000 prevents entering more than 10,000 characters.

**Edge cases:**
- (medium) Paste a string longer than 10,000 chars → maxLength silently truncates to 10,000; char counter shows 10,000/10,000 with '— limit reached'
- (low) Type exactly at the 9,000 threshold → Counter appears at >=9,000 (showCounter = length >= 9000)
- (low) Paste a very long single-line token (no spaces) up to limit → Textarea scrolls internally within 120px; no layout blowout in the composer
- (medium) Clear the field after auto-grow to 120px → Height resets to auto on next onChange (height='auto' set before measuring scrollHeight)
- (high) Programmatic value change (example card / re-run sets input) without firing onChange → Height is NOT recomputed because the resize logic lives only in onChange; field may stay 1-row tall despite multi-line content
- (medium) Whitespace-only input → Send remains disabled (gated on input.trim())

**Suspected issues:**
- packages/web/src/components/ChatInput.tsx:82-86 — auto-resize runs only inside onChange. When input is set programmatically (EmptyState example card via onSelectExample, or re-run repopulating the box), the textarea height is not recalculated, so a long injected question can render in a single clipped row until the user types. The height also is not reset to 1 row after onSend clears the input externally.


### Enter-to-send keyboard behavior  
`control` · packages/web/src/components/ChatInput.tsx:87-96 · id: `chat-input-enter-to-send`

On desktop, Enter (without Shift) sends the message; Shift+Enter inserts a newline. On mobile, Enter always inserts a newline (send is button-only). IME composition Enter is ignored so CJK/Vietnamese candidate commits don't send.

**Acceptance criteria:**
- Desktop: pressing Enter with non-empty input and isLoading=false calls onSend and prevents the newline.
- Desktop: Shift+Enter inserts a newline and does NOT send.
- Mobile (viewport < 768px): Enter inserts a newline and never sends (returns early).
- Enter fired during IME composition (nativeEvent.isComposing=true) does not send.
- Enter while isLoading=true does not call onSend (gated on !isLoading), but still preventDefault's the newline.

**Edge cases:**
- (medium) Press Enter while isLoading is true → Newline is prevented (e.preventDefault runs) but onSend is NOT called — keystroke is swallowed with no visible effect
- (high) Press Enter with empty/whitespace input on desktop → onSend is called regardless of emptiness (Enter handler does NOT check input.trim(), unlike the button); relies on onSend's own guard
- (low) Resize from desktop to mobile width mid-session → useIsMobile via matchMedia updates and Enter switches to newline behavior
- (medium) IME composition commit via Enter on a CJK keyboard → Message is not sent; candidate is committed into the field
- (low) SSR / first paint before matchMedia resolves → useIsMobile getServerSnapshot returns false (desktop), so Enter-to-send is active on first client paint

**Suspected issues:**
- packages/web/src/components/ChatInput.tsx:88-95 — the Enter handler calls onSend() without checking input.trim(), so pressing Enter with whitespace-only input will fire onSend even though the Ask button is disabled in that exact state. Behavior diverges between keyboard and mouse; correctness depends entirely on the parent's onSend guarding emptiness.


### Ask (send) button  
`control` · packages/web/src/components/ChatInput.tsx:117-127 · id: `chat-input-send-button`

Primary submit button labeled 'Ask'. Disabled when loading or when input is empty/whitespace. Replaced by the Stop button while a run is active.

**Acceptance criteria:**
- Button is disabled when isLoading is true OR input.trim() is empty.
- Clicking the enabled button calls onSend.
- When isLoading is true and onStop is provided, the Ask button is replaced by a Stop button (the Ask button is not rendered).
- Button is reachable via data-testid='send-button'.

**Edge cases:**
- (medium) isLoading true but onStop NOT provided → Falls to the else branch: Ask button renders but is disabled (isLoading), so no control to stop the run
- (medium) Rapid double-click on Ask → Second click should be a no-op once isLoading flips true and button disables; depends on parent flipping isLoading synchronously
- (low) Input is only spaces/newlines → Button stays disabled (input.trim() falsy)


### Stop generating button  
`control` · packages/web/src/components/ChatInput.tsx:105-116 · id: `chat-input-stop-button`

Replaces the Ask button while a run is in progress. Clicking aborts the in-flight stream.

**Acceptance criteria:**
- Stop button is shown only when isLoading is true AND onStop is provided.
- Clicking Stop calls onStop.
- Has aria-label 'Stop generating' and data-testid='stop-button'.
- Reverts to the Ask button once isLoading becomes false.

**Edge cases:**
- (medium) Click Stop immediately at stream start before any tokens arrive → onStop aborts; UI returns to Ask state — should not leave a permanent spinner
- (medium) Stream completes naturally the instant Stop is clicked (race) → onStop is a no-op or idempotent; no error surfaced to the user
- (medium) Click Stop then immediately Ask the next question → New run starts cleanly after abort settles


### Character counter  
`state` · packages/web/src/components/ChatInput.tsx:134-146 · id: `char-counter`

Live character counter that appears only when the user nears the 10,000-char limit (>=9,000). Turns destructive-colored and shows '— limit reached' at the cap. aria-live='polite' so screen readers hear the warning.

**Acceptance criteria:**
- Counter is hidden below 9,000 chars and visible at >=9,000.
- Counter shows 'N / 10,000' with locale-formatted thousands separators.
- At >=10,000 chars the counter text is destructive-colored and appends '— limit reached'.
- Counter region is aria-live='polite' for screen-reader announcement.

**Edge cases:**
- (low) Length oscillates around 9,000 as user edits → Counter appears/disappears at the threshold; aria-live may announce repeatedly
- (medium) At exactly 10,000 chars → atLimit true → destructive color + 'limit reached'; further keystrokes are swallowed by maxLength
- (low) Locale formatting → Always uses 'en-US' grouping regardless of browser locale (hardcoded)


### Deep Research mode toggle  
`control` · packages/web/src/components/ChatInput.tsx:52-69 · id: `deep-research-toggle`

Pill toggle above the composer that switches Deep Research mode on/off. Only renders when onToggleDeepResearch is provided. Changes placeholder text and its own label/styling. aria-pressed reflects state.

**Acceptance criteria:**
- Toggle renders only when onToggleDeepResearch is provided.
- Label reads 'Deep Research on' or 'Deep Research off' matching the deepResearch prop.
- aria-pressed equals the deepResearch boolean.
- Clicking calls onToggleDeepResearch.
- When on, the composer placeholder switches to 'Describe a topic to research in depth…'.
- Reachable via data-testid='deep-research-toggle'.

**Edge cases:**
- (low) Toggle on mid-typing with existing text → Existing input text is preserved; only placeholder/label change
- (medium) Toggle while a run is in progress → Toggle is not disabled during loading; behavior of toggling mid-run depends on parent — may apply to the next query only
- (low) onToggleDeepResearch undefined → Toggle is entirely absent (no broken control)

**Suspected issues:**
- packages/web/src/components/ChatInput.tsx:52-69 — the deep-research toggle has no disabled state during isLoading, so it can be flipped mid-run; whether that affects the active stream vs only the next one is not enforced here (parent-dependent).


### AI-generated content disclaimer  
`feature` · packages/web/src/components/ChatInput.tsx:131-133 · id: `input-helper-disclaimer`

Persistent helper line under the composer: 'Answers are AI-generated from NC Medicaid policy documents. Verify critical information with DHHS.' It is the textarea's aria-description target.

**Acceptance criteria:**
- Disclaimer text is always visible beneath the composer.
- Its id (chat-input-helper-text) matches the textarea's aria-describedby.

**Edge cases:**
- (low) Print the page → Composer footer is print:hidden so the disclaimer does not print


### User message bubble  
`feature` · packages/web/src/components/MessageList.tsx:452-464 · id: `user-message-bubble`

Right-aligned filled bubble rendering the user's question. Joins all text parts, preserves line breaks (whitespace-pre-wrap) and wraps long unbreakable tokens (overflow-wrap:anywhere).

**Acceptance criteria:**
- User messages render right-aligned in a primary-colored bubble.
- Only text parts are shown; their text is concatenated.
- Manual line breaks in the user's question are preserved.
- A long pasted URL/ID wraps inside the bubble (max-width 80%) without horizontal overflow.
- Reachable via data-testid='user-message'.

**Edge cases:**
- (medium) User message has no text parts (e.g. only tool/file parts) → Empty bubble renders (join('') = '') — an empty filled block
- (low) Extremely long single-line token (no whitespace) → overflow-wrap:anywhere breaks it within the 80% bubble
- (low) Markdown/HTML in the user question → Rendered as plain text (no ReactMarkdown for user bubbles) — angle brackets shown literally, no injection
- (low) Multiple text parts on a user message → Concatenated with no separator (join(''))

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:461 — user text parts are joined with '' (no separator), while assistant restored-thread text uses '\n\n' (parse-message extractText). Multi-part user messages could run words together.


### Assistant answer markdown rendering  
`feature` · packages/web/src/components/MessageList.tsx:55-129,239-265 · id: `assistant-message-markdown`

Renders assistant answer text as markdown via ReactMarkdown with prose styling. Final-answer text uses full prose; pre-final (interleaved with tools) text uses a smaller muted 'progress' prose. A streaming cursor appears on the last visible part while streaming.

**Acceptance criteria:**
- Final answer text (after the last tool part, or all text when no tools) renders in full PROSE styling.
- Text parts before the last tool part render in the smaller muted PROSE_PROGRESS styling.
- Headings, lists, bold, blockquotes render with the configured prose classes.
- A blinking accent cursor renders after the last visible part only while isStreaming is true.
- Empty / whitespace-only text parts are filtered out (not rendered).

**Edge cases:**
- (high) Answer contains a raw <script> or HTML → ReactMarkdown does not render raw HTML by default (no rehype-raw), so HTML is escaped — no XSS
- (medium) Malformed/unterminated markdown mid-stream (e.g. partial '[text](http') → ReactMarkdown renders progressively without throwing; partial link shows as text until closed
- (medium) Very long answer with many headings/lists → Renders fully; performance acceptable (re-parses on each stream chunk)
- (low) Answer with a markdown table or code fence → Renders within prose; horizontal scroll on wide tables/code is not explicitly handled here
- (low) Cursor placement when final answer is the last part → Cursor shows on the final text block while streaming, disappears when isStreaming flips false

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:70-123 — ReactMarkdown is used without rehype-raw, so raw HTML in model output is escaped (good). Worth a QA confirmation that no rehype-raw is wired up elsewhere, since assistant text is model-controlled.


### Citation links and footnote markers  
`control` · packages/web/src/components/MessageList.tsx:72-119,210-222 · id: `citation-link-and-footnote`

Custom <a> renderer: links whose normalized URL matches a Sources-panel entry are styled as quiet citations and get a clickable superscript [n] footnote that opens the Sources panel, highlights the row, and scrolls it into view. Links with no source mapping keep the gold external-link treatment and open in a new tab.

**Acceptance criteria:**
- A link mapping to source N renders quiet (ink) styling plus a superscript [N] button with aria-label 'Jump to source N in the Sources panel'.
- A link with no source mapping renders gold and has no footnote marker.
- All links open in a new tab (target=_blank, rel=noopener noreferrer).
- Clicking the [N] footnote opens the Sources panel, highlights source N's row for ~1.8s, and smooth-scrolls it into view.
- Footnote click does not navigate (event.preventDefault).
- Footnote tap target is extended to >=24px via the ::after overlay.
- Footnotes only render in the final answer (sourceIndex/onCitationClick passed only when finalAnswer).

**Edge cases:**
- (medium) Citation [N] where N maps to a source index that no longer exists (sources[N-1] undefined) → handleCitationClick returns early (if (!source) return) — panel does not open, no crash
- (low) Link href is null/empty → normalizeCitationUrl returns null → not a citation → gold styling, no footnote
- (low) Two inline links to the same normalized URL → Both get the same footnote number (buildSourceIndex keeps first index per URL)
- (medium) Click footnote when Sources panel row element is not yet in DOM → requestAnimationFrame defers scroll; if element still missing, getElementById is null and scroll is skipped without error
- (low) URL with '?attachment' vs without in answer vs source → normalizeCitationUrl strips '?attachment' and '?format=pdf' so they collapse to the same footnote number
- (high) javascript: or data: URL in a model citation → Link href passes through unchanged to the <a> (no scheme filtering here); relies on browser + noopener — potential concern for malicious model output

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:84-95 — the <a> href is rendered verbatim from model output with no URL-scheme allowlist; a model-emitted 'javascript:' or 'data:' href would be placed directly on the anchor. ReactMarkdown's default link sanitization typically blocks javascript: but this should be explicitly QA-verified given the legal/medical trust context.
- packages/web/src/components/MessageList.tsx:217 — sourceRowId(msg.id, source.key) must match the id rendered in SourcesPanel; if SourcesPanel's row id scheme drifts, footnote scroll silently no-ops (cross-component coupling worth a QA check).


### Research trail (collapsed tool steps)  
`feature` · packages/web/src/components/MessageList.tsx:193-200,345-368 · id: `research-trail-collapse`

After a run completes with a final answer, the tool-call steps collapse into a single 'Research trail' disclosure shown below the answer with a step count. While streaming or when the run ended without an answer, the steps stay inline/expanded.

**Acceptance criteria:**
- When a completed message has tool parts AND a non-empty final answer, tool steps appear inside a collapsible 'Research trail' below the answer (collapseTrail true).
- Trail header shows 'N step' / 'N steps' (singular/plural correct).
- While streaming, tool steps render inline above the answer (no collapse).
- When the run ended without an answer, tool steps stay inline/expanded (collapseTrail false).
- Inline vs trail split is by tool index: parts after the last tool index are the inline answer; parts up to it go in the trail.
- Reachable via data-testid='research-trail' / 'research-trail-trigger' / 'research-trail-content'.

**Edge cases:**
- (low) Run with exactly one tool step → Header reads '1 step' (singular)
- (low) Run with zero tool steps → No research trail; final answer renders inline (lastToolIndex === -1)
- (medium) Final text appears BEFORE the last tool part (text-tool-text interleaving) → Only text after the last tool index counts as final answer; earlier text is treated as progress and lands in the trail
- (low) Chevron rotation indicator → Rotates 90deg when the Collapsible is open (group-data-[panel-open])


### 'Starting research...' loading indicator  
`state` · packages/web/src/components/MessageList.tsx:297-302,496-503 · id: `loading-indicator-starting`

Spinner with 'Starting research...' shown (a) inside an assistant message while streaming but before any renderable part exists, and (b) as a standalone block when status is 'submitted' and no assistant message has appeared yet.

**Acceptance criteria:**
- While streaming an assistant message with no renderable parts yet, the in-message spinner + 'Starting research...' shows.
- When status='submitted' and the last message is not an assistant message (or none), a standalone spinner block shows.
- Both are reachable via data-testid='loading-indicator'.
- Indicator disappears once a tool step or non-empty text part arrives (hasRenderableAssistantPart).

**Edge cases:**
- (medium) Two loading indicators could render simultaneously → If status='submitted' AND a streaming assistant msg with no parts exists, both blocks (lines 297 and 496) could appear; guard at 496 checks last msg role is not assistant, mitigating overlap
- (medium) Stream produces only whitespace text parts then stops → hasRenderableAssistantPart filters whitespace, so the spinner could persist until streaming flips false
- (high) Backend never responds (network hang) after submit → Spinner remains indefinitely; relies on parent timeout/abort to clear it

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:297 & 496 — two separate 'Starting research...' blocks with the same data-testid='loading-indicator'. The standalone block's guard (messages[last].role !== 'assistant') and the in-message guard (isStreaming && !hasRenderableAssistantPart) could in principle both be true if an empty assistant message is appended while status is still 'submitted', double-rendering the indicator.


### Live progress narration  
`state` · packages/web/src/components/MessageList.tsx:267-315 · id: `progress-narration`

While streaming and before final answer text arrives, shows a single spinning line derived from the last tool part: a descriptor label, summarized input, and a '· step N' counter.

**Acceptance criteria:**
- Narration shows only while isStreaming, there is a last tool part, and final answer text is still empty.
- Text is 'Label — inputSummary' when a summary exists, else just the label.
- Step counter equals the count of tool parts (toolStepCount).
- Narration hides once final answer text begins streaming.
- Long narration text truncates (truncate class) without breaking layout.
- Reachable via data-testid='progress-narration'.

**Edge cases:**
- (low) Unknown tool name → getToolDescriptor falls back to 'Researching sources' label
- (low) Tool input has no summarizable fields → summarizeToolInput returns null → narration is just the label
- (low) Very long query string in input summary → summarizeToolInput truncates query to 120 chars and the line truncates visually
- (low) Step counter while many tools queued → Counts all tool parts including not-yet-run ones, so 'step N' may jump ahead of what's visibly running


### 'Finished without a final answer' notice  
`state` · packages/web/src/components/MessageList.tsx:185-186,317-339 · id: `ended-without-answer`

When a non-streaming message has tool parts but no final answer text, an amber alert explains a transient API error likely interrupted synthesis, points to the sources below, and offers a 'Try again' button that re-runs the originating user query.

**Acceptance criteria:**
- Notice renders only when !isStreaming AND lastToolIndex !== -1 AND final answer text is empty.
- Notice has role='alert' and data-testid='ended-without-answer'.
- 'Try again' button (data-testid='try-again-button') calls handleRerun, which finds the preceding user message and calls onRerun.
- Sources panel still renders below if sources exist.
- MessageActions still renders for this state (finalAnswerText || endedWithoutAnswer).

**Edge cases:**
- (medium) No preceding user message found (assistant is first) → handleRerun returns early (userIdx === -1) — Try again is a silent no-op
- (medium) Run that legitimately produced no answer and no tools → Notice does NOT show (lastToolIndex === -1); message may render blank — gap not covered by this notice
- (medium) Try again clicked while another run is already streaming → Depends on parent onRerun guard; could collide with an in-flight stream
- (low) MessageActions clipboard for empty answer → buildAnswerClipboardText returns the empty answer unchanged (no sources appended) — copying yields empty/near-empty text

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:388-398 — MessageActions renders when endedWithoutAnswer even though finalAnswerText is empty; copying produces empty clipboard content (buildAnswerClipboardText short-circuits on !answerText.trim()), so the Copy button silently 'succeeds' on nothing.


### Generated-at timestamp  
`feature` · packages/web/src/components/MessageList.tsx:168-177,382-386 · id: `generated-at-timestamp`

On restored thread messages (which carry memory createdAt metadata), shows 'Generated <date/time>' below the answer. Absent on freshly streamed messages.

**Acceptance criteria:**
- Timestamp shows only when !isStreaming, createdAt metadata exists, and there is final answer text.
- Formatted as en-US long date + time (e.g. 'June 22, 2026, 3:04 PM').
- Reachable via data-testid='generated-at'.
- Freshly streamed messages (no metadata) show no timestamp.

**Edge cases:**
- (low) Invalid stored createdAt → convertThreadMessageToUIMessage drops invalid dates so metadata is undefined → no timestamp (no 'Invalid Date')
- (low) Restored message with tools but no final answer → Timestamp suppressed (requires finalAnswerText)
- (low) Timezone display → Renders in the viewer's local timezone via toLocaleString


### Sources panel default-open behavior  
`state` · packages/web/src/components/MessageList.tsx:201-207,370-380 · id: `sources-panel-default-open`

The Sources panel (rendered child) opens by default when the answer cites >=1 source; the user's explicit toggle overrides thereafter. Only shows when not streaming and sources exist.

**Acceptance criteria:**
- Panel renders only when !isStreaming and sources.length > 0.
- Default open state is citedCount > 0 (open when at least one cited source).
- Once the user toggles, panelOpenOverride wins over the default.
- Footnote click forces the panel open and highlights the target row.

**Edge cases:**
- (low) Sources consulted but none cited (citedCount=0) → Panel renders collapsed by default (citedCount>0 false)
- (low) User collapses panel, then clicks a footnote → handleCitationClick forces setPanelOpen(true), overriding the collapse
- (low) Panel state persistence across version switches → panelOpenOverride is component state in AssistantMessage; switching displayed version remounts content — state reset behavior should be verified


### Answer version navigation  
`workflow` · packages/web/src/components/MessageList.tsx:420-433,446-477 · id: `version-nav`

When a user has re-run a question (creating archived earlier answers), a VersionNav appears above the assistant message letting the user page between versions. The displayed message swaps to the selected archived version or the live latest.

**Acceptance criteria:**
- VersionNav shows only when totalVersions > 1 (archived answers exist) and onSelectVersion is provided.
- Active version defaults to the live (latest) slot when unspecified.
- Selecting a version calls onSelectVersion(parentUserId, version) and renders that archived message.
- When showing an archived (non-live) version, streaming state is forced off for it (isStreaming gated on showLive).
- Each assistant is mapped to its nearest preceding user message id.

**Edge cases:**
- (medium) activeVersion index out of range → archived[active-1] ?? msg falls back to the live message — no crash
- (low) Assistant message with no preceding user message → parentUserId undefined → no archived versions, no VersionNav
- (medium) Switch to an archived version while the live one is streaming → Archived version shows non-streaming; live continues in background; switching back resumes live view
- (low) Re-run produces a worse answer; user pages back → Earlier version content (including its sources/timestamp) renders intact from archive


### Screen-reader status announcer  
`state` · packages/web/src/components/MessageList.tsx:409-418,437-439 · id: `chat-status-announcer`

A single visually-hidden aria-live region that announces 'Researching…' on submit and 'Answer ready' on completion, replacing per-chunk aria-live spam. Uses set-state-during-render to track status transitions.

**Acceptance criteria:**
- Announces 'Researching…' when status transitions to 'submitted'.
- Announces 'Answer ready' when status transitions to 'ready' from 'streaming' or 'submitted'.
- Region is role='status' aria-live='polite' and sr-only.
- No announcement is made for streamed chunks themselves.

**Edge cases:**
- (low) status goes 'ready' without a prior streaming/submitted (e.g. initial load) → No 'Answer ready' announcement (guard on prevStatus)
- (medium) Run aborted via Stop (status to 'ready' or 'error') → If status becomes 'ready' from 'streaming', it still announces 'Answer ready' even though the user stopped it — possibly misleading to SR users
- (medium) Error status → No specific announcement is wired for an 'error' status here

**Suspected issues:**
- packages/web/src/components/MessageList.tsx:415 — a stopped/aborted run that lands on status 'ready' announces 'Answer ready' to screen readers even if generation was cancelled; there is no distinct announcement for cancellation or error states.


### Copy message button  
`control` · packages/web/src/components/MessageActions.tsx:53-71,91-106 · id: `copy-message-button`

Copies the answer (with inline citations rewritten to '[n]' footnotes and a numbered Sources list appended) to the clipboard. Shows transient 'Copied!' (check) or 'Copy failed' (X) feedback for 2s. Handles clipboard API unavailability/denial.

**Acceptance criteria:**
- Clicking copies buildAnswerClipboardText(finalAnswer, sources) to the clipboard.
- On success the icon becomes a check and tooltip/aria reads 'Copied'/'Copied!' for 2s, then resets to idle.
- On failure (denied or clipboard undefined) the icon becomes an X, styled destructive, aria 'Copy failed' for 2s, then resets.
- Rapid repeated clicks reset the prior 2s timer (no early cut-off of the new state).
- Pending reset timer is cleared on unmount.

**Edge cases:**
- (high) Non-secure (http) context where navigator.clipboard is undefined → try/catch sets state 'failed'; X shown, no uncaught error
- (medium) Clipboard permission denied by the browser → Caught → 'failed' state
- (low) Click copy twice within 2s → First timer cleared; feedback stays for full 2s after the second click
- (medium) Copy on an empty answer (ended-without-answer state) → Empty content copied; still reports 'Copied' — misleading
- (low) Component unmounts during the 2s window → cleanup clears the timer; no setState-after-unmount


### Re-run query button  
`control` · packages/web/src/components/MessageActions.tsx:108-115; packages/web/src/components/MessageList.tsx:227-237 · id: `rerun-button`

RotateCcw button under each completed answer that re-sends the originating user question to generate a fresh answer.

**Acceptance criteria:**
- Renders only when onRerun is provided.
- Clicking finds the nearest preceding user message and calls onRerun(messageIndex, userIndex).
- Has aria-label 'Re-run query' and tooltip 'Re-run'.
- No-op if no preceding user message exists.

**Edge cases:**
- (medium) Re-run clicked repeatedly → Each click triggers a new run; potential to stack runs if parent does not guard
- (low) Re-run on the very first assistant message with a valid preceding user msg → Finds and re-sends it
- (medium) Re-run while a different message is streaming → Parent-dependent; could interleave


### Thumbs up/down rating  
`control` · packages/web/src/components/MessageActions.tsx:73-79,117-141 · id: `feedback-thumbs`

Thumbs-up / thumbs-down toggles to rate an answer. Active rating is highlighted (green/red, filled icon). Clicking the already-active rating clears it. Only shown when messageId and onRate are present.

**Acceptance criteria:**
- Both thumbs render only when messageId and onRate are provided.
- Active rating is visually distinct (colored bg, filled icon).
- Clicking an inactive thumb calls onRate(rating).
- Clicking the currently active thumb calls onClearRating (toggles off).
- aria-labels 'Rate helpful' / 'Rate unhelpful'.

**Edge cases:**
- (low) Switch from up to down → onRate('down') called (not clear), since current rating differs
- (medium) Rate while offline / persistence API down → Optimistic UI vs server failure handling is parent-controlled; local highlight may show despite a failed save
- (low) onClearRating undefined but feedback active → handleThumbClick calls onClearRating?.() — optional chaining no-ops safely
- (low) Rapid up/down toggling → Each click flips state; relies on feedback prop reflecting latest server state


### Downvote feedback comment input  
`input` · packages/web/src/components/MessageActions.tsx:81-86,144-164 · id: `feedback-comment-input`

When an answer is rated down and no comment yet exists, a 'What went wrong?' text input appears. Submitting (Enter or Send button) calls onComment with the trimmed text and clears the field. Send disabled while empty.

**Acceptance criteria:**
- Comment input appears only when feedback.rating==='down', onComment provided, and feedback.comment is empty.
- Pressing Enter submits the trimmed comment via onComment and clears the field.
- Send button is disabled when input is empty/whitespace.
- After submission (which sets feedback.comment), the input disappears.
- Input has aria-label describing the field.

**Edge cases:**
- (low) Submit whitespace-only comment → handleCommentSubmit guards on commentText.trim(); no onComment call, field not cleared
- (low) Enter with empty field → No submit (trim guard)
- (medium) User clears the downvote before submitting a typed comment → Comment input unmounts; the typed commentText is lost (local state)
- (medium) Very long comment → No maxLength on this input — unbounded text sent to onComment
- (medium) Re-downvote after previously commenting (feedback.comment set) → Input does NOT reappear because guard requires !feedback.comment — user can't edit/replace an existing comment

**Suspected issues:**
- packages/web/src/components/MessageActions.tsx:144 — once feedback.comment is set, the comment box never reappears, so a user who downvotes again or wants to amend their note cannot. Also the comment input has no maxLength, unlike the main composer's 10,000-char cap.


### Tool step card (expand/collapse)  
`feature` · packages/web/src/components/ToolStep.tsx:234-335 · id: `tool-step-card`

Each tool call renders as a collapsible card with a descriptor label + icon, a status (Running/Done/Failed/Pending), and an expandable body showing human summaries of input/output, error text, and lazily-stringified raw JSON payloads.

**Acceptance criteria:**
- Card shows the mapped descriptor label/icon for known tools, or 'Researching sources'/Search for unknown.
- Status label is 'Running' (input-streaming/input-available), 'Done' (output-available), 'Failed' (output-error), else 'Pending'.
- Running shows a spinner; failed shows a destructive triangle icon and destructive styling.
- Expanding shows input/output summaries; raw JSON is only computed/shown when open.
- Failed state shows the error text or 'The tool call failed without an error message.' fallback.
- Unknown tools show 'Tool name: <name>' and a raw-details note.
- Reachable via data-testid='tool-step', 'tool-step-trigger', 'tool-step-details', 'tool-step-error'.

**Edge cases:**
- (medium) Tool output is a huge JSON blob → formatJson only runs when expanded (useMemo gated on open); pre wraps/scrolls; no perf hit on closed cards during streaming
- (low) Circular-reference output → JSON.stringify throws → caught → String(value) fallback
- (medium) Tool in 'output-error' with empty errorText → Fallback message shown; card uses destructive styling
- (low) Tool state undefined (e.g. mid-conversion) → statusLabel='Pending'; no spinner; icon shown
- (low) Output is a primitive string → formatJson returns the string as-is; summarizeToolOutput returns null for non-object → raw shown
- (low) Running tool with no output yet → 'Waiting for the tool result.' shown when expanded

**Suspected issues:**
- packages/web/src/components/ToolStep.tsx:250-257 — inputJson/outputJson are gated on `open`; when collapsed they're '' and the raw PayloadSections don't render. This is intended, but means a user who expands a still-running tool sees raw input but the 'Waiting for the tool result' line only when output===undefined — confirm the two states render coherently mid-stream.


### Tool input/output human summaries  
`feature` · packages/web/src/components/ToolStep.tsx:41-204 · id: `tool-summary-formatting`

summarizeToolInput / summarizeToolOutput turn each tool's structured payload into a readable one-liner (query, section/document ids, counts with correct pluralization, first-hit headline, route lane, etc.). Truncates long text to 120 chars.

**Acceptance criteria:**
- searchSections output shows 'N matching section(s); first hit: <title> (policy)'.
- getSection output shows '<sectionNumber> <title> (policy)' or 'No section found.'.
- Counts use correct singular/plural (e.g. '1 ancestor', '2 children').
- Long strings are truncated at 120 chars with an ellipsis.
- Returns null when no summarizable fields → falls back to 'Showing raw details' note.

**Edge cases:**
- (low) getSectionContext with zero ancestors/siblings/children → Shows '0 ancestors | 0 siblings | 0 children'
- (low) children count of 1 → '1 child' (irregular plural handled via countLabel override)
- (low) searchSections returns empty sections array → '0 matching sections' (no first-hit clause)
- (medium) Output shape doesn't match expected keys (schema drift) → Type guards return null → raw JSON fallback shown instead of crashing
- (low) truncate on text exactly 120 chars → No ellipsis (<=max returns as-is)


### Empty-state hero and scope/limits copy  
`feature` · packages/web/src/components/EmptyState.tsx:51-78 · id: `empty-state-hero`

First-run guidance shown before any messages: hero heading, scope line (what's covered), limits line (no legal advice / no case lookup), and an optional corpus-freshness line (document count + last-updated date) rendered only when the live value loads.

**Acceptance criteria:**
- Hero 'What would you like to know?' renders (data-testid='empty-state').
- Scope and limits lines render (data-testid='empty-state-scope'/'empty-state-limits').
- Corpus status line shows 'N documents · last updated <date>' only when corpusStatus.lastUpdated is present.
- Document count is locale-formatted; date is en-US long form.
- No invented date is shown when the corpus status hasn't loaded.

**Edge cases:**
- (medium) useCorpusStatus returns null (API down / loading) → Corpus status line is omitted entirely; rest of empty state renders
- (medium) corpusStatus has lastUpdated but documentCount is 0/undefined → Line renders with corpusStatus!.documentCount; if undefined this would show 'undefined documents' (non-null assertion on documentCount)
- (medium) Invalid lastUpdated date string → new Date(invalid).toLocaleDateString yields 'Invalid Date' — could display literally

**Suspected issues:**
- packages/web/src/components/EmptyState.tsx:74-78 — the corpus line guards on lastUpdated only, then non-null-asserts corpusStatus!.documentCount. If the status object has a lastUpdated but missing/0 documentCount, the line could read 'undefined documents' or '0 documents'. Also an invalid lastUpdated string would render as 'Invalid Date' since there's no NaN check (unlike parse-message which guards getTime()).


### Persona example question cards  
`control` · packages/web/src/components/EmptyState.tsx:13-35,79-104 · id: `empty-state-example-cards`

Six example questions grouped by persona (attorneys / case managers / beneficiaries). Clicking a card calls onSelectExample with the question text to prefill/submit the composer.

**Acceptance criteria:**
- Three persona groups render with their labeled headers (data-testid='example-persona').
- Each example renders as a clickable card (data-testid='example-card').
- Clicking a card calls onSelectExample(question) with the exact question string.
- Cards show hover affordance (arrow translate, border/bg change).

**Edge cases:**
- (low) Click example while a previous run is in progress → Behavior depends on parent; empty state is usually only shown when no messages exist
- (medium) Example text prefilled into the composer → If onSelectExample sets input without firing the textarea onChange, the auto-resize won't run (see chat-input-textarea suspectedIssue) — long examples may render single-row
- (low) Keyboard activation (Enter/Space) on a card → Native <button> so keyboard activation works and fires onClick


### Scroll-to-bottom button  
`control` · packages/web/src/components/ScrollToBottom.tsx:23-50 · id: `scroll-to-bottom`

Floating button that appears when the scroll viewport is more than 100px away from the bottom and there are messages. Clicking smooth-scrolls to the bottom. Subscribes to scroll via useSyncExternalStore on the passed viewport element.

**Acceptance criteria:**
- Button is hidden when within 100px of the bottom or when hasMessages is false.
- Button appears when scrolled >100px above the bottom with messages present.
- Clicking smooth-scrolls the viewport to the bottom.
- Has aria-label 'Scroll to bottom'.
- Subscription attaches once the viewport element exists (viewport passed as state, not ref).

**Edge cases:**
- (low) viewport is null (not yet mounted) → subscribe returns no-op, isAwayFromBottom returns false → button hidden; no crash
- (medium) New content streams in while user scrolled up → Button stays/appears; clicking jumps to newest content
- (low) Content shorter than viewport (no scrollbar) → scrollHeight - scrollTop - clientHeight <= 100 → button hidden
- (low) Rapid scroll events → passive listener + useSyncExternalStore recomputes; no jank
- (low) Exactly 100px from bottom → Strictly > 100 required → at exactly 100 the button is hidden (boundary)
- (low) getServerSnapshot during SSR → Returns false → button hidden on first paint (no hydration mismatch)


## Sidebar, sources & trust components

### Thread list load & render  
`feature` · packages/web/src/components/ThreadSidebar.tsx:65-96,266-298 · id: `sidebar-thread-list-load`

On mount and whenever currentThreadId/refreshKey change, the sidebar fetches up to 50 of the user's threads (ordered by updatedAt DESC) and renders them as a clickable list under a 'Threads' header. Shows a 5-row skeleton while loading the first time.

**Acceptance criteria:**
- On opening /chat, the sidebar header shows 'THREADS' and a 5-bar animated skeleton appears while threads are loading (only when threads list is still empty).
- After load, each existing thread renders as a row showing its display title and a relative timestamp (time today / 'Yesterday' / weekday / 'Mon D').
- At most 50 threads are shown (perPage=50), most-recently-updated first.
- Sending a message, renaming, deleting, or duplicating refreshes the list (refreshKey/threadVersion bump or direct fetchThreads call) so the change appears without a manual reload.
- The active thread row has the accent left border and highlighted background; other rows do not.

**Edge cases:**
- (medium) User has more than 50 threads → Only the 50 most-recent appear; older threads are silently unreachable from the sidebar (no pagination control).
- (high) listMemoryThreads returns 401 because the access token is not ready yet (ready===false) → Error is swallowed (no error UI, no list reset) and the fetch retries when mastraClient updates; user is not shown a spurious failure.
- (medium) listMemoryThreads returns 401 after auth is supposedly ready (ready===true) → Error path runs: list cleared and 'Failed to load threads' shown with Retry.
- (high) Network failure / backend down on initial fetch → 'Failed to load threads' message with a working Retry link; clicking Retry re-fetches.
- (medium) Rapid thread switching fires overlapping fetches → Stale fetches are aborted via AbortController so the list reflects the latest selection, not an out-of-order earlier response.
- (low) result.threads is undefined/null in the response → Falls back to empty array, renders 'No threads yet' rather than crashing.

**Suspected issues:**
- ThreadSidebar.tsx:152-204 — handleDelete/handleRename/handleDuplicate/handleExport call fetchThreads() with no AbortSignal and without awaiting; if the user switches threads while one of these is in flight, the late fetchThreads result can overwrite the new selection's list (race not covered by the mount-effect AbortController).
- ThreadSidebar.tsx:86-88 — isLoading is only reset in finally when !signal?.aborted; an aborted in-flight fetch leaves isLoading true, but a new fetch immediately resets it, so low impact. Worth confirming no stuck skeleton on fast switching.


### Empty thread list state  
`state` · packages/web/src/components/ThreadSidebar.tsx:293-295 · id: `sidebar-empty-state`

When the user has no threads and there is no error and loading is complete, the sidebar shows the text 'No threads yet'.

**Acceptance criteria:**
- A brand-new user with zero threads sees 'No threads yet' in the list area (not a skeleton, not an error).
- The 'New' button and user footer remain visible/usable in the empty state.

**Edge cases:**
- (low) Threads exist but all are filtered out by an upstream error returning empty array → Shows 'No threads yet' which may mask a real failure if the catch set threads to [] without error (only happens on genuine error which sets error too).
- (low) Empty state flashes between skeleton and first real data → No flash of 'No threads yet' before data loads (guarded by !isLoading).


### New thread button  
`control` · packages/web/src/components/ThreadSidebar.tsx:251-260 · id: `sidebar-new-thread-button`

A 'New' button in the sidebar header (data-testid=new-thread-button) starts a fresh conversation via onNewThread.

**Acceptance criteria:**
- Clicking 'New' clears the active conversation and presents the empty chat / new-thread state.
- Button is reachable by keyboard and shows a focus ring; has a plus icon and 'New' label.

**Edge cases:**
- (medium) Clicking 'New' while a message is streaming in the current thread → Behavior delegated to onNewThread/handleNewThread; verify it doesn't leave a half-streamed answer attached to the new thread.
- (low) Repeated rapid clicks on 'New' → Does not create multiple empty threads or throw; idempotent-ish.


### Select a thread  
`control` · packages/web/src/components/ThreadSidebar.tsx:332-341 · id: `sidebar-select-thread`

Clicking a thread row (data-testid=thread-item) selects it via onSelectThread, switching the main chat to that conversation.

**Acceptance criteria:**
- Clicking a non-active thread loads its messages into the main panel and marks that row active (accent border + highlight).
- The row title button is keyboard-focusable with a visible focus-visible ring.
- Clicking the already-active thread is a no-op visually (still selected).

**Edge cases:**
- (high) Select a thread while another thread's answer is streaming → Switch should abort/replace the prior stream cleanly without bleeding messages between threads.
- (low) Click directly on the kebab/dropdown trigger area instead of the title → Opens the actions menu, does NOT select the thread (title button and trigger are separate elements).
- (low) Thread with a very long single-word title → Title clamps to 2 lines (line-clamp-2) and does not overflow the 280px sidebar.


### Thread display title resolution  
`feature` · packages/web/src/components/ThreadSidebar.tsx:106-150,243; packages/web/src/lib/thread-helpers.ts:76-108 · id: `sidebar-thread-title-display`

Each row's title is the server title if set; otherwise an auto-derived title from the first user message (for up to 10 most-recent untitled threads), otherwise 'New conversation'. Colliding derived titles get a date suffix to disambiguate.

**Acceptance criteria:**
- A thread with a server-set title shows that exact title.
- An untitled recent thread shows the first ~60 chars of its first user message once derivation completes.
- An untitled thread beyond the 10 most-recent untitled keeps the 'New conversation' fallback (no derivation request fired).
- Two untitled threads that derive the same title each get a '(timestamp)' suffix so they're distinguishable; user-titled duplicates are NOT rewritten.

**Edge cases:**
- (medium) More than 10 untitled threads → Only the 10 most-recent fire listMessages; the rest show fallback. Verify no 50-request fan-out.
- (low) listMessages fails for a thread during title derivation → That thread is removed from the requested set so a future render can retry it; it temporarily shows the fallback. Error is console-logged, no UI error.
- (low) First user message is empty / whitespace / non-text content → deriveThreadTitleFromMessages returns null and the fallback 'New conversation' is kept (no blank title).
- (low) Derived title equals exactly 'New conversation' → Not treated as a collision (FALLBACK excluded from collider buckets), no spurious date suffix.
- (medium) Title derivation runs while threads array identity changes on every fetch → requestedDerivedTitlesRef prevents re-requesting already-derived threads; no infinite refetch loop.

**Suspected issues:**
- ThreadSidebar.tsx:106-150 — the derivation effect depends on [threads, mastraClient]; every fetchThreads creates a new threads array, re-running the effect. The requestedDerivedTitlesRef set guards against duplicate network calls, but a thread whose derivation FAILED is deleted from the set (line 140), so it will be re-requested on the very next threads-array change, potentially hammering a consistently-failing thread on each refresh.


### Thread actions dropdown (kebab)  
`modal` · packages/web/src/components/ThreadSidebar.tsx:346-391 · id: `sidebar-thread-actions-menu`

Each row has an ellipsis trigger opening a dropdown with Rename, Duplicate, Export, and Delete actions. Delete is styled destructive.

**Acceptance criteria:**
- Clicking the ellipsis opens a menu anchored bottom-end with exactly: Rename, Duplicate, Export, Delete.
- While open, the trigger shows the active (highlighted) styling; closing restores the dim hover styling.
- Each item has an icon and is keyboard-navigable; Delete is visually destructive (red).
- Selecting Rename enters inline edit; Duplicate/Export/Delete trigger their handlers.

**Edge cases:**
- (medium) Open the menu, then the threads list refreshes (e.g. background fetch) and the thread is gone → Menu closes gracefully without referencing a stale thread id; no crash.
- (low) Open menu on one row, then open menu on another → menuOpenThreadId tracks only the latest open row; prior trigger styling resets.
- (low) Keyboard: open with Enter/Space, navigate with arrows, Escape to close → Standard dropdown a11y works; focus returns to the trigger on close.


### Rename thread (inline edit)  
`input` · packages/web/src/components/ThreadSidebar.tsx:167-189,312-329 · id: `sidebar-rename-thread`

Choosing Rename replaces the title with an autofocused text input prefilled and selected with the current title. Enter commits, Escape cancels, blur commits. Empty/whitespace title is rejected (edit exits without saving).

**Acceptance criteria:**
- Selecting Rename focuses the input and selects its text; the input is labelled 'Rename {title}'.
- Typing a new value and pressing Enter saves it, exits edit mode, and the row shows the new title after refresh.
- Pressing Escape exits edit mode without saving the typed change.
- Saving an empty or whitespace-only title leaves the title unchanged and exits edit mode (no blank rename).
- Existing metadata and resourceId are preserved on the update (not wiped to {}).

**Edge cases:**
- (high) Press Enter to commit → handleRename fires once and saves.
- (high) Press Escape to cancel a typed change → Edit should be discarded — BUT setting editingThreadId=null triggers the input's onBlur, which calls handleRename with the still-typed editTitle, so the 'cancelled' value may actually be saved. Likely defect.
- (medium) Very long title (e.g. 5000 chars) entered → No length cap in the input; full string is sent to thread.update. Verify backend accepts/truncates and the row clamps display to 2 lines.
- (low) Title with markdown/HTML/emoji/RTL characters → Rendered as plain text, not interpreted; no injection.
- (medium) Rename request fails (network/backend) → 'Failed to rename thread' error shown and edit mode exits; title reverts to prior on next fetch.
- (low) Thread deleted out from under the edit before commit → Update targets a missing thread → handled via error branch, no crash.

**Suspected issues:**
- ThreadSidebar.tsx:319-323 — onKeyDown Enter calls handleRename, then the input also blurs and onBlur calls handleRename AGAIN: double save + double fetchThreads on the common commit path.
- ThreadSidebar.tsx:321,323 — Escape sets editingThreadId=null which unmounts/blurs the input, firing onBlur → handleRename(thread.id) on the typed-but-unsaved editTitle. Escape does not actually cancel; it can persist the edited value. High-likelihood UX bug.
- ThreadSidebar.tsx:99-104 — focus/select effect keys on editingThreadId only; if two renames happen the ref points at whichever input is mounted, fine, but worth confirming the select() lands.


### Duplicate thread  
`control` · packages/web/src/components/ThreadSidebar.tsx:191-204 · id: `sidebar-duplicate-thread`

Duplicate clones the thread and all messages server-side, giving the copy a '{title} (copy)' name, then refreshes the list.

**Acceptance criteria:**
- Selecting Duplicate creates a new thread titled '{source title} (copy)' that appears in the list after refresh.
- An untitled source duplicates as 'Untitled (copy)'.
- The clone preserves the original thread's messages (server-side clone).

**Edge cases:**
- (medium) Duplicate a thread owned by a different resourceId than the current user → clone is called with the current user's resourceId; verify the copy belongs to the current user and there's no cross-user leakage.
- (medium) Clone endpoint fails or is unsupported by backend → 'Failed to duplicate thread' error shown; list unchanged.
- (low) Duplicate a very large thread (hundreds of messages) → Server clone may be slow; no client loading indicator is shown during clone, so verify acceptable perceived latency.
- (low) Duplicate the same thread twice → Two distinct '(copy)' threads created; no id collision.

**Suspected issues:**
- ThreadSidebar.tsx:191-204 — no in-flight/disabled state during clone; a double-click could fire two clone requests creating two copies.


### Export thread to Markdown  
`workflow` · packages/web/src/components/ThreadSidebar.tsx:206-241; packages/web/src/lib/thread-helpers.ts:127-168 · id: `sidebar-export-thread`

Export fetches the thread metadata + messages, builds a Markdown document (questions + answers with footnote citations and source list + a disclaimer header), and triggers a browser download named thread-{slug}-{date}.md.

**Acceptance criteria:**
- Selecting Export downloads a .md file whose name is thread-{slugified-title}-{YYYY-MM-DD}.md.
- The file starts with a title heading and an 'Exported … from NC Medicaid Navigator … verify with NC DHHS' disclaimer line.
- User questions render under '## Question' and assistant answers under '## Answer' with inline markdown citations converted to [n] footnotes and a numbered Sources list.
- The object URL is revoked after the download starts (no leaked blob URLs).

**Edge cases:**
- (medium) Title is empty / all non-alphanumeric (slug becomes empty) → Slug falls back to 'thread' so the filename is never thread--{date}.md or malformed.
- (medium) Thread with only tool steps and no final answer text → buildThreadMarkdown skips assistant messages with empty trailing text; the export should still produce a valid (possibly answer-less) document.
- (medium) Export request fails (listMessages/get rejects) → 'Failed to export thread' error shown; no partial file downloaded.
- (low) Very long thread → Markdown build runs synchronously on the main thread; verify no noticeable UI freeze for large transcripts.
- (medium) Browser blocks programmatic download / popup → anchor.click() path; if blocked, no error is surfaced — silent failure possible.
- (low) Title with characters illegal in filenames (slashes, emoji) → Slug regex strips them to hyphens; filename stays filesystem-safe.

**Suspected issues:**
- ThreadSidebar.tsx:236 — URL.revokeObjectURL is scheduled on a fixed 1000ms timer; on a slow disk/large file the download may not have started, though browsers generally hold the blob. Low risk.
- thread-helpers.ts:139 — exportedAt is formatted en-US/locale-fixed; acceptable, but note timezone is local-day based.


### Delete thread (with confirmation)  
`modal` · packages/web/src/components/ThreadSidebar.tsx:152-165,381-389,420-442 · id: `sidebar-delete-thread`

Delete opens an AlertDialog ('Delete chat — Are you sure? This cannot be undone.'). Confirming deletes the thread server-side; if it was the active thread, a new thread is started. The list refreshes.

**Acceptance criteria:**
- Selecting Delete opens a confirmation dialog with Cancel and a destructive Delete button.
- Cancel (or dismissing the dialog) closes it and deletes nothing.
- Confirming Delete removes the thread from the list after refresh.
- Deleting the currently-open thread also navigates to a new/empty conversation (onNewThread).
- The dialog is modal (focus trapped, Escape/overlay-click closes via onOpenChange).

**Edge cases:**
- (high) Delete the active thread → onNewThread fires so the main panel doesn't keep showing a deleted thread's messages.
- (medium) Delete request fails → 'Failed to delete thread' error shown; thread remains in list (deleteThreadId already cleared so dialog is gone).
- (low) Open delete dialog, then the thread disappears via background refresh → Confirming deletes a possibly-missing id; backend 404 handled via error branch.
- (low) Double-confirm / rapid clicks on Delete action → deleteThreadId cleared immediately on click so a second confirm can't re-fire; verify no double delete.
- (low) Delete last remaining thread → List shows 'No threads yet' and main panel shows new-conversation state.

**Suspected issues:**
- ThreadSidebar.tsx:431-435 — onClick calls handleDelete(deleteThreadId) (async, not awaited) then synchronously setDeleteThreadId(null); fine, but the delete failure error is set after the dialog has already closed, so the user sees the error in the sidebar list area rather than the dialog. Acceptable but worth noting for QA.


### User email footer  
`feature` · packages/web/src/components/ThreadSidebar.tsx:404-408 · id: `sidebar-user-footer-email`

The sidebar footer shows the signed-in user's email (truncated) from useAuth.

**Acceptance criteria:**
- The footer displays the authenticated user's email address.
- A long email truncates with ellipsis and does not push the Sign out button off-screen.

**Edge cases:**
- (low) user is null/loading (useAuth not resolved) → Renders empty string, not 'undefined'; footer layout intact.
- (low) User has no email (SSO without email claim) → Empty string shown; no crash.


### Sign out button  
`control` · packages/web/src/components/ThreadSidebar.tsx:409-416 · id: `sidebar-sign-out`

A 'Sign out' button in the footer calls WorkOS signOut().

**Acceptance criteria:**
- Clicking 'Sign out' ends the WorkOS session and redirects the user away from /chat (to login/home).
- After sign out, navigating back to /chat requires re-authentication.

**Edge cases:**
- (medium) Single click signs out immediately with no confirmation → Intentional, but a misclick loses unsaved input/streaming context — confirm this is acceptable UX (no guard exists).
- (medium) Sign out while an answer is streaming → Stream aborts and session ends cleanly without a hung request or console error.
- (low) signOut() rejects (network) → No catch around signOut(); an unhandled rejection could occur — verify graceful behavior.

**Suspected issues:**
- ThreadSidebar.tsx:412 — onClick={() => signOut()} has no error handling and no confirmation; a rejected promise is unhandled.


### Sources panel render & collapse  
`feature` · packages/web/src/components/SourcesPanel.tsx:188-221; packages/web/src/components/MessageList.tsx:202-207,370-380 · id: `sources-panel-render-toggle`

Under each completed answer with sources, a collapsible 'Sources' panel shows a count label and expands to a list of clickable source rows. Open state is controlled by the parent (defaults open when the answer cites sources, i.e. citedCount>0).

**Acceptance criteria:**
- When sources.length===0 the panel renders nothing (returns null).
- When the answer has cited sources (citedCount>0) the panel is open by default; the chevron is rotated.
- Clicking the trigger toggles open/closed; the user's explicit toggle persists (panelOpenOverride wins thereafter).
- The trigger is a single <button> (no nested interactive elements) and is keyboard-operable.
- The panel only renders after streaming completes (!isStreaming).

**Edge cases:**
- (medium) Answer has only consulted sources, zero cited (citedCount===0) → Panel renders but is COLLAPSED by default (panelOpen = override ?? citedCount>0 → false); user must click to see sources. Verify this is the intended default for verification-first UX.
- (low) citedCount undefined → countLabel shows plain '{n} sources'; no group split; all sources in one list.
- (low) Exactly 1 source → Count label reads '1 source' (singular), not '1 sources'.
- (low) citedCount equals total count → countLabel collapses to plain '{n} sources' (no '· consulted' suffix) and no group headers.
- (low) Panel re-renders mid-stream then completes → Panel hidden during streaming, appears with correct default open state when isStreaming flips false.

**Suspected issues:**
- MessageList.tsx:206 — panelOpen default of citedCount>0 means answers that consulted many sources but cited none start collapsed, which can hide the very sources a skeptical reader wants; flag for product/QA confirmation.


### Sources count / cited-vs-consulted label  
`feature` · packages/web/src/components/SourcesPanel.tsx:28-32,217 · id: `sources-count-label`

The trigger subtitle shows either '{n} sources' or '{cited} cited · {consulted} consulted' depending on the cited split.

**Acceptance criteria:**
- With a partial cited split (0 < citedCount < total) the label reads '{citedCount} cited · {total-citedCount} consulted'.
- With no split (undefined/0/equal-to-total) the label reads '{total} source(s)' with correct singular/plural.

**Edge cases:**
- (medium) citedCount > count (data inconsistency) → count-citedCount goes negative → label could read 'X cited · -Y consulted'. Defensive check absent.
- (low) count === 0 → Panel returns null earlier, so label never renders for empty.

**Suspected issues:**
- SourcesPanel.tsx:31 — no guard that citedCount <= count; a malformed split would render a negative consulted count.


### Cited vs consulted grouping  
`feature` · packages/web/src/components/SourcesPanel.tsx:191-260 · id: `sources-grouping`

When there are both cited and consulted sources, the list splits into a 'Cited in this answer' group and an 'Also consulted' group, with continuous footnote numbering across both.

**Acceptance criteria:**
- Group headers 'CITED IN THIS ANSWER' and 'ALSO CONSULTED' appear only when both groups are non-empty.
- Footnote numbers are continuous: consulted rows start at cited.length+1.
- When all sources are cited (or no citedCount), a single flat list renders with no headers.

**Edge cases:**
- (low) citedCount provided but all sources cited (consulted empty) → showGroups false; flat list, no 'Also consulted' header.
- (low) citedCount=0 with consulted-only → showGroups false (cited.length===0); flat list of consulted sources, numbered from 1.


### Source row link & metadata  
`control` · packages/web/src/components/SourcesPanel.tsx:126-186 · id: `sources-row-link`

Each source row is a numbered external link (opens in a new tab, rel=noopener) showing the policy label, an optional origin badge (read/search result/looked up/etc.), and an optional secondary document title.

**Acceptance criteria:**
- Clicking a source label/icon opens source.url in a new tab with rel='noopener noreferrer'.
- Row shows the 1-based index, an external-link icon, the bold label, and (when present) a secondary title line.
- Origin badge text matches ORIGIN_LABELS for the source's originTool; unknown tools render no badge.
- Hover styling switches label/icon to accent color and underlines the label.

**Edge cases:**
- (medium) source.url is a javascript: or malformed URL → extractMessageSources filters null/empty urls upstream; but a malformed non-null url is rendered verbatim in href. Verify upstream never yields a dangerous scheme.
- (low) originTool not in ORIGIN_LABELS map → No badge shown (conditional render), row still valid.
- (low) Label equals title (duplicate) → Secondary title suppressed upstream (title set null when equal to label).
- (low) Two sources share the same label → disambiguateLabels appends a URL-derived suffix so rows are distinguishable.


### Show policy text excerpt  
`control` · packages/web/src/components/SourcesPanel.tsx:172-183; packages/web/src/lib/message-parts.ts:313-324 · id: `sources-excerpt-disclosure`

When a source carries a snippet, a native <details>/<summary> 'Show policy text' disclosure reveals the ~300-char excerpt as a blockquote.

**Acceptance criteria:**
- Rows with a snippet show a 'Show policy text' summary; clicking expands the quoted excerpt.
- Rows without a snippet show no disclosure.
- Excerpt is trimmed to ~300 chars at a word boundary with an ellipsis when longer.
- Disclosure is keyboard-accessible (native details).

**Edge cases:**
- (low) Snippet shorter than 300 chars → Full text shown, no ellipsis.
- (low) Snippet with collapsed whitespace / newlines → Whitespace collapsed to single spaces before display.
- (low) Snippet word boundary near the start (lastSpace<=200) → Falls back to hard 300-char cut rather than an awkward early break.


### Footnote-click highlight & scroll  
`workflow` · packages/web/src/components/SourcesPanel.tsx:121-147,238-256; packages/web/src/components/MessageList.tsx:210-222 · id: `sources-footnote-highlight`

Clicking an inline citation in the answer forces the Sources panel open, scrolls the matching source row into view, and briefly highlights it (background flash for ~1.8s).

**Acceptance criteria:**
- Clicking an inline footnote opens the panel (even if collapsed) and smooth-scrolls the matching row into the viewport center.
- The matched row gets data-highlighted and a temporary accent background that fades after ~1.8s.
- Row DOM ids are scoped per message (sourceRowId) so multiple message panels on one page don't collide.

**Edge cases:**
- (low) Footnote number maps to a source index that doesn't exist → handleCitationClick returns early (no source), no scroll/highlight, no crash.
- (low) Rapid clicking of two different footnotes within 1.8s → Latest highlight wins; the older setTimeout clears highlight, possibly clearing the new one early. Minor flicker.
- (low) messageId undefined → sourceRowId falls back to 'msg' prefix; scroll target still resolves within a single-panel page.

**Suspected issues:**
- MessageList.tsx:221 — a single shared setTimeout(1800) for highlight clear; back-to-back citation clicks can clear the newer highlight prematurely (no timer cancellation).


### Verifier confidence dot + tooltip (in Sources trigger)  
`feature` · packages/web/src/components/SourcesPanel.tsx:48-119,203-215 · id: `sources-confidence-dot`

When a verification state is present, a colored dot (emerald/amber/red by severity) appears next to the 'Sources' label with a hover tooltip explaining the confidence percentage and any unsupported/uncited/relevance counts. The meaning is also exposed via sr-only text in the trigger's accessible name.

**Acceptance criteria:**
- Dot color reflects severity: high=emerald, medium=amber, low=red.
- Hovering the dot shows a tooltip: header 'Verifier confidence: {severity} ({pct}%)' plus a detail line (passed without rewrite / fallback / itemized issue counts).
- Clicking the dot does NOT toggle the collapsible (event.stopPropagation) and does not flicker the tooltip off.
- The dot is rendered as a span (aria-hidden) — no nested button inside the trigger button; screen readers get the meaning from sr-only text.
- data-testid=verification-dot and data-severity attributes are present for testing.

**Edge cases:**
- (low) verification is null → No dot rendered; trigger shows just 'Sources' with no sr-only verification text.
- (low) confidence = 0 or 1 → Tooltip shows '0%' / '100%' correctly via Math.round.
- (low) rewrote true but all counts zero → Detail line falls back to 'Verifier rewrote the answer.' (no empty bits).
- (medium) pureMarkerFallback true → Detail reads 'Rewrite was empty — falling back to the original answer.' regardless of counts.
- (medium) Tooltip on touch devices → Hover-only tooltip may be unreachable on touch; sr-only text still conveys meaning. Verify mobile users aren't left without the info.


### Verification badge under answer  
`feature` · packages/web/src/components/VerificationBadge.tsx:23-82; packages/web/src/components/MessageList.tsx:341-343 · id: `verification-badge`

A plain-language trust badge rendered directly under each completed answer: green 'Verified against cited sources', amber 'Partially verified' with detail, or red 'Low confidence — verify before relying on this answer' / 'Automatic verification was inconclusive'.

**Acceptance criteria:**
- High severity, no rewrite → green CircleCheck badge 'Verified against cited sources' with no detail line.
- Medium severity OR rewrote → amber TriangleAlert badge 'Partially verified' with a detail describing unmatched claims and/or relevance drift.
- Low severity → red ShieldAlert badge 'Low confidence — verify before relying on this answer' with detail to check policy text / NC DHHS.
- pureMarkerFallback → red ShieldAlert badge 'Automatic verification was inconclusive'.
- Badge only renders when verification exists AND there is final answer text (not while streaming).
- Badge severity is exposed via data-severity for testing.

**Edge cases:**
- (medium) Answer ended without final text (endedWithoutAnswer) but verification exists → Badge does NOT render (gated on finalAnswerText); the amber 'finished without answer' notice carries the messaging instead. Confirm no contradictory double-signal.
- (low) Medium severity with zero counts and rewrote=true → Detail falls back to 'Some checks could not be completed.' (detailBits empty).
- (medium) Low severity AND rewrote AND counts present → Low branch wins (checked first) → red badge, ignoring the medium-detail itemization.
- (low) unsupported+missingCitation = 1 vs >1 → Singular/plural grammar correct ('1 claim ... is' vs 'N claims ... are').
- (medium) Verifier disabled (extractVerificationState returns null) → No badge at all; answer renders without a trust signal — verify this is acceptable when VERIFIER_ENABLED=false.

**Suspected issues:**
- MessageList.tsx:341 — badge requires finalAnswerText truthy; a verifier result attached to an answer that has only whitespace text would suppress the trust signal even though sources rendered.


### Answer version pager  
`control` · packages/web/src/components/VersionNav.tsx:20-65; packages/web/src/components/MessageList.tsx:469-477; packages/web/src/lib/use-answer-versions.ts · id: `version-nav-pager`

A '< Answer N of M >' pager rendered above an assistant message when earlier re-run versions exist (total>1). Prev/Next buttons switch which archived/live answer is displayed. Versions are client-only and session-scoped.

**Acceptance criteria:**
- Pager only appears when total>1 (i.e., the answer was re-run at least once).
- Indicator reads 'Answer {current} of {total}' with current=live by default after a re-run.
- Previous is disabled at version 1; Next is disabled at the last (live) version; disabled buttons show reduced opacity and not-allowed cursor.
- Clicking Prev/Next swaps the displayed answer (archived vs live) below the pager.
- Indicator has aria-live=polite and buttons have aria-labels 'Previous answer'/'Next answer'.
- A title tooltip notes earlier answers are kept only for this session.

**Edge cases:**
- (low) total === 1 (never re-run) → Pager returns null; nothing rendered.
- (medium) Switch threads after re-running an answer → resetVersions clears archived versions; the new thread shows no pager (versions are not persisted).
- (medium) Re-run while viewing an OLD archived version (active < total) → handleRerun archives current LIVE answer and deletes the active override (jumps to new live). Verify the user isn't stranded on a stale index; current jumps to new total.
- (low) Click Prev at version 1 / Next at last version → Guarded (canPrev/canNext) — onSelect not called; no underflow/overflow.
- (medium) Reload page after re-running → Archived versions are lost (client-only); only the live answer remains and the pager disappears. Confirm this matches the 'session only' tooltip promise.
- (low) Rapid Prev/Next clicks → current clamps within 1..total; no out-of-range index passed to onSelect.

**Suspected issues:**
- MessageList.tsx:446-448 — displayMsg = archived[active-1] ?? msg; if activeVersion holds a stale index larger than archived.length after some archive mutation, it safely falls back to live msg, but the indicator could momentarily show a number that doesn't match the displayed answer. Worth verifying after re-run-while-viewing-old.
- use-answer-versions.ts:64-77 — archivedVersions are keyed by user msg id and never pruned within a session; many re-runs grow the array unbounded (minor memory).


## Deep research & theming components

### Deep Research empty / idle state  
`state` · packages/web/src/components/DeepResearchView.tsx:32-46 · id: `deep-research-empty-idle`

When deep-research mode is active but no research has started (status 'idle'), the view shows an empty placeholder card with a telescope icon, the 'Deep Research' heading, and explanatory copy about proposing a plan for approval before investigating the corpus.

**Acceptance criteria:**
- Toggling into deep-research mode with no run in progress renders an element with data-testid='deep-research-empty'.
- The card displays the heading 'Deep Research' and the descriptive paragraph about plan approval and a long cited report.
- A telescope icon is visible above the heading.
- No plan, progress spinner, error, or report is shown in this state.

**Edge cases:**
- (medium) User toggles deep-research mode on, then off, then on again without starting a run → Idle empty card re-renders each time; no leftover state from a prior aborted run is shown
- (low) Empty state rendered in dark mode → Card border-dashed, accent icon, and muted copy remain legible against dark background (uses theme tokens)


### Deep Research active header / question echo  
`feature` · packages/web/src/components/DeepResearchView.tsx:49-54 · id: `deep-research-header`

Once a run has started (any non-idle status), a header row shows a telescope icon, the 'Deep Research' label, and—when present—the truncated user question prefixed with a middot.

**Acceptance criteria:**
- For any non-idle status the container has data-testid='deep-research-view'.
- The user's submitted question is echoed after the '·' separator and truncated (CSS truncate) when it overflows.
- When question is empty the '·' separator and question span are not rendered.

**Edge cases:**
- (medium) Very long question (near the 10,000-char chat input cap) submitted → Question text is truncated to a single line without breaking layout or overflowing the header
- (low) Question containing HTML/markdown/script-like text → Rendered as inert plain text (React escapes it); no markup or script executes
- (low) Question with RTL or emoji characters → Renders without layout corruption


### Planning phase indicator  
`state` · packages/web/src/components/DeepResearchView.tsx:56; packages/web/src/lib/use-deep-research.ts:118-124,126-157 · id: `deep-research-planning`

While the workflow is generating the research plan (status 'planning'), a single spinner card reads 'Planning the research…' with an elapsed-time subline that ticks every second.

**Acceptance criteria:**
- Status 'planning' shows the label 'Planning the research…' with an animated spinner.
- The subline shows 'Elapsed Ns' that increments roughly once per second (e.g. 5s, 1m 5s) per fmtElapsed formatting.
- Elapsed time starts at 0s when planning begins (startedAt reset on start).

**Edge cases:**
- (low) Planning takes over 60 seconds → Elapsed switches to 'Nm Ns' format (e.g. '1m 5s') per fmtElapsed
- (high) Network failure / backend down when createRun or startAsync rejects → Transitions to 'error' state with the thrown message; ticker stops
- (medium) Planning returns status 'suspended' but no extractable plan payload → Falls through to error state 'Planning ended with status: suspended' (extractPlan returned null)
- (low) Backend returns 'success' with a final result instead of suspending at the plan gate → Skips approval and jumps straight to 'done'/report (handled fallback path)
- (low) Tab left idle during a long plan; setInterval ticker → Ticker is cleared on unmount/phase change (cleanup returns clearInterval); no leaked timer

**Suspected issues:**
- packages/web/src/lib/use-deep-research.ts:120-124 — the 1s ticker only updates `now`; if the tab is backgrounded, setInterval may be throttled so elapsed display can jump rather than tick smoothly (cosmetic).


### Proposed research plan (approval gate)  
`modal` · packages/web/src/components/DeepResearchView.tsx:58-136 · id: `deep-research-plan-approval`

When the workflow suspends for approval (status 'awaiting-approval'), the view renders the plan brief and an ordered list of sub-questions, each with rationale, channel tags, an optional 'web' badge, and an include/exclude toggle. Approve and Cancel buttons sit below.

**Acceptance criteria:**
- Container has data-testid='deep-research-plan'; heading 'Proposed research plan' is shown.
- plan.brief renders with whitespace-pre-wrap (preserving newlines).
- Each sub-question shows its question text, rationale, one mono uppercase tag per channel, and a globe 'web' badge only when sq.useWeb is true.
- An 'Approve & research' button (data-testid='approve-plan') and a 'Cancel' button (data-testid='decline-plan') are present.
- Sub-questions render in plan order using the ordered list.

**Edge cases:**
- (medium) Plan has zero sub-questions (empty array) → Empty list renders; Approve button disabled state is `excluded.size === 0 === 0` → true, so Approve is disabled with nothing to research (likely undesirable but defined)
- (low) Sub-question with empty channels array and useWeb false → No tags or web badge render; row still shows question + rationale
- (low) Very long brief or sub-question text → brief wraps (pre-wrap); sub-question text wraps within the row without clipping the toggle button
- (low) Plan brief / question containing markdown or HTML → Rendered as plain text (no markdown parsing in the plan view); no injection
- (low) Duplicate channel strings within one sub-question → React key={c} on channel span collides for duplicates, producing a key warning and potentially dropping a tag

**Suspected issues:**
- DeepResearchView.tsx:78-82 — channel tags use key={c}; duplicate channel values in one sub-question would produce duplicate React keys.
- DeepResearchView.tsx:64,146 — sub-question list uses key={i} (array index); since the list is static during approval this is fine, but exclusion toggling relies on index identity which is consistent here.


### Include / exclude sub-question toggle  
`control` · packages/web/src/components/DeepResearchView.tsx:90-104,30 · id: `deep-research-subq-toggle`

Each sub-question has an icon button that toggles its membership in a local `excluded` Set. Excluded rows dim (opacity-50), strike through the question text, and the button swaps from an X (exclude) to a check (include) with a matching aria-label.

**Acceptance criteria:**
- Clicking the toggle on an included sub-question dims its row, strikes through the question, and the button becomes a check icon with aria-label 'Include sub-question'.
- Clicking again restores the row to full opacity, removes strike-through, and the button shows an X with aria-label 'Exclude sub-question'.
- Toggling one sub-question does not change the visual state of any other.
- The exclusion state is reflected in what Approve sends (excluded items are filtered out).

**Edge cases:**
- (high) Exclude every sub-question one by one → When the last is excluded, the Approve button becomes disabled (excluded.size === subQuestions.length)
- (medium) Exclude all then re-include one → Approve button re-enables; clicking sends the single kept sub-question as editedSubQuestions
- (low) Rapid double-click on a toggle → Set add/delete is idempotent per render via functional update; net state matches final intended toggle
- (low) Component re-mounts (e.g. status changes and back) → `excluded` Set resets to empty (local useState); prior exclusions are lost — verify this matches intended UX

**Suspected issues:**
- DeepResearchView.tsx:30 — `excluded` lives in local component state, not the controller, so it is lost if DeepResearchView unmounts/remounts (e.g. toggling deepMode off/on while awaiting approval).


### Approve & research button  
`control` · packages/web/src/components/DeepResearchView.tsx:112-124; packages/web/src/lib/use-deep-research.ts:177-187 · id: `deep-research-approve`

Approve resumes the workflow. If the user excluded no sub-questions it sends undefined (no edits); if they pruned some it sends only the kept sub-questions as editedSubQuestions. The button is disabled when all sub-questions are excluded.

**Acceptance criteria:**
- Clicking Approve with no exclusions transitions the view to 'researching' and resumes with { approved: true } (no editedSubQuestions).
- Clicking Approve after excluding some (but not all) sub-questions resumes with { approved: true, editedSubQuestions: [kept...] } in original order.
- The button is disabled (cannot be clicked) when every sub-question is excluded.
- Button label is 'Approve & research'.

**Edge cases:**
- (high) Approve clicked, then resumeAsync rejects (backend error mid-research) → Transitions to 'error' with the error message; ticker stops
- (medium) Approve clicked when runRef is null (e.g. controller created but no run) → finishResume early-returns (no run); status stuck at 'researching' with no progress — verify can't be reached from normal flow
- (low) Research completes but result.status === 'cancelled' → View shows the 'cancelled' state rather than 'done' (mapped in finishResume)
- (medium) Research ends with a non-success workflow status (e.g. 'failed') → Error state 'Research ended with status: <status>'
- (medium) Double-click Approve before status changes → Second click is harmless once disabled/transitioned; verify no duplicate resumeAsync that could double-charge or error

**Suspected issues:**
- use-deep-research.ts:159-175 — finishResume silently returns when runRef.current is null, leaving status at whatever approve()/decline() set ('researching'/'cancelled') with no further transition; if the run is ever lost (e.g. page state reset) the UI could hang on 'Researching…'.
- DeepResearchView.tsx:112-124 — Approve button has no in-flight disabled guard; a rapid second click before React re-renders to 'researching' could trigger a second resumeAsync.


### Cancel (decline plan) button  
`control` · packages/web/src/components/DeepResearchView.tsx:125-133; packages/web/src/lib/use-deep-research.ts:189-194 · id: `deep-research-decline`

Cancel declines the proposed plan. The UI optimistically shows the 'cancelled' state immediately, then resumes the workflow with { approved: false } in the background.

**Acceptance criteria:**
- Clicking Cancel immediately switches the view to the 'cancelled' state (does not flash 'Researching…').
- The workflow is resumed with { approved: false } in the background.
- Cancel is always enabled while awaiting approval (no disabled condition).

**Edge cases:**
- (medium) Decline resumeAsync rejects after optimistic cancel → Status flips from 'cancelled' to 'error' with the message (finishResume catch sets error)
- (low) Decline while some sub-questions excluded → Exclusions are irrelevant; declines with approved:false regardless
- (low) Backend returns success with a cancelled report after decline → Stays in 'cancelled' state (no error)

**Suspected issues:**
- use-deep-research.ts:189-194 — decline() optimistically sets 'cancelled' then awaits finishResume; if finishResume errors, the user briefly saw 'cancelled' then sees 'error'. Acceptable but a state flicker worth noting.


### Researching phase progress  
`state` · packages/web/src/components/DeepResearchView.tsx:138-155 · id: `deep-research-researching`

While the workflow investigates (status 'researching'), a spinner card reads 'Researching…' with a subline naming the sub-question count and elapsed time, followed by a list of all sub-questions each with its own small spinner.

**Acceptance criteria:**
- Status 'researching' shows label 'Researching…' and a subline of the form 'Investigating N sub-questions, reading sections, and verifying citations · <elapsed>'.
- Each plan sub-question appears as a list item with an animated spinner and its (truncated) question text.
- Elapsed time restarts from ~0 when research begins (startedAt reset on approve).
- If plan is null the count interpolates to empty string and the sub-question list is omitted.

**Edge cases:**
- (low) Approve was reached via a path where plan is null → Subline reads 'Investigating  sub-questions…' (empty count) and no per-question list — slightly degraded but no crash
- (medium) Research runs for many minutes → Elapsed switches to 'Nm Ns'; spinners keep animating; no UI freeze
- (high) User toggles deep-research mode off mid-research → DeepResearchView unmounts but the in-flight workflow continues; toggling back shows the live phase (controller persists in chat page state)
- (medium) Per-question list shows excluded sub-questions → All plan.subQuestions are listed (the displayed list does not filter by `excluded`); verify this matches intent since research only ran on kept ones

**Suspected issues:**
- DeepResearchView.tsx:144-153 — the researching progress list maps over plan.subQuestions (all of them), not the kept set, so excluded sub-questions still appear as 'in progress' during research even though they were pruned.
- src/app/chat/page.tsx:270-271 — onToggleDeepResearch only flips deepMode; it does not cancel/reset an in-flight deepResearch run, so a research run keeps going invisibly when the user leaves deep mode.


### Cancelled result state  
`state` · packages/web/src/components/DeepResearchView.tsx:157-164; packages/web/src/lib/use-deep-research.ts:196-204 · id: `deep-research-cancelled`

Shows a muted banner reading 'Research was cancelled.' with a 'Start over' link button that resets the controller back to idle.

**Acceptance criteria:**
- Status 'cancelled' shows the banner text 'Research was cancelled.'
- A 'Start over' link is present; clicking it calls controller.reset and returns the view to the idle empty state.
- After reset, plan/report/error/question are cleared and runRef is nulled.

**Edge cases:**
- (medium) Start over clicked, then a new question submitted → A fresh planning run begins with no residue from the cancelled run
- (low) Cancelled banner shown in dark mode → muted background/border legible


### Error result state  
`state` · packages/web/src/components/DeepResearchView.tsx:166-177; packages/web/src/lib/use-deep-research.ts:151-154,171-174 · id: `deep-research-error`

On any failure (planning or research), shows a destructive-styled banner with a warning icon, the text 'Deep research failed.', the raw error message (mono, dimmed), and a 'Try again' link that resets to idle.

**Acceptance criteria:**
- Status 'error' shows the warning icon and the text 'Deep research failed.'
- When an error message exists it is shown below in mono small text.
- A 'Try again' link calls controller.reset, returning to idle.
- Error message reflects the actual thrown error (Error.message) or a 'status: X' string.

**Edge cases:**
- (medium) Error message is extremely long (full stack/JSON from backend) → Message renders without breaking layout (should wrap); verify no horizontal overflow
- (medium) Error thrown is a non-Error (string/object) → String(err) is shown; for objects this yields '[object Object]' which is unhelpful
- (high) Network error surfaces sensitive internal detail (URLs, tokens) in message → Raw backend error text is shown verbatim to the user — verify nothing sensitive leaks
- (low) Try again clicked then immediate resubmit → Clean new run; no stale error shown

**Suspected issues:**
- use-deep-research.ts:152,172 — the raw err.message / String(err) is rendered directly to the user (DeepResearchView.tsx:171), so backend/internal error text (potentially containing internal endpoints or stack detail) is surfaced verbatim.


### Deep research report (markdown body)  
`feature` · packages/web/src/components/DeepResearchReport.tsx:33-55,7-8 · id: `deep-research-report-render`

On completion (status 'done' with a report), renders the report markdown via ReactMarkdown inside a prose container. Links are forced to open in a new tab with rel='noopener noreferrer' and accent hover styling.

**Acceptance criteria:**
- Container has data-testid='deep-research-report'.
- report.reportMarkdown renders as formatted HTML (headings, lists, bold, paragraphs) within the prose styles.
- All anchor tags in the report open in a new tab (target='_blank') and carry rel='noopener noreferrer'.
- Prose styling adapts to dark mode (dark:prose-invert).

**Edge cases:**
- (high) Report markdown contains a raw HTML/script tag → react-markdown does not render raw HTML by default (no rehype-raw), so script/HTML is escaped — verify no XSS
- (high) Markdown link with a javascript: or data: URL → href is passed straight into the anchor; react-markdown sanitizes javascript: URIs by default, but verify the custom `a` renderer doesn't bypass that
- (low) Empty reportMarkdown string → Article renders empty; verification line and sources/stats still show
- (medium) Extremely long report (tens of thousands of words) → Renders without freezing; scroll performance acceptable
- (low) Malformed markdown (unbalanced code fences, broken tables) → Degrades gracefully to readable text; no crash

**Suspected issues:**
- DeepResearchReport.tsx:39-54 — the custom `a` renderer forwards href unmodified; rely on react-markdown's default URL sanitization. Confirm no rehype-raw is added elsewhere, since the report markdown is model-generated and only as trustworthy as the agent.


### Citation verification banner  
`feature` · packages/web/src/components/DeepResearchReport.tsx:10-31 · id: `deep-research-verification`

A small badge above the report reports citation grounding. If fabricatedCitations === 0 it shows a green shield 'Citations verified: G/C resolve…'; otherwise an amber shield warning that N of C citations did not match a retrieved source and were demoted. Hidden entirely when verification is null.

**Acceptance criteria:**
- Element has data-testid='deep-research-verification' when verification is non-null.
- When fabricatedCitations === 0: green styling, ShieldCheck icon, text 'Citations verified: <grounded>/<checked> resolve to retrieved corpus sources'.
- When fabricatedCitations > 0: amber styling, ShieldAlert icon, text '<fabricated> of <checked> citation(s) did not match a retrieved source and were demoted'.
- When verification is null the banner is not rendered at all.

**Edge cases:**
- (medium) checkedCitations === 0 and fabricatedCitations === 0 → Green banner shows '0/0 resolve…' — arguably misleading (no citations to verify); verify desired copy
- (low) fabricatedCitations === 1 → Pluralization renders 'citation(s)' (always parenthesized) — acceptable but not grammatically tailored for 1
- (low) groundedCitations > checkedCitations (inconsistent backend data) → Displays raw numbers as-is (e.g. 5/3); no validation/clamping
- (low) Banner color in dark vs light → emerald/amber tokens have dark: variants so text stays legible in both themes

**Suspected issues:**
- DeepResearchReport.tsx:25-26 — '0/0 resolve to retrieved corpus sources' renders as a green 'verified' badge when nothing was actually checked; potentially misleading positive signal.


### Sources consulted (collapsible)  
`control` · packages/web/src/components/DeepResearchReport.tsx:57-101 · id: `deep-research-sources`

A collapsible <details> block listing all consulted sources, split into 'Authoritative — NC Medicaid corpus' (with optional links) and 'Supplementary — web' (always links). The summary shows the combined count. The whole block is hidden when there are no sources.

**Acceptance criteria:**
- When corpusSources or webSources is non-empty, a <details> with summary 'Sources consulted (N)' renders, N being corpusSources.length + webSources.length.
- Clicking the summary expands/collapses the lists.
- Corpus sources with a non-null link render as new-tab anchors; those with null link render as plain text labels.
- Web sources always render as new-tab anchors using title/url.
- When both source arrays are empty, the entire <details> block is omitted.
- A corpus or web sub-section header only renders when its list is non-empty.

**Edge cases:**
- (low) Corpus source with duplicate keys → key={s.key} collision warning if backend emits duplicate keys; possible render dedup
- (low) Web source with duplicate URL → key={s.url} collision for duplicate URLs
- (medium) Very long source labels/titles → Each <li> is truncated (truncate class) to one line; full text not shown — verify acceptable
- (high) Source link is a malformed or javascript: URL → Anchor href is set directly from s.link/s.url with no sanitization; a javascript: href would be a clickable vector
- (low) Source label is empty string → Empty <li> renders (blank line)

**Suspected issues:**
- DeepResearchReport.tsx:71-77,91-93 — corpus and web source anchors set href directly from backend-provided s.link / s.url with no protocol validation, unlike the report-body links which go through react-markdown's sanitizer. A malicious/garbage javascript: URL in a source would be clickable.
- DeepResearchReport.tsx:59-61 vs 104-106 — the summary count uses corpusSources.length + webSources.length while the footer uses report.stats.corpusSourceCount/webSourceCount; if the stats and arrays disagree the two numbers will differ in the UI.


### Report stats footer  
`feature` · packages/web/src/components/DeepResearchReport.tsx:103-107 · id: `deep-research-stats`

A small footer line summarizing the run: sub-question count, reflection rounds (singular/plural), corpus source count, and—only when > 0—web source count.

**Acceptance criteria:**
- Footer shows '<subQuestionCount> sub-questions · <reflectionRounds> reflection round(s) · <corpusSourceCount> corpus sources'.
- 'reflection round' is singular when reflectionRounds === 1, otherwise 'reflection rounds'.
- '· N web sources' segment appears only when stats.webSourceCount > 0.

**Edge cases:**
- (low) subQuestionCount === 1 → Text reads '1 sub-questions' (no singular handling) — minor grammar issue
- (low) All counts zero (degenerate report) → Shows '0 sub-questions · 0 reflection rounds · 0 corpus sources' and omits web segment

**Suspected issues:**
- DeepResearchReport.tsx:104 — 'sub-questions' and 'corpus sources' are not singularized for count 1, unlike 'reflection round(s)'.


### Done state requires report object  
`state` · packages/web/src/components/DeepResearchView.tsx:179 · id: `deep-research-done-no-report`

The report view only renders when status === 'done' AND report is non-null; if done with a null report, nothing renders inside the view body.

**Acceptance criteria:**
- Status 'done' with a non-null report renders DeepResearchReportView.
- Status 'done' with report === null renders only the header (no report, no error) — a blank pane.

**Edge cases:**
- (low) Backend reports success but result is undefined/null → use-deep-research sets error in that path (status not set to 'done' without result), so this shouldn't occur; verify the guard holds


### Theme toggle dropdown  
`control` · packages/web/src/components/ThemeToggle.tsx:19-42 · id: `theme-toggle`

A header button that opens a dropdown radio menu with System / Light / Dark options. The trigger icon reflects the currently resolved theme (Moon when dark, Sun otherwise); selecting an option calls setTheme and closes the menu.

**Acceptance criteria:**
- The trigger button has aria-label 'Toggle theme' and shows a Moon icon when resolvedTheme === 'dark', else a Sun icon.
- Opening the menu shows three radio items: System (Monitor icon), Light (Sun), Dark (Moon).
- The currently selected theme is indicated via menuitemradio aria-checked and a visible check indicator.
- Selecting an option calls setTheme with that value and closes the dropdown (closeOnClick).
- Switching to Light/Dark immediately toggles the document's dark class accordingly.
- Switching to System resolves to the OS prefers-color-scheme value.

**Edge cases:**
- (medium) Keyboard-only navigation of the dropdown → Trigger focusable; arrow keys move between radio items; Enter/Space selects; menu closes and focus returns to trigger
- (medium) OS theme changes while 'system' is selected and menu is open → resolvedTheme updates via matchMedia listener; trigger icon and document class follow
- (low) Rapidly switching options many times → Each selection fires setThemeAction; last write wins on the server; UI matches the final selection
- (low) Toggle used in the deep-research report (prose dark:prose-invert) → Report body restyles correctly between light/dark without reload


### Theme resolution & document class application  
`state` · packages/web/src/components/ThemeProvider.tsx:36-72,53-54 · id: `theme-provider-resolve`

ThemeProvider resolves the active theme ('system' → matchMedia result) and toggles the document's 'dark' class whenever theme or system preference changes. System preference is tracked via useSyncExternalStore subscribed to the prefers-color-scheme media query.

**Acceptance criteria:**
- With theme 'light' the document html lacks the 'dark' class; with 'dark' it has it.
- With theme 'system' the 'dark' class matches the OS prefers-color-scheme at all times, updating live when the OS setting changes.
- resolvedTheme exposed to consumers is 'light' or 'dark' (never 'system').
- No hydration mismatch warning on first load (server snapshot is 'light'; pre-paint script already applied the real class).

**Edge cases:**
- (medium) User on 'system' with dark OS preference loads the page → Pre-paint inline script applies 'dark' before paint (no white flash); useSyncExternalStore settles to 'dark' without a visible flip
- (low) OS toggles light↔dark while on 'system' → applyTheme re-runs (effect depends on systemTheme) and toggles the class live
- (low) matchMedia unsupported / SSR → getSystemTheme returns 'light' on server; subscribe is a no-op; no crash
- (low) First post-hydration render before store resolves → applyTheme uses getSystemTheme() directly (not the store snapshot) so it can't briefly apply the wrong theme


### Theme persistence (cookie + WorkOS metadata) & cross-device sync  
`api` · packages/web/src/components/ThemeProvider.tsx:58-64,74-77; packages/web/src/app/actions/theme.ts:23-60 · id: `theme-persistence`

setTheme writes the choice to a year-long cookie and, for authenticated users, to WorkOS user metadata. On mount the provider calls getThemeAction to reconcile from the server (cookie, falling back to user metadata which backfills the cookie), so a theme saved on another device propagates.

**Acceptance criteria:**
- Selecting a theme persists across reload (cookie set with path '/', 1-year maxAge, sameSite lax).
- For an authenticated user, the choice is also written to WorkOS user.metadata.theme.
- On a device whose cookie is missing/stale but where user metadata has a theme, the provider adopts the metadata theme on mount and backfills the cookie.
- setThemeAction ignores any value that is not 'light'/'dark'/'system' (server-side validation).
- getThemeAction returns null when neither cookie nor user metadata holds a valid theme.
- Unauthenticated users still get cookie persistence (no WorkOS write).

**Edge cases:**
- (high) User changes theme, then getThemeAction (fired on mount) resolves with a DIFFERENT stored value → The mount-time getThemeAction can overwrite a just-made selection because its setThemeState is unconditional; could cause a visible flip-back
- (high) WorkOS updateUser fails/times out when saving → Cookie is already set (write happens first), so local persistence holds; the metadata write failure is unhandled (no try/catch) — could throw inside the server action
- (medium) withAuth() throws or session expired during setThemeAction → Cookie set succeeds; the subsequent withAuth/updateUser may throw, surfacing as a server action rejection (void-awaited on client, so swallowed)
- (low) Malicious client posts theme='evil' directly to the server action → isTheme guard rejects it; no cookie/metadata write (early return)
- (low) user.metadata contains a non-string theme value → isTheme returns false; getThemeAction returns null and falls back to cookie/system
- (low) Cookie present but with an invalid value → isTheme(fromCookie) false → falls through to user metadata

**Suspected issues:**
- ThemeProvider.tsx:58-64 — the mount getThemeAction unconditionally setThemeState(saved) with no guard against a more recent local selection; if a user picks a theme and the async server read resolves slightly later with the previously-stored value, the UI can flip back to the old theme (race condition).
- actions/theme.ts:37-41 — workos.userManagement.updateUser is not wrapped in try/catch; a WorkOS API failure throws out of the server action. setTheme on the client awaits via `void`, so the rejection is unhandled (unhandled promise rejection) and the metadata write is silently lost without user feedback.
- actions/theme.ts:11 vs layout.tsx:17 — the cookie name 'theme' is duplicated as a string literal in the inline pre-paint script and the action; a rename in one place silently breaks FOUC prevention.


### Deep-research mode entry & question submission  
`workflow` · packages/web/src/app/chat/page.tsx:91-117,219-220,270-271 · id: `deep-research-mode-toggle-integration`

On the chat page a composer toggle enables deep-research mode; submitting the input in deep mode calls deepResearch.start(question) (instead of sending a chat message) and the main pane swaps to DeepResearchView. The composer's loading state reflects deepResearch.isBusy and the stop button is hidden in deep mode.

**Acceptance criteria:**
- With deepMode on, submitting a question starts a deep-research run (planning) and the pane shows DeepResearchView.
- With deepMode off, submitting sends a normal chat message.
- The composer is shown as loading while deepResearch.isBusy (planning or researching).
- The stop button is not offered in deep mode (onStop undefined).
- Inputs over 10,000 chars or blank are rejected before starting (handleSend guard).

**Edge cases:**
- (high) Toggle deep mode OFF while a research run is in progress → Run continues in the background (controller persists); chat view shows; toggling back reveals the still-running phase — but there is no way to cancel it from outside deep mode
- (medium) Submit a 10,001-char question in deep mode → handleSend early-returns; no run starts
- (high) Submit while deepResearch.isBusy → Composer should be disabled via isLoading; verify a second start() can't clobber the active run
- (low) Toggle deep mode on with an existing chat conversation → Chat messages are hidden behind the deep-research view; switching back restores them

**Suspected issues:**
- src/app/chat/page.tsx:109-111 — calling deepResearch.start while a previous run is mid-flight is not guarded here beyond the composer's isLoading; if the composer isn't disabled in time a new start() resets plan/report and orphans the prior run (runRef is overwritten).
- src/app/chat/page.tsx:270-271 — onToggleDeepResearch only flips a boolean; it neither resets nor cancels the controller, so deep-research state persists invisibly across mode switches.


## Agent API the UI depends on

### POST /chat (agent streaming chat route)  
`api` · packages/agent/src/index.ts:241 · id: `chat-stream-endpoint`

The primary user-facing endpoint: the chat UI (useChatThread -> DefaultChatTransport) POSTs UIMessages plus {memory:{thread,resource}} to /chat and receives a streamed AI-SDK v6 response (text deltas + tool-call parts). Backs every question a user asks in /chat.

**Acceptance criteria:**
- An authenticated user sending a question to POST /chat (Bearer token + credentials:include) receives a streamed assistant response that renders incrementally in MessageList.
- The response stream includes tool-call/tool-result parts that SourcesPanel can extract into citations.
- Messages are persisted to the thread's memory (savePerStep:true) so reloading or re-selecting the thread shows the completed answer.
- The run honors maxSteps=99 and, when about to exhaust steps on a tool-calls turn, forces a final synthesized markdown answer (onIterationComplete) rather than terminating empty.
- When VERIFIER_ENABLED!=='false' the hallucination output processor runs on the web stream path before content reaches the user.
- A request without a valid WorkOS token is rejected by Mastra auth (not streamed).

**Edge cases:**
- (high) Long-running research run exceeds the chat transport / proxy idle timeout before the 10-minute server timeout (index.ts:221) → Stream should either complete within server 10min window or surface a clear error in useChatThread.onError; client must not hang indefinitely showing 'streaming'
- (medium) Agent hits MAX_STEPS=99 with finishReason==='tool-calls' → onIterationComplete injects forced-synthesis feedback and returns continue:false so the user gets a final markdown answer citing what was/wasn't found
- (high) PromptInjectionDetector (threshold 0.8, strategy 'block') classifies a legitimate policy question as injection/jailbreak → Request is blocked; UI surfaces a comprehensible error instead of a silent empty stream — false-positive block is a real UX risk
- (high) User-supplied memory.resource in the POST body differs from the authenticated user id → bindResourceToAuthenticatedUser overrides client resource with MASTRA_RESOURCE_ID_KEY so the run reads/writes only the caller's own thread (anti-IDOR)
- (medium) TokenLimiterProcessor limit (128k) reached by very long thread history → Input is truncated/limited rather than erroring the whole request
- (medium) OPENAI_API_KEY valid but Anthropic AGENT_MODEL key missing/invalid at runtime → Startup validateEnv catches missing ANTHROPIC_API_KEY for claude- models; a runtime key revocation surfaces as a stream error captured by Sentry (route:'chat')
- (high) Mid-stream model/tool error → defaultOptions.onError logs + captures to Sentry; client onError logs; partial messages handled and user sees an error rather than a frozen UI
- (medium) Network drop mid-stream → useChat enters 'error' status; user can retry/regenerate; no duplicate persisted messages
- (low) Empty or whitespace-only message body → Handled gracefully (no crash); ideally a no-op or validation rather than an empty agent run

**Suspected issues:**
- index.ts:221 server timeout is 10 min but the browser chat transport has no explicit client timeout; a stalled stream can leave useChatThread stuck in 'streaming' (use-chat-thread.ts:114) with no recovery path.
- index.ts:248 onStepFinish only log.debug — there is no server-side guard that a forced-synthesis turn actually produced text; if the model returns empty after forced synthesis the user gets a blank assistant message.
- CORS origin defaults to http://localhost:3000 only (index.ts:229); a production deploy missing CORS_ORIGINS would silently block the real web origin's credentialed requests.


### Server auth gate (WorkOS) + resource binding for all agent/memory routes  
`role` · packages/agent/src/index.ts:222 · id: `chat-auth-gate`

All custom and built-in agent/memory routes are protected by a MastraAuthWorkos subclass whose authorizeUser() returns true (any authenticated WorkOS user is allowed). bindResourceToAuthenticatedUser middleware then forces every memory/thread/chat request onto the caller's own resource id. This is the single permission model the entire UI relies on.

**Acceptance criteria:**
- Any request to /chat, /feedback, /corpus-status, or memory/thread routes without a valid WorkOS bearer token is rejected (401/unauthorized) — only /healthz is public.
- Any authenticated WorkOS user is authorized (no role/tenant restriction) per authorizeUser()===true.
- Memory reads/writes/deletes operate only on the authenticated user's resource: a user cannot read or modify another user's threads, messages, or working memory even if they supply a different resourceId.
- The resource binding middleware runs AFTER Mastra auth so the 'user' is present in requestContext.

**Edge cases:**
- (high) Expired/invalid WorkOS access token sent by the UI (token refresh lag) → Request rejected; UI's getAccessToken should refresh or the feature degrades gracefully (feedback reverts optimistically, corpus-status omits the line)
- (high) Authenticated user A supplies thread/resource belonging to user B in memory API or /chat body → bindResourceToAuthenticatedUser overrides resource to A; @mastra/memory rejects B's threads — A sees their own data only
- (medium) requestContext present but user object lacks both userId and id → userId resolves null; middleware skips binding (does not crash); downstream resource-scoped routes return 401 via getResourceId null-check
- (low) WorkOS token valid but for a user with no prior threads → Empty thread list / fresh memory, no error
- (medium) authorizeUser always true means a deactivated/deprovisioned WorkOS user with a still-valid token retains access → Acceptable for MVP but worth noting — no per-request revocation check beyond token validity

**Suspected issues:**
- index.ts:223 authorizeUser() returns true for ANY authenticated user — there is no allowlist/role check, so anyone who can complete WorkOS login can use the agent. Acceptable per greenfield, but a tester should confirm this is intended.
- auth-middleware.ts:22 relies on rc?.set existing; if a future Mastra version changes the requestContext shape the IDOR protection silently no-ops (userId set guarded but no assertion/log if binding is skipped).


### POST /feedback (submit/upsert thumbs + comment)  
`api` · packages/agent/src/feedback/routes.ts:84 · id: `feedback-submit`

Backs the thumbs-up/down and comment controls (MessageActions -> useFeedback -> submitFeedback). Validates body with Zod, scopes to the authenticated resourceId, and upserts into the feedback table keyed by (message_id, resource_id). Returns 201 for new, 200 for re-rating, with the stable feedback id.

**Acceptance criteria:**
- POST with valid {messageId, threadId, rating:'up'|'down', comment?} and a token returns {id} with 201 on first submit, 200 on re-rate of the same message.
- Re-rating the same message keeps the same id and created_at (stable across rating/comment changes) so the optimistic UI can hold the id.
- A 'down' rating with a comment persists the comment; an 'up' rating stores comment as null regardless of input.
- Invalid JSON returns 400 {error:'Invalid JSON'}; schema failure returns 400 {error:'Validation failed', details}; missing auth returns 401.
- The feedback row is scoped to the caller's resourceId (one user cannot create feedback attributed to another).

**Edge cases:**
- (low) rating value other than 'up'/'down' (e.g. 'star') → Zod enum rejects with 400 Validation failed
- (low) Empty-string messageId or threadId → z.string().min(1) rejects with 400
- (medium) Submit 'up' rating with a comment via direct API call → comment silently dropped (stored null) with no error — caller may expect it saved
- (medium) Two concurrent submits for the same (messageId,resourceId) (double-click) → ON CONFLICT upsert keeps a single row; last write wins on rating/comment; no duplicate-key error
- (medium) Very long comment (e.g. 100KB) → No max-length validation in schema or column — stored as-is; should not crash but unbounded storage is a risk
- (high) messageId is a client-generated fallback because the assistant message had no real id (parse-message.ts:69) → Feedback saves but won't reconcile after reload since the fallback id is not stable — feedback appears lost on refresh
- (medium) LibSQL volume read-only (SQLITE_READONLY) on Railway → Upsert throws -> route onError -> 500; UI's useFeedback reverts the optimistic rating
- (low) ensureTable race on cold start (first two requests both run CREATE TABLE IF NOT EXISTS) → Idempotent CREATE IF NOT EXISTS tolerates the race; no error

**Suspected issues:**
- repository.ts:86 silently nulls comment for 'up' ratings; a direct API consumer sending up+comment gets a 200 with the comment discarded and no warning.
- FeedbackBodySchema (routes.ts:7) has no max length on comment; combined with no DB length cap, a malicious/buggy client can store arbitrarily large comments.
- parse-message.ts:69 fallback messageId means feedback for messages lacking a stable id does not survive reload — getByThread will key the persisted row to a different (real DB) message id on next load.


### GET /feedback?threadId= (load persisted feedback for a thread)  
`api` · packages/agent/src/feedback/routes.ts:88 · id: `feedback-get`

Backs useFeedback.loadFeedback, called when a thread is loaded/selected so previously-submitted thumbs/comments re-appear on the right messages. Returns {feedback: FeedbackEntry[]} scoped to threadId AND the authenticated resourceId.

**Acceptance criteria:**
- GET with a valid token and ?threadId= returns {feedback:[...]} containing only the caller's feedback for that thread.
- Each entry includes id, messageId, rating, comment, createdAt so the UI can rebuild feedbackMap keyed by messageId.
- Missing threadId query param returns 400 {error:'threadId query parameter is required'}.
- Missing auth returns 401.
- A thread with no feedback returns {feedback:[]} (200), not an error.

**Edge cases:**
- (high) threadId belonging to another user → WHERE resource_id = caller filters it out -> empty array; no cross-user leak
- (low) threadId with special chars / not URL-encoded by a non-UI caller → client encodeURIComponent handles UI path; raw param bound as SQL parameter so no injection
- (medium) User switches threads while a GET is in flight (race) → useFeedback.loadFeedback checks isActive() after await and drops the stale response so it doesn't overwrite the newer thread's map
- (medium) DB read fails → Throws -> route onError 500; useFeedback.loadFeedback catches and logs, leaving feedbackMap unchanged (no crash)
- (low) Empty-string threadId (?threadId=) → c.req.query returns '' which is falsy -> 400 required-param error

**Suspected issues:**
- getByThread (repository.ts:108) returns all matching rows with no pagination; a thread with thousands of feedback rows would return them all in one response (unbounded), though unlikely per-thread.


### DELETE /feedback/:id (clear a rating)  
`api` · packages/agent/src/feedback/routes.ts:92 · id: `feedback-delete`

Backs useFeedback.handleClearRating — when a user un-toggles their thumbs rating the UI deletes the feedback row. Scoped to id AND the authenticated resourceId; returns 204 on success, 404 if no matching row.

**Acceptance criteria:**
- DELETE /feedback/:id with a valid token deletes the caller's row and returns 204 with no body.
- Deleting a non-existent id, or an id owned by another user, returns 404 {error:'Feedback not found'}.
- Missing :id returns 400; missing auth returns 401.
- After a successful delete the rating no longer appears when the thread is reloaded.

**Edge cases:**
- (high) Delete an id that belongs to another user → DELETE ... WHERE resource_id = caller affects 0 rows -> 404 (no cross-user delete)
- (medium) Double delete (UI optimistic clear then a retry) → First returns 204, second returns 404; UI handleClearRating reverts on the 404-throw which could re-show a rating that is actually gone
- (medium) Optimistic delete then server failure (network/500) → handleClearRating restores the previous feedback entry so the UI rating reappears
- (low) DELETE with empty path segment → Routing won't match /feedback/:id with empty id; behavior should be 404 not a crash

**Suspected issues:**
- use-feedback.ts:91 deletes by prev.id, but for an optimistically-rated-but-not-yet-confirmed message the id may still be the messageId fallback (use-feedback.ts:69) rather than the real server id; a clear before the submit round-trips could 404 and incorrectly revert.
- routes.ts:74 correctly uses c.body(null,204) (comment notes c.json(null,204) throws) — verify Hono version still honors this; a regression here would 500 every clear.


### GET /corpus-status (corpus freshness signal)  
`api` · packages/agent/src/corpus-status.ts:57 · id: `corpus-status`

Backs the EmptyState freshness line ('N documents · last updated DATE'). Queries Neo4j for max(Document.last_indexed) and count(Document), cached 5 minutes server-side. The UI (useCorpusStatus) fetches once per mount and renders nothing on any failure or non-numeric body.

**Acceptance criteria:**
- GET with a valid token returns {lastUpdated: ISOstring|null, documentCount: number} (200).
- EmptyState shows the document count and last-updated date only when documentCount is a number and lastUpdated is present.
- On Neo4j failure the route returns 503 {error:'Corpus status unavailable'} and the UI silently omits the freshness line (renders null) rather than an invented date.
- Repeated requests within 5 minutes are served from the in-memory cache (single Neo4j query per window).
- Missing auth returns 401 (route is auth-protected by default; UI sends Bearer token).

**Edge cases:**
- (medium) Empty graph (no Document nodes) right after a fresh deploy → Returns {lastUpdated:null, documentCount:0}; EmptyState renders documentCount 0 but corpusUpdated is null — verify the line either hides or shows '0 documents' sensibly
- (medium) Pipeline finishes a re-index but an empty/0 result was cached <5min ago → Stale {documentCount:0} served for up to 5 minutes after data exists — freshness line lags reality by up to TTL
- (medium) Neo4j returns last_indexed in a non-ISO/invalid date format → new Date(...).toISOString() could throw or yield 'Invalid Date'; route should still respond (handler catches into 503) but a bad date string could surface as Invalid Date in UI
- (low) Neo4j down / network blip → 503 from route; useCorpusStatus catches and leaves status null; empty state simply omits the line
- (medium) Token missing on first mount (auth still resolving) → useCorpusStatus returns early (no token) and never fetches; line stays hidden until a re-mount with a token
- (low) documentCount exceeds JS safe integer via Neo4j BigInt → toNumber() used; extremely large counts could lose precision but corpus size is small — low impact

**Suspected issues:**
- corpus-status.ts:14 module-level cache is process-global and shared across all users; a 0/empty result cached at cold start persists 5 min even after the pipeline loads documents, so the freshness line can be wrong/absent right after first deploy.
- corpus-status.ts:31 new Date(lastUpdated.toString()).toISOString() will throw 'Invalid time value' if last_indexed isn't parseable; that throw is caught by handleCorpusStatusRequest -> 503, masking corpus health behind a generic error rather than logging the bad node.
- useCorpusStatus (use-corpus-status.ts:32) early-returns when getAccessToken yields no token and never retries within that mount — if the token arrives slightly later the freshness line stays hidden until remount.


### GET /healthz (public liveness/readiness)  
`api` · packages/agent/src/index.ts:263 · id: `healthz`

Public (requiresAuth:false) health endpoint used by Railway deploy gating. Checks Neo4j connectivity (RETURN 1) and LibSQL write-ability (probeWritable). Not consumed by the in-app UI directly but gates whether a deploy serving the UI's backend is promoted; a degraded backend breaks chat + feedback for all users.

**Acceptance criteria:**
- GET /healthz (no auth) returns 200 {status:'ok', neo4j:'connected', storage:'writable'} when both subsystems are healthy.
- Returns 503 {status:'degraded',...} when Neo4j is unreachable OR storage is read-only.
- A read-only LibSQL volume causes storage:'readonly' and a 503 so Railway keeps the prior healthy deploy (prevents promoting a write-broken backend).
- The endpoint is reachable without a WorkOS token.

**Edge cases:**
- (medium) Neo4j transient blip during a healthcheck → 503 returned; the cause is only in logs (healthz.neo4j_failed) — on-call can't tell blip from outage from the response alone
- (low) Storage write probe itself fails to even create the probe table → probeWritable returns false (storage:'readonly') and resets probeInitialized to retry next call
- (low) Healthcheck frequency hammers probeWritable -> a write on every call → Fixed id=1 upsert means no row growth, but every probe is a write — on a marginal/read-mostly volume this adds load
- (high) Neo4j connected but storage readonly → ok=false -> 503 degraded; deploy not promoted (this is the key MVP safety property)

**Suspected issues:**
- repository.ts:43 probeWritable writes on every /healthz call; if the healthcheck interval is aggressive this is constant write traffic to the shared chat-memory DB file.
- index.ts:287 shadows the outer `storage` const name with a local `storage` health string inside the handler — harmless but a readability/lint smell.


### Deep Research workflow (createRun/startAsync/resumeAsync) via Mastra client  
`workflow` · packages/agent/src/index.ts:205 · id: `deep-research-workflow-run`

The deepResearchWorkflow registered on the Mastra server backs the Deep Research mode in /chat (useDeepResearch). The UI creates a run, startAsync to produce a plan that suspends at plan-approval, then resumeAsync with approved:true (optionally edited subQuestions) or approved:false to get a cited report or a cancelled result.

**Acceptance criteria:**
- From the browser, mastraClient.getWorkflow('deepResearchWorkflow').createRun() then startAsync({inputData:{question}}) returns status 'suspended' with a plan-approval suspend payload (brief + subQuestions).
- resumeAsync({step:'plan-approval', resumeData:{approved:true}}) returns status 'success' with a DeepResearchReport (reportMarkdown, sources, verification, stats).
- resumeAsync with {approved:false} returns a success result whose report.status==='cancelled'.
- Approving with editedSubQuestions overrides the planned sub-questions for the research phase.
- The workflow run requires authentication (workflow routes are protected like other agent routes).

**Edge cases:**
- (high) Mastra version changes where the suspend payload lives → extractPlan checks suspendPayload[step], steps[step].suspendPayload, and top-level suspendPayload; if all are absent the UI sets error 'Planning ended with status: suspended-ish' — fragile to a 4th location
- (medium) Planning phase exceeds time/token budget or model errors → startAsync rejects/returns non-suspended status; useDeepResearch sets status 'error' with the message; user can reset and retry
- (high) User navigates away / unmounts during researching phase → runRef is lost on unmount; the in-flight resumeAsync result is dropped — no way to recover the report (no run persistence/rehydration in the UI)
- (high) Research phase runs longer than the 10-min server timeout (index.ts:221) → resumeAsync should resolve before timeout or surface an error; a long multi-sub-question research run risks hitting the cap and erroring
- (high) Two users (or two tabs) run deep research; runIds are workflow-scoped not memory-resource-bound → Verify a runId from one session cannot be resumed/observed by another user — the anti-IDOR middleware only binds memory resource, not workflow run ownership
- (low) approve() called with empty editedSubQuestions array → editedSubQuestions?.length is 0 -> falls back to {approved:true} (uses original plan), not an empty plan
- (medium) decline() resume fails after UI already optimistically set 'cancelled' → finishResume sets status 'error' on failure, overriding the optimistic 'cancelled' — verify the UI then shows error not a misleading cancelled state

**Suspected issues:**
- index.ts:204-207 registers deepResearchWorkflow on the server but there is no per-user resource binding for workflow runs analogous to bindResourceToAuthenticatedUser for memory; a runId may be globally resumable/observable by any authenticated user (potential cross-user IDOR on research runs — needs verification against Mastra's workflow auth).
- use-deep-research.ts:116 runRef is component-local: a page reload or unmount during 'researching' loses the run handle and the resulting report is unrecoverable (no run-id persistence), unlike chat which persists to memory.
- use-deep-research.ts:90 extractPlan is version-defensive across 3 payload shapes — a brittle coupling to undocumented Mastra internals that will silently break (UI shows generic error) on a Mastra upgrade.


### Memory thread routes (createMemoryThread / getMemoryThread.listMessages)  
`api` · packages/web/src/lib/use-chat-thread.ts:148 · id: `memory-thread-routes`

Built-in Mastra memory routes the UI calls via MastraClient to create a thread lazily on first send and to list a thread's persisted messages when a thread is selected from the sidebar. Backs thread history restoration and the sidebar.

**Acceptance criteria:**
- createMemoryThread({threadId,resourceId,agentId,title}) creates a thread owned by the authenticated user; calling it for an existing thread does not error the UI (ensureThreadExists swallows the conflict).
- getMemoryThread(...).listMessages() returns the thread's persisted messages, which convertThreadMessageToUIMessage maps into renderable UIMessages.
- A thread created by user A is not listable by user B (resource bound to authenticated user).
- Threads are created lazily on first send (title = the question), never eagerly on '+ New'.

**Edge cases:**
- (high) createMemoryThread sends resourceId of a different user → bindResourceToAuthenticatedUser overrides resource to the caller; thread is created under the caller only
- (high) listMessages for a thread owned by another user → @mastra/memory rejects / returns nothing for a foreign resource; loadThread catches and clears messages rather than leaking
- (medium) savePerStep DB write hasn't settled when user clicks '+New' then back → messageCache in useChatThread serves the completed messages so the user sees the full response, not a partial DB snapshot
- (medium) Slow listMessages response after the user already switched threads → activeThreadRef guard drops the stale response (use-chat-thread.ts:167) so it doesn't overwrite the newer thread
- (medium) Thread with malformed/partial persisted messages (missing role/content) → convertThreadMessageToUIMessage returns falsy and the message is skipped; thread still loads the valid ones
- (high) createMemoryThread fails for a non-conflict reason (e.g. storage readonly) → ensureThreadExists swallows ALL errors; the subsequent send may then fail to persist with no clear user feedback

**Suspected issues:**
- use-chat-thread.ts:156 ensureThreadExists catches and ignores every error (comment says 'may already exist'), so a genuine storage failure (readonly volume) is indistinguishable from a benign conflict — the user proceeds to send and silently loses persistence.
- use-chat-thread.ts:182 on listMessages failure for the active thread it setMessages([]), which can wipe a thread's visible history on a transient memory-route error rather than retaining prior content.

