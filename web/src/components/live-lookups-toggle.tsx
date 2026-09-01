"use client";

import { Globe } from "lucide-react";

const SOURCES = [
  {
    name: "Open-Meteo",
    detail: "weather and place lookup",
  },
  {
    name: "Public sports scoreboards",
    detail: "today's game scores for named leagues and teams",
  },
  {
    name: "Wikipedia Current Events",
    detail: "the day’s featured headlines",
  },
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
          sports scores, or current events, Homeward checks these named sources
          — not a generic web search.
        </p>
        <ul
          className={`text-xs text-muted-foreground ${
            compact ? "space-y-0.5" : "space-y-1"
          }`}
        >
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
