"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardShell } from "@/components/chat-tool-shell";
import type { StoryTool } from "@/lib/chat-tools";
import { BookOpen, Play, Square, Volume2 } from "lucide-react";

export function StoryCard({
  tool,
  onSend,
  onSpeak,
  speakSupported,
  isSpeaking,
  speakLoading,
  onPageText,
}: {
  tool: StoryTool;
  onSend?: (message: string) => void;
  onSpeak?: (text: string) => void;
  speakSupported?: boolean;
  isSpeaking?: boolean;
  speakLoading?: boolean;
  onPageText?: (text: string) => void;
}) {
  const pages = Array.isArray(tool.pages) ? tool.pages : [];
  const [index, setIndex] = useState(0);
  const page = pages[index];
  const last = index >= pages.length - 1;
  const pageText = page?.text || "";
  const choices = page?.choices ?? [];

  useEffect(() => {
    onPageText?.(pageText);
  }, [pageText, onPageText]);

  if (!page) return null;

  return (
    <CardShell
      icon={<BookOpen className="h-4 w-4" />}
      title={tool.title || "Story"}
      badge={`Page ${index + 1} of ${pages.length}`}
    >
      <div className="space-y-3.5">
        <p className="text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-wrap">
          {pageText}
        </p>

        {speakSupported && pageText && onSpeak && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 gap-1.5 text-xs font-medium"
            onClick={() => onSpeak(pageText)}
            disabled={speakLoading}
          >
            {isSpeaking ? (
              speakLoading ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 animate-pulse text-primary" />
                  Loading speech…
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5 text-destructive fill-destructive" />
                  Stop reading
                </>
              )
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-primary text-primary" />
                Read this page
              </>
            )}
          </Button>
        )}

        {choices.length > 0 && (
          <div className="flex flex-col gap-2">
            {choices.map((choice) => (
              <Button
                key={`${choice.label}-${choice.message}`}
                variant="outline"
                className="w-full justify-start h-auto py-2.5 px-3 rounded-xl text-left whitespace-normal"
                onClick={() => onSend?.(choice.message)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {index > 0 && (
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setIndex((n) => n - 1)}>
              Back
            </Button>
          )}
          {!last && (
            <Button size="sm" className="rounded-xl" onClick={() => setIndex((n) => n + 1)}>
              Next page
            </Button>
          )}
          {last && choices.length === 0 && onSend && (
            <Button
              size="sm"
              className="rounded-xl"
              onClick={() => onSend("What happens next in the story?")}
            >
              Keep going
            </Button>
          )}
        </div>
      </div>
    </CardShell>
  );
}
