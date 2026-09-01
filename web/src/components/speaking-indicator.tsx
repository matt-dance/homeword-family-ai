"use client";

import { Volume2 } from "lucide-react";

interface SpeakingIndicatorProps {
  label?: string;
  simpleMode?: boolean;
}

export function SpeakingIndicator({
  label = "Reading aloud…",
  simpleMode,
}: SpeakingIndicatorProps) {
  return (
    <div
      className={`inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-primary shadow-sm shadow-primary/10 transition-all ${
        simpleMode ? "text-base py-2 px-4" : "text-xs font-medium"
      }`}
      aria-live="polite"
    >
      <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
      <EqualizerBars />
      <span>{label}</span>
    </div>
  );
}

function EqualizerBars() {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden="true">
      {[12, 18, 10, 16, 14].map((height, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary"
          style={{
            height: `${height}px`,
            animation: `bounce-gentle 0.8s ease-in-out infinite`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}
