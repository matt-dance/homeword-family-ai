"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { api } from "@/lib/api";
import { openWebSearchControlState } from "@/lib/open-web-search";

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
    name: "Wikipedia",
    detail: "current facts like who holds an office (e.g. U.S. president)",
  },
  {
    name: "Wikipedia Current Events",
    detail: "the day's featured headlines",
  },
] as const;

export function LiveLookupsToggle({
  checked,
  onChange,
  openWebSearch = false,
  onOpenWebSearchChange,
  compact = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  openWebSearch?: boolean;
  onOpenWebSearchChange?: (next: boolean) => void;
  compact?: boolean;
}) {
  const [engineAvailable, setEngineAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .openWebSearchStatus()
      .then((status) => {
        if (!cancelled) setEngineAvailable(status.available);
      })
      .catch(() => {
        if (!cancelled) setEngineAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLiveChange = (next: boolean) => {
    onChange(next);
    if (!next) onOpenWebSearchChange?.(false);
  };

  const web = openWebSearchControlState({
    liveLookupsOn: checked,
    openWebSearch,
    engineAvailable,
  });

  return (
    <div
      className={`rounded-xl border p-3 text-sm transition-colors ${
        checked
          ? "border-primary/40 bg-primary/5 hover:bg-primary/8"
          : "border-border/80 hover:bg-background/80"
      }`}
    >
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => handleLiveChange(e.target.checked)}
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
            Homeward checks these named sources.
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
              them.
            </p>
          )}
        </div>
      </label>

      {onOpenWebSearchChange && (
        <label
          className={`mt-3 flex items-start gap-2.5 rounded-lg border p-2.5 ${
            web.disabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            checked={web.checked}
            disabled={web.disabled}
            onChange={(e) => onOpenWebSearchChange(e.target.checked)}
            className="accent-primary rounded h-4 w-4 mt-0.5 shrink-0"
          />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-foreground">Open web search</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Also look up this child&apos;s timely questions on the open web.
              Every snippet is safety-filtered the same way as weather and
              Wikipedia notes. Homeward will not show raw web pages.
            </p>
            {web.showUnavailable && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open web search isn&apos;t available on this computer right now.
              </p>
            )}
          </div>
        </label>
      )}
    </div>
  );
}
