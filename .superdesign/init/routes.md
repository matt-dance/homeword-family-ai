# Routes

File-based Next.js App Router under `web/src/app/`. Parent dashboard and setup are LAN-only (middleware redirects remote clients to `/chat`).

## Route map

| URL | File | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `web/src/app/page.tsx` | Root | Session check splash: HomewardLogo + “Loading Homeward…” then redirect to `/setup` or `/dashboard` |
| `/setup` | `web/src/app/setup/page.tsx` | Root | Multi-step parent onboarding / sign-in (password, recovery, children, Ollama, review) |
| `/chat` | `web/src/app/chat/page.tsx` | Root | Kid profile picker (“Who’s chatting today?”) + Quick Chat entry |
| `/chat/[slug]` | `web/src/app/chat/[slug]/page.tsx` | Root | Kid chat for a named profile or Quick Chat slug; renders `KidChatView` |
| `/dashboard` | `web/src/app/dashboard/page.tsx` | Dashboard | Parent dashboard: metrics, child cards, conversation logs, blocked attempts |
| `/dashboard/profiles` | `web/src/app/dashboard/profiles/page.tsx` | Dashboard | Child profiles: safety, PIN, homework, voice, live lookups, quiet hours, memory notes |
| `/dashboard/settings` | `web/src/app/dashboard/settings/page.tsx` | Dashboard | Ollama engine, parent password, home location, advanced AI/safety, LAN URLs |

API routes (not UI): `web/src/app/api/v1/chat/route.ts`, `web/src/app/api/v1/chat/stream/route.ts`. Other `/api/v1/*` is rewritten to the local gateway.

## Middleware

Path: `web/src/middleware.ts`

- Non-local clients hitting `/dashboard` or `/setup` are redirected to `/chat`
- Parent-only APIs return 403 off-LAN
- Matcher excludes `/api/v1/chat/stream` so SSE is not buffered

## Key page render notes

### `/` Home
Centered column: logo + muted status text. No chrome besides ThemeProvider.

### `/setup`
Gradient page (`from-primary/5`). Glass header (logo + theme). Centered max-w-2xl wizard with step pills, error banner, rounded-2xl Cards. Steps: login, forgot, password, recovery, children (repeatable child cards), model (`OllamaSetup`), review.

### `/chat`
Same glass header. Centered max-w-lg picker: wave emoji hero, optional Quick Chat star card, then child profile rows (age-theme avatar, PIN/homework/lookups chips). Empty and offline error states.

### `/chat/[slug]`
Loading sparkle; not-found/error uses glass header + pick-a-profile CTA; success is full-viewport `KidChatView` with age-theme ambient gradient, PIN gate, transcript, voice, homework camera, tool cards.

### `/dashboard`
`max-w-5xl` main: title + Open Quick Chat, child filter chips, 4 metric cards, optional amber blocked banner, child profile grid, Conversations / Blocked Attempts tabs.

### `/dashboard/profiles`
Same content width: title, “Configured Children” card with add form and per-child edit drawers (strictness slider, PIN, homework, voice, live lookups, quiet hours, parent-approved notes).

### `/dashboard/settings`
Stacked settings cards: Local AI Engine, Parent Password, Home Location, collapsible Advanced Settings, Local Network & Devices.
