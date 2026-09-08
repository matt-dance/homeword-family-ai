# Shared UI primitives

Framework: Next.js 15 App Router + React 19. Custom shadcn-style primitives (no Radix). Icons: lucide-react. Class merge: `cn()` from `web/src/lib/utils.ts`.

## Button
- Path: `web/src/components/ui/button.tsx`
- Variants: `default` | `outline` | `ghost` | `destructive`
- Sizes: `default` | `sm` | `lg` | `icon`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:opacity-90",
      outline: "border border-border bg-card hover:bg-muted",
      ghost: "hover:bg-muted",
      destructive: "bg-destructive text-white hover:opacity-90",
    };
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-sm",
      lg: "h-12 px-8 text-lg",
      icon: "h-10 w-10",
    };
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
export { Button };
```

## Input
- Path: `web/src/components/ui/input.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm",
      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
export { Input };
```

## Label
- Path: `web/src/components/ui/label.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-sm font-medium leading-none", className)}
    {...props}
  />
));
Label.displayName = "Label";
export { Label };
```

## Card
- Path: `web/src/components/ui/card.tsx`
- Exports: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border border-border bg-card shadow-sm", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
```

## CardShell
- Path: `web/src/components/chat-tool-shell.tsx`
- Description: Gradient card wrapper used by in-chat tools (quiz, timer, story, howto)

```tsx
"use client";

import type { ReactNode } from "react";

export function CardShell({
  icon,
  title,
  badge,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-primary/5 p-4 sm:p-5 shadow-sm space-y-3.5 transition-all ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2.5 font-semibold text-foreground text-sm sm:text-base">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <span>{title}</span>
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
```

## VoiceGenderPicker
- Path: `web/src/components/voice-gender-picker.tsx`
- Props: `value: "female" | "male"`, `onChange`

```tsx
"use client";

export type VoiceGender = "female" | "male";

interface VoiceGenderPickerProps {
  value: VoiceGender;
  onChange: (value: VoiceGender) => void;
}

export function VoiceGenderPicker({ value, onChange }: VoiceGenderPickerProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Read-aloud voice
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["female", "Female"],
            ["male", "Male"],
          ] as const
        ).map(([gender, label]) => {
          const selected = value === gender;
          return (
            <button
              key={gender}
              type="button"
              onClick={() => onChange(gender)}
              className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/80 text-muted-foreground hover:bg-muted/40"
              }`}
              aria-pressed={selected}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

## LiveLookupsToggle
- Path: `web/src/components/live-lookups-toggle.tsx`
- Props: `checked`, `onChange`, `compact?`

```tsx
"use client";

import { Globe } from "lucide-react";

const SOURCES = [
  { name: "Open-Meteo", detail: "weather and place lookup" },
  { name: "Public sports scoreboards", detail: "today's game scores for named leagues and teams" },
  { name: "Wikipedia", detail: "current facts like who holds an office (e.g. U.S. president)" },
  { name: "Wikipedia Current Events", detail: "the day's featured headlines" },
] as const;

export function LiveLookupsToggle({
  checked,
  onChange,
  compact = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm cursor-pointer transition-colors ${
        checked
          ? "border-primary/40 bg-primary/5 hover:bg-primary/8"
          : "border-border/80 hover:bg-background/80"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary rounded h-4 w-4 mt-0.5 shrink-0"
      />
      <div className="min-w-0 space-y-1.5">
        <p className="font-semibold text-foreground flex items-center gap-1.5">
          <Globe className="h-4 w-4 text-primary shrink-0" />
          Live lookups
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Off unless you turn this on for this child. When they ask about weather,
          sports scores, current facts (like who is president), or current events,
          Homeward checks these named sources — not a generic web search.
        </p>
        <ul className={`text-xs text-muted-foreground ${compact ? "space-y-0.5" : "space-y-1"}`}>
          {SOURCES.map((source) => (
            <li key={source.name}>
              <span className="font-semibold text-foreground">{source.name}</span>
              {" — "}
              {source.detail}
            </li>
          ))}
        </ul>
        {!compact && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Notes from those sources are safety-filtered before the model sees
            them. Homeward will not browse the open web.
          </p>
        )}
      </div>
    </label>
  );
}
```

## ReplyChips
- Path: `web/src/components/reply-chips.tsx`
- Props: `onSend`, `disabled?`

```tsx
"use client";

import { REPLY_CHIPS } from "@/lib/reply-chips";
import { HelpCircle, MessageCircleMore, Sparkles } from "lucide-react";

const CHIP_ICONS = {
  simpler: Sparkles,
  more: MessageCircleMore,
  quiz: HelpCircle,
} as const;

export function ReplyChips({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {REPLY_CHIPS.map((chip) => {
        const Icon = CHIP_ICONS[chip.id];
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onSend(chip.message)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5" />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

## KidChatLink
- Path: `web/src/components/kid-chat-link.tsx`
- Description: Next.js Link wrapper to anonymous Quick Chat path

```tsx
"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { chatPathForQuickChat } from "@/lib/default-profile";

type KidChatLinkProps = Omit<ComponentProps<typeof Link>, "href">;

export function KidChatLink({ children, ...props }: KidChatLinkProps) {
  return (
    <Link href={chatPathForQuickChat()} {...props}>
      {children}
    </Link>
  );
}
```

## cn utility
- Path: `web/src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
