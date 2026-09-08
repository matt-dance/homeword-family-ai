# Extractable DraftComponents

Reusable Superdesign components that appear on multiple pages or define shared chrome.

## Layout Components

### HomewardLogo
- Source: `web/src/components/homeward-logo.tsx`
- Category: layout
- Description: Shield + sparkles mark, Homeward wordmark, optional Local family AI tagline; links to `/`
- Extractable props: size (string, default: "default"), showTagline (boolean, default: false)
- Hardcoded: Shield/Sparkles icons, indigo gradient tile, wordmark text, tagline copy, Link href `/`

### ParentNav
- Source: `web/src/components/parent-nav.tsx`
- Category: layout
- Description: Sticky glass parent header with logo, segmented nav, theme, Quick Chat, logout
- Extractable props: onLogout (callback), activeItem (string: "dashboard" | "profiles" | "settings")
- Hardcoded: nav labels Dashboard/Profiles/Settings, lucide icons, Quick Chat copy, logout aria labels, max-w-5xl chrome

### ThemeToggle
- Source: `web/src/components/theme-toggle.tsx`
- Category: layout
- Description: Ghost sun/moon button toggling light/dark
- Extractable props: size (string, default: "icon"), showLabel (boolean, default: false)
- Hardcoded: Moon/Sun icons, amber/slate colors, aria labels

### ParentLockOverlay
- Source: `web/src/components/parent-lock-overlay.tsx`
- Category: layout
- Description: Full-screen blur modal asking for parent password
- Extractable props: title, description, submitLabel, submittingLabel, onCancel visibility
- Hardcoded: LockKeyhole icon, privacy footer copy, rounded-2xl card layout

### PublicGlassHeader
- Source: repeated in `web/src/app/setup/page.tsx` and `web/src/app/chat/page.tsx` (not extracted)
- Category: layout
- Description: Border-bottom glass bar with HomewardLogo + ThemeToggle
- Extractable props: none beyond composing Logo + ThemeToggle
- Hardcoded: `border-b border-border/70 bg-card/85 backdrop-blur-md px-6 py-4`

## Basic Components

### Button
- Source: `web/src/components/ui/button.tsx`
- Category: basic
- Description: Primary/outline/ghost/destructive button
- Extractable props: variant, size, disabled
- Hardcoded: rounded-lg, focus ring, opacity hover

### Input
- Source: `web/src/components/ui/input.tsx`
- Category: basic
- Description: Text/password/number field
- Extractable props: type, placeholder, value
- Hardcoded: h-10 rounded-lg border-border bg-card

### Label
- Source: `web/src/components/ui/label.tsx`
- Category: basic
- Description: Form label
- Extractable props: htmlFor, children
- Hardcoded: text-sm font-medium

### Card
- Source: `web/src/components/ui/card.tsx`
- Category: basic
- Description: Bordered card with header/title/description/content slots
- Extractable props: children / slot content
- Hardcoded: rounded-xl border-border bg-card shadow-sm, p-6 padding

### CardShell
- Source: `web/src/components/chat-tool-shell.tsx`
- Category: basic
- Description: In-chat tool card with icon, title, optional badge
- Extractable props: title, badge, icon
- Hardcoded: primary/25 border, gradient from-card to-primary/5, rounded-2xl

### KidChatLink
- Source: `web/src/components/kid-chat-link.tsx`
- Category: basic
- Description: Link to anonymous Quick Chat
- Extractable props: children (button chrome supplied by parent)
- Hardcoded: href from `chatPathForQuickChat()`

### VoiceGenderPicker
- Source: `web/src/components/voice-gender-picker.tsx`
- Category: basic
- Description: Two-up Female/Male segmented control
- Extractable props: value, onChange
- Hardcoded: Female/Male labels, h-10 rounded-xl selected primary/10

### LiveLookupsToggle
- Source: `web/src/components/live-lookups-toggle.tsx`
- Category: basic
- Description: Checkbox card listing allowed live data sources
- Extractable props: checked, compact
- Hardcoded: Globe icon, source list (Open-Meteo, sports, Wikipedia), explanatory copy

### ReplyChips
- Source: `web/src/components/reply-chips.tsx`
- Category: basic
- Description: Pill buttons for follow-up chat actions
- Extractable props: disabled
- Hardcoded: chip labels/messages from `REPLY_CHIPS`, lucide icons, rounded-full pills

### BlockedAttemptCard
- Source: `web/src/components/blocked-attempt-card.tsx`
- Category: basic
- Description: Color-coded safety event card (policy / classifier / llm / filter)
- Extractable props: childName, category (drives chrome)
- Hardcoded: category colors, technical details disclosure, quote box

### VoiceListener
- Source: `web/src/components/voice-listener.tsx`
- Category: basic
- Description: Listening visualizer with 16 gradient bars and interim transcript
- Extractable props: audioLevel, interimTranscript, heardSpeech, simpleMode
- Hardcoded: bar count, Listening copy, primary/indigo gradient

### SpeakingIndicator
- Source: `web/src/components/speaking-indicator.tsx`
- Category: basic
- Description: Pill with volume icon + equalizer while reading aloud
- Extractable props: label, simpleMode
- Hardcoded: bounce-gentle bars, primary/10 pill

### ConversationIndicator
- Source: `web/src/components/conversation-indicator.tsx`
- Category: basic
- Description: Status line for conversation mode phases
- Extractable props: phase, hint, simpleMode
- Hardcoded: phase label map
