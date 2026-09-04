"use client";

interface ConversationIndicatorProps {
  phase: "idle" | "listening" | "transcribing" | "waiting" | "speaking" | "ready";
  simpleMode?: boolean;
  hint?: string | null;
}

const PHASE_LABEL: Record<ConversationIndicatorProps["phase"], string> = {
  idle: "Conversation off",
  ready: "Conversation on — tap the mic or just talk",
  listening: "Conversation on — listening",
  transcribing: "Conversation on — understanding you…",
  waiting: "Conversation on — thinking…",
  speaking: "Conversation on — tap or talk to interrupt",
};

export function ConversationIndicator({ phase, simpleMode, hint }: ConversationIndicatorProps) {
  if (phase === "idle") return null;

  return (
    <div className="space-y-1" aria-live="polite">
      <p
        className={`text-center font-medium text-primary ${
          simpleMode ? "text-sm" : "text-xs"
        }`}
      >
        {PHASE_LABEL[phase]}
      </p>
      {hint ? (
        <p
          className={`text-center font-medium text-amber-700 dark:text-amber-300 ${
            simpleMode ? "text-sm" : "text-xs"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
