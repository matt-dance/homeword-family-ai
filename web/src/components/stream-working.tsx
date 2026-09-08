"use client";

import { Sparkles } from "lucide-react";

export function StreamWorkingBubble({
  status,
  simpleMode,
  onStop,
  showAvatar = true,
}: {
  status: string | null;
  simpleMode: boolean;
  onStop: () => void;
  showAvatar?: boolean;
}) {
  return (
    <div
      className={`flex gap-2.5 justify-start ${showAvatar ? "animate-slide-up" : ""}`}
      aria-live="polite"
      aria-busy="true"
    >
      {showAvatar ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl accent-gradient text-xs font-bold text-primary-foreground shadow-xs animate-pulse">
          <Sparkles className="h-4 w-4" />
        </div>
      ) : null}
      <div
        className={`flex items-center gap-2 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-xs ${
          simpleMode ? "text-base" : "text-sm"
        }`}
      >
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
        </span>
        <span className="pl-1 text-xs font-medium text-muted-foreground">
          {status || "Still working on your answer…"}
        </span>
        <button
          type="button"
          onClick={onStop}
          className="ml-2 rounded-lg px-2 py-0.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

export function StreamComposerHint({
  status,
  simpleMode,
}: {
  status: string | null;
  simpleMode: boolean;
}) {
  return (
    <p
      className={`text-center font-medium text-primary ${
        simpleMode ? "text-sm" : "text-xs"
      }`}
      aria-live="polite"
    >
      {status || "Still working on your answer…"} Tap Stop if you want to ask something else.
    </p>
  );
}
