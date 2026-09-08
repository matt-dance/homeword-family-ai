"use client";

import { Mic } from "lucide-react";

interface VoiceListenerProps {
  audioLevel: number;
  interimTranscript: string;
  heardSpeech: boolean;
  simpleMode?: boolean;
}

export function VoiceListener({
  audioLevel,
  interimTranscript,
  heardSpeech,
  simpleMode,
}: VoiceListenerProps) {
  const bars = 16;
  const level = Math.max(0.1, audioLevel);

  return (
    <div
      className={`rounded-2xl border border-orange-200/70 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 px-5 py-4 shadow-sm shadow-orange-100 transition-all dark:border-orange-900/40 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-orange-950/30 ${
        simpleMode ? "space-y-3" : "space-y-2"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 h-12">
        <Mic className="h-4 w-4 text-primary mr-1 animate-pulse" />
        {Array.from({ length: bars }).map((_, i) => {
          const center = (bars - 1) / 2;
          const dist = Math.abs(i - center) / center;
          const falloff = Math.cos((dist * Math.PI) / 2);
          const height = Math.min(36, Math.max(6, 6 + level * falloff * (simpleMode ? 32 : 26)));
          return (
            <span
              key={i}
              className="w-1.5 rounded-full accent-gradient transition-[height,opacity] duration-75 ease-out shadow-xs shadow-orange-200/40"
              style={{
                height: `${height}px`,
                opacity: 0.4 + level * 0.6 * falloff,
              }}
            />
          );
        })}
      </div>

      <p
        className={`text-center font-semibold text-primary tracking-tight ${
          simpleMode ? "text-lg" : "text-sm"
        }`}
      >
        {heardSpeech ? "Got it — finishing up…" : "Listening… speak when you're ready"}
      </p>

      {interimTranscript ? (
        <div className="rounded-xl bg-background/80 px-3 py-2 border border-primary/20 text-center">
          <p
            className={`font-medium text-foreground italic ${
              simpleMode ? "text-base" : "text-sm"
            }`}
          >
            &ldquo;{interimTranscript}&rdquo;
          </p>
        </div>
      ) : heardSpeech ? (
        <p className="text-center text-xs text-muted-foreground">
          Picking up your words…
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          I&apos;ll automatically send when you pause speaking
        </p>
      )}
    </div>
  );
}
