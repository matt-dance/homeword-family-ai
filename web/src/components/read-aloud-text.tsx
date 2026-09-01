"use client";

import { splitTextForHighlight, activeWordStart } from "@/lib/read-aloud";

interface ReadAloudTextProps {
  text: string;
  charIndex: number | null;
  isActive: boolean;
  className?: string;
}

export function ReadAloudText({ text, charIndex, isActive, className }: ReadAloudTextProps) {
  const parts = splitTextForHighlight(text);
  const activeStart = isActive && charIndex !== null ? activeWordStart(parts, charIndex) : null;

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part.highlightable) {
          return <span key={i}>{part.text}</span>;
        }
        const highlighted = isActive && activeStart === part.start;
        return (
          <span
            key={i}
            className={
              highlighted
                ? "rounded bg-primary/20 text-primary underline decoration-primary/60 decoration-2 underline-offset-4 transition-colors"
                : undefined
            }
          >
            {part.text}
          </span>
        );
      })}
    </span>
  );
}
