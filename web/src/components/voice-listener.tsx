"use client";

interface VoiceListenerProps {
  audioLevel: number;
  interimTranscript: string;
  heardSpeech: boolean;
  simpleMode?: boolean;
}

export function VoiceListener({ audioLevel, interimTranscript, heardSpeech, simpleMode }: VoiceListenerProps) {
  const bars = 12;
  const level = Math.max(0.08, audioLevel);

  return (
    <div
      className={`rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 ${
        simpleMode ? "space-y-3" : "space-y-2"
      }`}
    >
      <div className="flex items-center justify-center gap-1 h-10">
        {Array.from({ length: bars }).map((_, i) => {
          const center = (bars - 1) / 2;
          const falloff = 1 - Math.abs(i - center) / center;
          const height = 8 + level * falloff * (simpleMode ? 28 : 22);
          return (
            <span
              key={i}
              className="w-1.5 rounded-full bg-primary transition-[height] duration-75 ease-out"
              style={{ height: `${height}px`, opacity: 0.45 + level * 0.55 * falloff }}
            />
          );
        })}
      </div>

      <p className={`text-center font-medium text-primary ${simpleMode ? "text-base" : "text-sm"}`}>
        {heardSpeech ? "Got it — finishing up…" : "Listening… speak when you're ready"}
      </p>

      {interimTranscript ? (
        <p className={`text-center text-muted-foreground italic ${simpleMode ? "text-base" : "text-sm"}`}>
          &ldquo;{interimTranscript}&rdquo;
        </p>
      ) : heardSpeech ? (
        <p className="text-center text-xs text-muted-foreground">Picking up your words…</p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">I&apos;ll send when you pause</p>
      )}
    </div>
  );
}
