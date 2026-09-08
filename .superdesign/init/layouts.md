# Shared layouts

Homeward has two visual shells: a minimal root wrapper (all pages) and a parent dashboard shell with sticky nav + idle lock overlay.

## Root layout
- Path: `web/src/app/layout.tsx`
- Renders: HTML shell, FOUC-prevention theme script, `ThemeProvider`, global CSS

```tsx
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeward — Local family AI",
  description: "Local-first family AI gateway. A parent-configured filter for at-home chat — not a babysitter.",
};

const THEME_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('homeward-theme');
    var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased bg-background text-foreground selection:bg-primary/20 selection:text-primary">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

## ThemeProvider
- Path: `web/src/components/theme-provider.tsx`
- Description: light/dark/system theme context; storage key `homeward-theme`

```tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const initial = getStoredTheme();
    setThemeState(initial);
    applyTheme(initial);

    const matchMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const updateResolved = () => {
      const isDark =
        initial === "dark" || (initial === "system" && matchMedia.matches);
      setResolvedTheme(isDark ? "dark" : "light");
    };
    updateResolved();

    const listener = () => {
      const current = getStoredTheme();
      if (current === "system") {
        applyTheme("system");
        setResolvedTheme(matchMedia.matches ? "dark" : "light");
      }
    };
    matchMedia.addEventListener("change", listener);
    return () => matchMedia.removeEventListener("change", listener);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    setStoredTheme(next);
    applyTheme(next);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = next === "dark" || (next === "system" && systemDark);
    setResolvedTheme(isDark ? "dark" : "light");
  };

  const toggleTheme = () => {
    if (resolvedTheme === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

## ThemeToggle
- Path: `web/src/components/theme-toggle.tsx`
- Description: ghost icon button (sun/moon) used in parent nav, setup, chat picker

```tsx
"use client";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
  size?: "default" | "sm" | "icon";
  showLabel?: boolean;
}

export function ThemeToggle({ className, size = "icon", showLabel = false }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={`relative transition-transform active:scale-95 ${className || ""}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-200 transition-transform duration-200 hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="ml-2 text-xs font-medium">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </Button>
  );
}
```

## HomewardLogo
- Path: `web/src/components/homeward-logo.tsx`
- Description: Shield + sparkles mark, wordmark “Homeward”, optional “Local family AI” tagline. Links to `/`.
- Props: `size?: "default" | "sm" | "lg"`, `showTagline?`

```tsx
import { Shield, Sparkles } from "lucide-react";
import Link from "next/link";

interface HomewardLogoProps {
  className?: string;
  size?: "default" | "sm" | "lg";
  showTagline?: boolean;
}

export function HomewardLogo({
  className = "",
  size = "default",
  showTagline = false,
}: HomewardLogoProps) {
  const iconSizes = {
    sm: "h-7 w-7",
    default: "h-9 w-9",
    lg: "h-11 w-11",
  };

  const textSizes = {
    sm: "text-base",
    default: "text-lg",
    lg: "text-2xl",
  };

  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 font-bold transition-opacity hover:opacity-95 ${className}`}
    >
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground shadow-sm shadow-primary/25 transition-transform group-hover:scale-105 ${iconSizes[size]}`}
      >
        <Shield className="h-5 w-5 fill-primary-foreground/20 stroke-[2.2]" />
        <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-300 animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span
          className={`tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text ${textSizes[size]}`}
        >
          Homeward
        </span>
        {showTagline && (
          <span className="text-[11px] font-medium text-muted-foreground -mt-0.5">
            Local family AI
          </span>
        )}
      </div>
    </Link>
  );
}
```

## Dashboard layout
- Path: `web/src/app/dashboard/layout.tsx`
- Description: Auth gate, ParentNav, page children, idle ParentLockOverlay. Loading state is centered “Loading…” text.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { markParentUnlocked } from "@/lib/parent-lock";
import { useParentLock } from "@/hooks/use-parent-lock";
import { ParentNav } from "@/components/parent-nav";
import { ParentLockOverlay } from "@/components/parent-lock-overlay";
import {
  applyAuthMeResult,
  isParentSignedOut,
  leaveParentDashboard,
  parentDashboardShouldRender,
  signOutParentSession,
  type ParentAuthGate,
} from "@/lib/parent-session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<ParentAuthGate>("checking");
  const authEpochRef = useRef(0);
  const { locked, refreshActivity } = useParentLock();

  useEffect(() => {
    const epoch = authEpochRef.current;
    let cancelled = false;

    const reject = () => {
      if (cancelled || epoch !== authEpochRef.current) return;
      setAuth("unauthed");
      if (isParentSignedOut()) {
        leaveParentDashboard();
        return;
      }
      router.replace("/setup");
    };

    if (isParentSignedOut()) {
      reject();
      return () => {
        cancelled = true;
      };
    }

    api
      .me()
      .then(() => {
        const next = applyAuthMeResult({
          signedOut: isParentSignedOut(),
          meOk: true,
          cancelled: cancelled || epoch !== authEpochRef.current,
        });
        if (next !== "authed") {
          reject();
          return;
        }
        markParentUnlocked();
        setAuth("authed");
      })
      .catch(() => reject());

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    authEpochRef.current += 1;
    setAuth("unauthed");
    await signOutParentSession(() => api.logout(), leaveParentDashboard);
  };

  if (!parentDashboardShouldRender(auth)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentNav onLogout={handleLogout} />
      {children}
      {locked && <ParentLockOverlay onUnlock={refreshActivity} />}
    </div>
  );
}
```

## ParentNav
- Path: `web/src/components/parent-nav.tsx`
- Description: Sticky glass header: logo + segmented Dashboard/Profiles/Settings + theme + Quick Chat + logout

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomewardLogo } from "@/components/homeward-logo";
import { KidChatLink } from "@/components/kid-chat-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

interface ParentNavProps {
  onLogout: () => void;
}

export function ParentNav({ onLogout }: ParentNavProps) {
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  const onProfiles = pathname.startsWith("/dashboard/profiles");
  const onSettings = pathname.startsWith("/dashboard/settings");

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md shadow-xs transition-colors">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <HomewardLogo showTagline />

        <nav className="flex items-center gap-1 rounded-xl bg-muted/70 p-1 border border-border/50">
          <Link href="/dashboard">
            <Button
              variant={onDashboard ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onDashboard
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <LayoutDashboard className="mr-1.5 h-4 w-4" />
              <span>Dashboard</span>
            </Button>
          </Link>
          <Link href="/dashboard/profiles">
            <Button
              variant={onProfiles ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onProfiles
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Users className="mr-1.5 h-4 w-4" />
              <span>Profiles</span>
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button
              variant={onSettings ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onSettings
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Settings className="mr-1.5 h-4 w-4" />
              <span>Settings</span>
            </Button>
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <KidChatLink>
            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 text-primary hover:bg-primary/5 font-medium shadow-xs"
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Quick Chat</span>
            </Button>
          </KidChatLink>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Sign out of Parent Dashboard"
            aria-label="Sign out"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
```

## ParentLockOverlay
- Path: `web/src/components/parent-lock-overlay.tsx`
- Description: Full-screen blurred modal for parent password unlock (dashboard idle lock and homework camera)

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LockKeyhole, ShieldCheck, ArrowRight } from "lucide-react";

export interface ParentLockOverlayProps {
  onUnlock: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  submittingLabel?: string;
  mapError?: (message: string) => string | null | undefined;
  authenticate?: (password: string) => Promise<void>;
}

export function ParentLockOverlay({
  onUnlock,
  onCancel,
  title = "Parent Area Locked",
  description = "This computer has been idle. Enter your parent password to continue.",
  submitLabel = "Unlock Dashboard",
  submittingLabel = "Unlocking…",
  mapError,
  authenticate,
}: ParentLockOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError("");
    try {
      await (authenticate ?? ((value: string) => api.login(value)))(password);
      onUnlock();
      setPassword("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const mapped = mapError?.(message);
      if (mapped) {
        setError(mapped);
      } else if (!message || message === "Invalid password" || message === "Request failed") {
        setError("That password doesn't match. Please try again.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-lock-title"
    >
      <Card className="w-full max-w-sm border-border/80 bg-card/95 shadow-2xl rounded-2xl animate-pop-in">
        <CardContent className="pt-8 pb-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <h2 id="parent-lock-title" className="text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {description}
            </p>
          </div>

          <form className="space-y-2 pt-1" onSubmit={handleSubmit}>
            <Input
              type="password"
              placeholder="Parent password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl text-center text-base"
              autoFocus
              autoComplete="current-password"
            />
            {error && (
              <p className="text-xs font-semibold text-destructive text-center animate-slide-down">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              disabled={submitting || !password}
            >
              {submitting ? submittingLabel : submitLabel}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 rounded-xl text-muted-foreground"
              onClick={onCancel}
              disabled={submitting}
            >
              Not now
            </Button>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Local privacy protection active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Public page header pattern (not a shared component)
Setup (`/setup`) and chat picker (`/chat`) repeat the same header: `border-b border-border/70 bg-card/85 backdrop-blur-md` with `HomewardLogo showTagline` left and `ThemeToggle` right. Kid chat (`/chat/[slug]`) uses `KidChatView` as the full page (no ParentNav).
