"use client";

interface SpeakingIndicatorProps {
  label?: string;
  simpleMode?: boolean;
}

export function SpeakingIndicator({ label = "Reading aloud…", simpleMode }: SpeakingIndicatorProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-primary ${
        simpleMode ? "text-sm" : "text-xs"
      }`}
      aria-live="polite"
    >
      <VolumeBars />
      <span className="font-medium">{label}</span>
    </div>
  );
}

function VolumeBars() {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary animate-pulse"
          style={{
            height: `${8 + (i % 3) * 4}px`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.9s",
          }}
        />
      ))}
    </span>
  );
}
