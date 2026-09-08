# Page dependency trees

Candidate `--context-file` sets. Apply SUPERDESIGN payload budget before passing all files. Skip `node_modules` and API-only libs unless a design needs their types.

## / (Home)
Entry: `web/src/app/page.tsx`
Layout: `web/src/app/layout.tsx`
Dependencies:
- `web/src/components/homeward-logo.tsx`
- `web/src/lib/api.ts`
- `web/src/lib/parent-session.ts`
  - `web/src/lib/parent-lock.ts`

## /setup
Entry: `web/src/app/setup/page.tsx`
Layout: `web/src/app/layout.tsx`
Dependencies:
- `web/src/components/homeward-logo.tsx`
- `web/src/components/theme-toggle.tsx`
  - `web/src/components/theme-provider.tsx`
  - `web/src/components/ui/button.tsx`
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/label.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/components/ollama-setup.tsx`
  - `web/src/components/ui/button.tsx`
  - `web/src/components/ui/card.tsx`
- `web/src/components/live-lookups-toggle.tsx`
- `web/src/components/voice-gender-picker.tsx`
- `web/src/lib/age-theme.ts`
- `web/src/lib/local-host.ts`
- `web/src/lib/api.ts`
- `web/src/lib/parent-session.ts`

## /chat
Entry: `web/src/app/chat/page.tsx`
Layout: `web/src/app/layout.tsx`
Dependencies:
- `web/src/components/homeward-logo.tsx`
- `web/src/components/theme-toggle.tsx`
  - `web/src/components/theme-provider.tsx`
  - `web/src/components/ui/button.tsx`
- `web/src/components/ui/button.tsx`
- `web/src/lib/age-theme.ts`
- `web/src/lib/default-profile.ts`
- `web/src/lib/slug.ts`
- `web/src/lib/device-profile.ts`
- `web/src/lib/api.ts`

## /chat/[slug]
Entry: `web/src/app/chat/[slug]/page.tsx`
Layout: `web/src/app/layout.tsx`
Dependencies:
- `web/src/components/homeward-logo.tsx`
- `web/src/components/theme-toggle.tsx`
- `web/src/components/ui/button.tsx`
- `web/src/components/kid-chat-view.tsx`
  - `web/src/components/voice-listener.tsx`
  - `web/src/components/speaking-indicator.tsx`
  - `web/src/components/conversation-indicator.tsx`
  - `web/src/components/homework-camera.tsx`
    - `web/src/components/ui/button.tsx`
    - `web/src/components/parent-lock-overlay.tsx`
      - `web/src/components/ui/button.tsx`
      - `web/src/components/ui/input.tsx`
      - `web/src/components/ui/card.tsx`
  - `web/src/components/chat-markdown.tsx`
  - `web/src/components/chat-tools.tsx`
    - `web/src/components/chat-tool-shell.tsx`
    - `web/src/components/quiz-card.tsx`
    - `web/src/components/timer-card.tsx`
    - `web/src/components/story-card.tsx`
    - `web/src/components/ui/button.tsx`
  - `web/src/components/reply-chips.tsx`
  - `web/src/components/ui/button.tsx`
  - `web/src/components/ui/input.tsx`
  - `web/src/components/ui/card.tsx`
  - `web/src/lib/age-theme.ts`
  - `web/src/lib/chat-tools.ts`
  - `web/src/lib/reply-chips.ts`
  - `web/src/hooks/use-voice-conversation.ts`
- `web/src/lib/default-profile.ts`
- `web/src/lib/slug.ts`
- `web/src/lib/device-profile.ts`

## /dashboard
Entry: `web/src/app/dashboard/page.tsx`
Layout: `web/src/app/dashboard/layout.tsx` + `web/src/app/layout.tsx`
Dependencies:
- `web/src/app/dashboard/layout.tsx`
  - `web/src/components/parent-nav.tsx`
    - `web/src/components/homeward-logo.tsx`
    - `web/src/components/kid-chat-link.tsx`
    - `web/src/components/theme-toggle.tsx`
    - `web/src/components/ui/button.tsx`
  - `web/src/components/parent-lock-overlay.tsx`
    - `web/src/components/ui/button.tsx`
    - `web/src/components/ui/input.tsx`
    - `web/src/components/ui/card.tsx`
  - `web/src/hooks/use-parent-lock.ts`
- `web/src/components/kid-chat-link.tsx`
- `web/src/components/blocked-attempt-card.tsx`
  - `web/src/lib/blocked-attempt.ts`
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/lib/age-theme.ts`
- `web/src/lib/slug.ts`
- `web/src/lib/api.ts`

## /dashboard/profiles
Entry: `web/src/app/dashboard/profiles/page.tsx`
Layout: `web/src/app/dashboard/layout.tsx` + `web/src/app/layout.tsx`
Dependencies:
- `web/src/app/dashboard/layout.tsx` (same tree as /dashboard)
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/components/live-lookups-toggle.tsx`
- `web/src/components/voice-gender-picker.tsx`
- `web/src/lib/age-theme.ts`
- `web/src/lib/slug.ts`
- `web/src/lib/api.ts`

## /dashboard/settings
Entry: `web/src/app/dashboard/settings/page.tsx`
Layout: `web/src/app/dashboard/layout.tsx` + `web/src/app/layout.tsx`
Dependencies:
- `web/src/app/dashboard/layout.tsx` (same tree as /dashboard)
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/components/ollama-setup.tsx`
  - `web/src/components/ui/button.tsx`
  - `web/src/components/ui/card.tsx`
- `web/src/lib/local-host.ts`
- `web/src/lib/api.ts`

## Shared theme context for any page
- `web/src/app/globals.css`
- `web/tailwind.config.ts`
- `web/src/lib/theme.ts`
- `web/src/components/theme-provider.tsx`
- `web/src/lib/utils.ts`
