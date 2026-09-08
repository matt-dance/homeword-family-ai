# Homeward design system

Approved direction from Superdesign draft **Homeward Parental AI Dashboard** (`7a74c597-b3bc-496b-8e15-3fdddbaa26b9`). Apply this look across parent and kid surfaces. Do not invent dashboard widgets the product does not have.

## Personality
Warm family dashboard: soft white cards on cool slate, coral-peach brand mark, blue for selection, slate-900 for solid actions. Friendly, local-first, never clinical indigo-tech.

## Type
- Body / UI: Plus Jakarta Sans
- Headings (h1–h4): Outfit, tracking-tight, bold
- Labels: 10–12px, semibold, uppercase, wide tracking, muted

## Color
- Canvas: `#F8FAFC`
- Card: `#FFFFFF` with `border-slate-50` and `0 4px 20px -2px rgba(0,0,0,0.05)`
- Text: slate-800/900, muted slate-500
- Brand accent gradient: `#FF8A65` → `#FFB74D` (logo tile, privacy card, kid hero marks)
- Interactive / selected: `#2563EB` on `#EFF6FF`
- Safe badge: `#ECFDF5` / `#059669`
- Review badge: `#FFFBEB` / `#D97706`
- Solid CTA: `#0F172A` white label (invert in dark mode)

## Shape
- Cards: `rounded-[2rem]`
- Nav rows / primary buttons: `rounded-2xl`
- Secondary buttons / inputs: `rounded-xl`
- Pills: `rounded-full`

## Parent chrome
Fixed 16rem white sidebar on large screens: coral Home mark, rounded-2xl nav rows, optional local-model card, settings + sign out at the bottom. Main column starts after the sidebar. Mobile uses a slim top bar and overlay drawer.

## Components
- Profile tiles: white 2rem card, decorative corner blob, large rounded-3xl avatar, name, age/filter line, status pills
- Activity rows: avatar, “Name asked about …”, italic preview, filter badge, Review action
- Status rows: 12×12 rounded-2xl tinted icon tile + title + caption
- Privacy promo: full accent-gradient card, white type, glass pill link
