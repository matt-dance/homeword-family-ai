"use client";

import { splitTextForHighlight } from "@/lib/read-aloud";

interface ReadAloudTextProps {
  text: string;
  wordIndex: number | null;
  isActive: boolean;
  className?: string;
}

export function ReadAloudText({ text, wordIndex, isActive, className }: ReadAloudTextProps) {
  const parts = splitTextForHighlight(text);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.wordIndex === null) {
          return <span key={i}>{part.text}</span>;
        }
        const highlighted = isActive && wordIndex !== null && part.wordIndex === wordIndex;
        const spoken = isActive && wordIndex !== null && part.wordIndex < wordIndex;
        return (
          <span
            key={i}
            className={
              highlighted
                ? "rounded bg-primary/25 text-primary underline decoration-primary decoration-2 underline-offset-4"
                : spoken
                  ? "text-foreground/80"
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
