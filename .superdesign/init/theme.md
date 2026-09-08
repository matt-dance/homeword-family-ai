# Theme tokens

CSS approach: Tailwind 3 + RGB CSS variables (`rgb(var(--token) / <alpha-value>)`). Dark mode: `class` on `<html>` (`dark` / `light`). System font stack. No custom webfonts.

## Part 1 — Compact token summary

### Colors (space-separated RGB)

| Token | Light (`:root`) | Dark (`.dark`) |
| --- | --- | --- |
| background | 248 250 252 (`#f8fafc`) | 11 15 25 |
| foreground | 15 23 42 (`#0f172a`) | 241 245 249 |
| card | 255 255 255 | 19 26 43 |
| card-foreground | 15 23 42 | 241 245 249 |
| primary | 79 70 229 (`#4f46e5` indigo) | 99 102 241 |
| primary-foreground | 255 255 255 | 255 255 255 |
| primary-50 | 238 242 255 | 30 27 75 |
| muted | 241 245 249 | 28 37 59 |
| muted-foreground | 100 116 139 | 148 163 184 |
| border | 226 232 240 | 33 44 70 |
| accent | 16 185 129 (emerald) | 52 211 153 |
| accent-foreground | 255 255 255 | 15 23 42 |
| destructive | 239 68 68 | 248 113 113 |
| destructive-foreground | 255 255 255 | 15 23 42 |
| ring | 99 102 241 | 129 140 248 |

`prefers-color-scheme: dark` copies the dark palette onto `:root:not(.light)`.

### Extra UI hues (used as Tailwind color classes, not tokens)
- Amber / orange: young age theme, homework mode, blocked-today alerts
- Emerald / teal: curious age theme, success, Ollama ready
- Indigo / violet: teen theme, primary gradients (`from-primary to-indigo-500`)
- Sky: live lookups, LLM-error blocked category
- Blue: dashboard “child profiles” metric

### Typography
- Family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Features: `"cv02", "cv03", "cv04", "cv11"`
- Page titles: `text-2xl sm:text-3xl font-extrabold tracking-tight`
- Card titles: `text-lg`–`text-xl font-bold` / `font-semibold`
- Body: `text-sm`; helper: `text-xs`; uppercase labels: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Kid chat scales by age theme (`text-lg` young / `text-sm sm:text-base` curious / `text-sm` teen)

### Radius
- Buttons/inputs default: `rounded-lg`
- Cards: `rounded-xl`
- Feature cards / overlays / chat rows: `rounded-2xl`
- Young chat bubbles: `rounded-3xl`
- Filter chips / reply chips: `rounded-full`

### Shadows
- `shadow-xs` / `shadow-sm` on cards and nav
- `shadow-sm shadow-primary/20` on primary CTAs
- `shadow-glow`: `0 0 20px -5px rgb(var(--primary) / 0.3)`
- `shadow-glow-accent`: accent equivalent
- `shadow-card` / `shadow-card-hover` (defined in Tailwind extend)
- Overlay: `shadow-2xl`

### Spacing / layout
- Parent content: `mx-auto max-w-5xl p-4 sm:p-8 space-y-6`
- Setup: `max-w-2xl`; chat picker: `max-w-lg`
- Nav inner: `max-w-5xl px-4 py-3 sm:px-6`
- Card padding: header `p-6`, content `p-6 pt-0` (often overridden to `p-4` / `pt-5`)

### Motion
- `animate-fade-in`, `slide-up`, `slide-down`, `pop-in` (cubic-bezier 0.16, 1, 0.3, 1)
- `bounce-gentle`, `pulse-glow`, `shimmer`
- Interactive cards: `interactive-card` lifts `-2px` on hover
- Logo icon scales on hover; theme toggle `active:scale-95`

### Helpers
- `.glass-panel`: 85% white / 82% dark card + blur
- Nav/header: `bg-card/85 backdrop-blur-md`
- Scrollbars: 6px rounded muted thumb

### Age themes (`web/src/lib/age-theme.ts`)
| Theme | Ages | Avatar | Ambient |
| --- | --- | --- | --- |
| young | 5–8 | 🦁 amber→orange | `from-amber-100/40` |
| curious | 9–12 | 🧭 emerald→teal | `from-emerald-100/30` |
| teen | 13–17 | ⚡ indigo→violet | `from-indigo-100/30` |

### Logo
Shield in `from-primary to-indigo-500` rounded-xl tile + amber sparkle. Wordmark “Homeward”. Tagline “Local family AI”. No separate SVG asset file.

## Part 2 — Raw source

### `web/tailwind.config.ts`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground, var(--foreground)) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
          50: "rgb(var(--primary-50, var(--primary)) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--border) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground, var(--foreground)) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground, 255 255 255) / <alpha-value>)",
        },
        ring: "rgb(var(--ring, var(--primary)) / <alpha-value>)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "bounce-gentle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.03)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-down": "slide-down 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pop-in": "pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "bounce-gentle": "bounce-gentle 2s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        shimmer: "shimmer 2.5s infinite linear",
      },
      boxShadow: {
        glow: "0 0 20px -5px rgb(var(--primary) / 0.3)",
        "glow-accent": "0 0 20px -5px rgb(var(--accent) / 0.3)",
        card: "0 2px 10px -2px rgba(0, 0, 0, 0.05), 0 1px 3px -1px rgba(0, 0, 0, 0.03)",
        "card-hover": "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};
```

### `web/src/app/globals.css`

```css
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

:root {
  --background: 248 250 252;
  --foreground: 15 23 42;
  --card: 255 255 255;
  --card-foreground: 15 23 42;
  --primary: 79 70 229;
  --primary-foreground: 255 255 255;
  --primary-50: 238 242 255;
  --muted: 241 245 249;
  --muted-foreground: 100 116 139;
  --border: 226 232 240;
  --accent: 16 185 129;
  --accent-foreground: 255 255 255;
  --destructive: 239 68 68;
  --destructive-foreground: 255 255 255;
  --ring: 99 102 241;
}

.dark {
  --background: 11 15 25;
  --foreground: 241 245 249;
  --card: 19 26 43;
  --card-foreground: 241 245 249;
  --primary: 99 102 241;
  --primary-foreground: 255 255 255;
  --primary-50: 30 27 75;
  --muted: 28 37 59;
  --muted-foreground: 148 163 184;
  --border: 33 44 70;
  --accent: 52 211 153;
  --accent-foreground: 15 23 42;
  --destructive: 248 113 113;
  --destructive-foreground: 15 23 42;
  --ring: 129 140 248;
}

@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: 11 15 25;
    --foreground: 241 245 249;
    --card: 19 26 43;
    --card-foreground: 241 245 249;
    --primary: 99 102 241;
    --primary-foreground: 255 255 255;
    --primary-50: 30 27 75;
    --muted: 28 37 59;
    --muted-foreground: 148 163 184;
    --border: 33 44 70;
    --accent: 52 211 153;
    --accent-foreground: 15 23 42;
    --destructive: 248 113 113;
    --destructive-foreground: 15 23 42;
    --ring: 129 140 248;
  }
}

body {
  background-color: rgb(var(--background));
  color: rgb(var(--foreground));
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

.glass-panel {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dark .glass-panel {
  background: rgba(19, 26, 43, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.25);
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.45);
}

.interactive-card {
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease;
}

.interactive-card:hover {
  transform: translateY(-2px);
}

.interactive-card:active {
  transform: translateY(0);
}
```

### `web/src/lib/theme.ts`

```ts
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "homeward-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") return val;
  } catch {
    // fallback
  }
  return "system";
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}
```
